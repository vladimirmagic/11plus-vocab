import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import pool from './db.js';
import { initDatabase } from './init-db.js';
import { generateJwt, authMiddleware, adminMiddleware } from './auth.js';
import { seedAchievements } from './seed-achievements.js';
import { recordExercise, recordBonus, checkAchievements, getStreakDays, getDailyTarget, getTodayPoints, getTreeStage } from './gamification.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const clientDist = join(__dirname, '..', 'client', 'dist');
const imagesDir = join(__dirname, '..', 'client', 'dist', 'images');
if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ── Gemini Imagen helper ──
async function generateImageWithImagen(prompt) {
  const apiKey = process.env.GOOGLE_IMAGEN_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_IMAGEN_API_KEY not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' }
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Imagen API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new Error('No image data in Imagen response');
  }

  return Buffer.from(prediction.bytesBase64Encoded, 'base64');
}

// Health
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// ── Auth config (public) ──
app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
  });
});

// ── Auth (Google OAuth) ──
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided' });

    // Verify the Google ID token
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid Google token' });

    const payload = await verifyRes.json();
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    const { email, name, picture } = payload;
    if (!email) return res.status(400).json({ error: 'No email in Google token' });

    // Create or update user by email
    // First check if user with this email exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(`
        UPDATE users SET
          name = COALESCE(NULLIF($2, ''), name),
          avatar_url = COALESCE($3, avatar_url)
        WHERE email = $1
        RETURNING id, name, email, avatar_url, role, voice_preference
      `, [email, name, picture || null]);
    } else {
      // New user — ensure name doesn't conflict with existing name-only users
      let displayName = name || email.split('@')[0];
      const nameCheck = await pool.query('SELECT id FROM users WHERE name = $1', [displayName]);
      if (nameCheck.rows.length > 0) {
        displayName = `${displayName} (${email.split('@')[0]})`;
      }
      result = await pool.query(`
        INSERT INTO users (name, email, avatar_url)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, avatar_url, role, voice_preference
      `, [displayName, email, picture || null]);
    }

    const user = result.rows[0];
    const token = generateJwt(user);
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ── Auth (Name only — local dev) ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required (at least 2 characters)' });

    const result = await pool.query(`
      INSERT INTO users (name)
      VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET name = users.name
      RETURNING id, name, email, avatar_url, role
    `, [name.trim()]);

    const user = result.rows[0];
    const token = generateJwt(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, role: user.role, voice_preference: user.voice_preference } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, avatar_url, role, voice_preference FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

app.put('/api/auth/voice', authMiddleware, async (req, res) => {
  try {
    const { voice } = req.body;
    await pool.query('UPDATE users SET voice_preference = $1 WHERE id = $2', [voice || null, req.user.userId]);
    res.json({ voice_preference: voice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save voice preference' });
  }
});

// ── Words ──
app.get('/api/words', async (req, res) => {
  try {
    const { search, category, limit = 200, offset = 0 } = req.query;
    let query = 'SELECT * FROM words WHERE approved = true';
    const params = [];
    let idx = 1;
    if (search) { query += ` AND (word ILIKE $${idx} OR definition ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (category) { query += ` AND category = $${idx}`; params.push(category); idx++; }
    query += ` ORDER BY word ASC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM words WHERE approved = true');
    res.json({ words: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    console.error('Words error:', err);
    res.status(500).json({ error: 'Failed to fetch words' });
  }
});

app.get('/api/words/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category, COUNT(*)::int as count FROM words WHERE approved = true AND category IS NOT NULL GROUP BY category ORDER BY category');
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/words/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    res.json({ word: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch word' });
  }
});

app.get('/api/words/:id/clusters', async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    const word = wordResult.rows[0];
    const allRelated = [...(word.synonyms || []), ...(word.antonyms || [])];
    let relatedWords = [];
    if (allRelated.length > 0) {
      const ph = allRelated.map((_, i) => `$${i + 1}`).join(',');
      const relResult = await pool.query(
        `SELECT id, word, definition, synonyms, antonyms, visual_emoji FROM words WHERE LOWER(word) IN (${ph}) AND approved = true`,
        allRelated.map(w => w.toLowerCase())
      );
      relatedWords = relResult.rows;
    }
    res.json({
      center: { id: word.id, word: word.word, definition: word.definition, visual_emoji: word.visual_emoji },
      synonyms: relatedWords.filter(r => (word.synonyms || []).map(s => s.toLowerCase()).includes(r.word.toLowerCase())),
      antonyms: relatedWords.filter(r => (word.antonyms || []).map(a => a.toLowerCase()).includes(r.word.toLowerCase())),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// ── Progress ──
app.get('/api/progress', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, w.word, w.definition, w.visual_emoji, w.category FROM progress p JOIN words w ON p.word_id = w.id WHERE p.user_id = $1 ORDER BY p.last_practiced DESC NULLS LAST`,
      [req.user.userId]
    );
    res.json({ progress: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

app.get('/api/progress/stats', authMiddleware, async (req, res) => {
  try {
    const totalWords = await pool.query('SELECT COUNT(*)::int FROM words WHERE approved = true');
    const userProgress = await pool.query('SELECT status, COUNT(*)::int as count FROM progress WHERE user_id = $1 GROUP BY status', [req.user.userId]);
    const todayPracticed = await pool.query('SELECT COUNT(*)::int FROM progress WHERE user_id = $1 AND last_practiced >= CURRENT_DATE', [req.user.userId]);
    const stats = { new: 0, learning: 0, mastered: 0 };
    userProgress.rows.forEach(r => { stats[r.status] = r.count; });
    res.json({
      totalWords: totalWords.rows[0].count,
      ...stats,
      practicedToday: todayPracticed.rows[0].count,
      notStarted: totalWords.rows[0].count - stats.new - stats.learning - stats.mastered,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.put('/api/progress/:wordId', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'learning', 'mastered'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query(`
      INSERT INTO progress (user_id, word_id, status, times_practiced, last_practiced)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_id, word_id) DO UPDATE SET status = $3, times_practiced = progress.times_practiced + 1, last_practiced = NOW()
      RETURNING *
    `, [req.user.userId, req.params.wordId, status]);
    res.json({ progress: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ── Games ──
app.get('/api/games/matching', async (req, res) => {
  try {
    const { count = 8, category } = req.query;
    let query = 'SELECT id, word, definition, visual_emoji FROM words WHERE approved = true';
    const params = [];
    if (category) { query += ' AND category = $1'; params.push(category); }
    query += ` ORDER BY RANDOM() LIMIT $${params.length + 1}`;
    params.push(parseInt(count));
    const result = await pool.query(query, params);
    res.json({ words: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch game words' });
  }
});

app.post('/api/games/validate-sentence', authMiddleware, async (req, res) => {
  try {
    const { wordId, sentence } = req.body;
    if (!wordId || !sentence) return res.status(400).json({ error: 'wordId and sentence required' });
    const wordResult = await pool.query('SELECT word, definition FROM words WHERE id = $1', [wordId]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    const word = wordResult.rows[0];
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: `You are a friendly English teacher for 9-10 year old students preparing for the 11 Plus exam.\n\nA student has written a sentence using the word "${word.word}" (meaning: ${word.definition}).\n\nTheir sentence: "${sentence}"\n\nEvaluate:\n1. Is the word used correctly in context?\n2. Is the grammar correct?\n3. Does the sentence make sense?\n\nIMPORTANT: In your feedback and suggestion, do NOT provide example sentences that include the word "${word.word}". Give general tips only.\n\nRespond in JSON format:\n{"correct": true/false, "feedback": "One short, encouraging sentence of feedback for a 9 year old", "suggestion": "If incorrect, a gentle suggestion without example sentences. If correct, null"}` }]
    });
    const text = msg.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { correct: false, feedback: 'Could not evaluate sentence', suggestion: 'Please try again' };
    res.json(result);
  } catch (err) {
    console.error('Validate sentence error:', err);
    res.status(500).json({ error: 'Failed to validate sentence' });
  }
});

// ── Prompts Config ──
const PROMPTS_FILE = join(__dirname, 'prompts-config.json');

function getDefaultPrompts() {
  return {
    freewrite_evaluate: `You are a friendly, encouraging English teacher for a 9-10 year old student preparing for the 11 Plus exam.

The student is practicing using the word "{{word}}" (meaning: {{definition}}).
This is their attempt #{{attemptNumber}} for this word.

Their sentence: "{{sentence}}"

Evaluate:
1. Is the word used correctly in context?
2. Is the grammar correct?
3. Does the sentence show understanding of the word?

Be encouraging but honest. IMPORTANT: In your feedback and suggestion, do NOT write example sentences that include the word "{{word}}".

Respond in JSON:
{"correct": true/false, "feedback": "2-3 sentences of encouraging feedback", "suggestion": "A tip WITHOUT example sentences containing the word. If great, null", "points": <+20 correct, +30 excellent, -5 incorrect, +10 partial>}`,

    validate_sentence: `You are a friendly English teacher for 9-10 year old students preparing for the 11 Plus exam.

A student has written a sentence using the word "{{word}}" (meaning: {{definition}}).

Their sentence: "{{sentence}}"

Evaluate: Is the word used correctly? Is the grammar correct? Does it make sense?

IMPORTANT: Do NOT provide example sentences that include the word "{{word}}".

Respond in JSON:
{"correct": true/false, "feedback": "One short encouraging sentence", "suggestion": "If incorrect, a gentle tip without examples. If correct, null"}`,

    text_prompt: `You are helping a 10-year-old student practice vocabulary for the UK 11+ exam.

The word is: "{{word}}" ({{definition}})

Write a simple, short scenario in EXACTLY 3 sentences maximum. Describe a situation where the word "{{word}}" would be the perfect word to use. Do NOT use the word "{{word}}" anywhere. Keep it very simple — a 9-year-old must easily understand it.

Return ONLY the scenario text, nothing else.`,

    generate_word: `You are creating vocabulary content for 9-10 year old students studying for the 11 Plus exam.

For the word "{{word}}", generate:
1. A clear, simple definition suitable for a 9-10 year old
2. An example sentence a child might encounter
3. A teacher's tip about common mistakes
4. 2-4 synonyms (simpler words preferred)
5. 1-3 antonyms
6. A category (adjectives/verbs/nouns/adverbs/emotions/character/academic/nature/relationships)
7. Difficulty 1-3
8. A single emoji
9. Three visual anchors - each is an emoji + a vivid one-sentence scene

Respond in JSON:
{"definition":"...","example_sentence":"...","teacher_tip":"...","synonyms":["..."],"antonyms":["..."],"category":"...","difficulty":1,"visual_emoji":"...","visual_anchors":[{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."}]}`,
  };
}

function loadPrompts() {
  try {
    if (existsSync(PROMPTS_FILE)) {
      const saved = JSON.parse(readFileSync(PROMPTS_FILE, 'utf-8'));
      const defaults = getDefaultPrompts();
      return { ...defaults, ...saved };
    }
  } catch {}
  return getDefaultPrompts();
}

let promptsConfig = loadPrompts();

function getPrompt(key, vars) {
  let tmpl = promptsConfig[key] || getDefaultPrompts()[key] || '';
  for (const [k, v] of Object.entries(vars)) {
    tmpl = tmpl.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
  }
  return tmpl;
}

app.get('/api/prompts', authMiddleware, (req, res) => {
  res.json(promptsConfig);
});

app.put('/api/prompts', authMiddleware, (req, res) => {
  try {
    promptsConfig = { ...getDefaultPrompts(), ...req.body };
    writeFileSync(PROMPTS_FILE, JSON.stringify(promptsConfig, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save prompts' });
  }
});

app.post('/api/prompts/reset', authMiddleware, (req, res) => {
  promptsConfig = getDefaultPrompts();
  try { if (existsSync(PROMPTS_FILE)) unlinkSync(PROMPTS_FILE); } catch {}
  res.json(promptsConfig);
});

// ── Find or Create Word ──
app.post('/api/words/find-or-create', authMiddleware, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || !word.trim()) return res.status(400).json({ error: 'word required' });
    const clean = word.trim().toLowerCase();

    // Check if exists
    const existing = await pool.query('SELECT * FROM words WHERE LOWER(word) = $1 AND approved = true', [clean]);
    if (existing.rows.length > 0) {
      return res.json({ word: existing.rows[0], created: false });
    }

    // Generate with AI
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `You are creating vocabulary content for 9-10 year old students studying for the 11 Plus exam.\n\nFor the word "${clean}", generate:\n1. A clear, simple definition suitable for a 9-10 year old\n2. An example sentence a child might encounter\n3. A teacher's tip about common mistakes or subtle usage\n4. 2-4 synonyms (simpler words preferred)\n5. 1-3 antonyms\n6. A category (one of: adjectives, verbs, nouns, adverbs, emotions, character, academic, nature, relationships)\n7. Difficulty 1-3 (1=common, 2=intermediate, 3=advanced)\n8. A single emoji that represents the word\n9. Three "visual anchors" - each is an emoji + a vivid one-sentence scene\n\nRespond in JSON:\n{"definition":"...","example_sentence":"...","teacher_tip":"...","synonyms":["..."],"antonyms":["..."],"category":"...","difficulty":1,"visual_emoji":"...","visual_anchors":[{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."}]}` }]
    });
    const text = msg.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to generate word content' });

    const gen = JSON.parse(jsonMatch[0]);
    const insertResult = await pool.query(`
      INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
      ON CONFLICT (word) DO UPDATE SET
        definition = EXCLUDED.definition,
        example_sentence = EXCLUDED.example_sentence,
        teacher_tip = EXCLUDED.teacher_tip,
        synonyms = EXCLUDED.synonyms,
        antonyms = EXCLUDED.antonyms,
        category = EXCLUDED.category,
        difficulty = EXCLUDED.difficulty,
        visual_emoji = EXCLUDED.visual_emoji,
        visual_anchors = EXCLUDED.visual_anchors,
        approved = true
      RETURNING *
    `, [clean, gen.definition, gen.example_sentence, gen.teacher_tip, gen.synonyms || [], gen.antonyms || [], gen.category, gen.difficulty || 1, gen.visual_emoji, JSON.stringify(gen.visual_anchors || [])]);

    res.json({ word: insertResult.rows[0], created: true });
  } catch (err) {
    console.error('Find or create word error:', err);
    res.status(500).json({ error: 'Failed to find or create word' });
  }
});

// ── Free Write Attempts ──
app.get('/api/freewrite/:wordId', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM free_write_attempts WHERE user_id = $1 AND word_id = $2 ORDER BY attempt_number ASC',
      [req.user.userId, req.params.wordId]
    );
    res.json({ attempts: result.rows });
  } catch (err) {
    console.error('Fetch attempts error:', err);
    res.status(500).json({ error: 'Failed to fetch attempts' });
  }
});

app.post('/api/freewrite/:wordId', authMiddleware, async (req, res) => {
  try {
    const { sentence } = req.body;
    if (!sentence || !sentence.trim()) return res.status(400).json({ error: 'sentence required' });

    const wordId = parseInt(req.params.wordId);
    const wordResult = await pool.query('SELECT word, definition FROM words WHERE id = $1', [wordId]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    const word = wordResult.rows[0];

    // Get attempt number
    const countResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM free_write_attempts WHERE user_id = $1 AND word_id = $2',
      [req.user.userId, wordId]
    );
    const attemptNumber = parseInt(countResult.rows[0].cnt) + 1;

    // Validate with Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are a friendly, encouraging English teacher for a 9-10 year old student preparing for the 11 Plus exam.

The student is practicing using the word "${word.word}" (meaning: ${word.definition}).
This is their attempt #${attemptNumber} for this word.

Their sentence: "${sentence.trim()}"

Evaluate:
1. Is the word used correctly in context?
2. Is the grammar correct?
3. Does the sentence show understanding of the word?
4. Is this an improvement over what a typical attempt might look like?

Be encouraging but honest. If this is attempt #${attemptNumber}, acknowledge their persistence.

IMPORTANT: In your feedback and suggestion, do NOT write example sentences that include the word "${word.word}". The student must come up with their own sentence. You can give general tips about sentence structure or meaning, but never give away example answers.

Respond in JSON:
{"correct": true/false, "feedback": "2-3 sentences of encouraging, specific feedback for a 9 year old", "suggestion": "If not perfect, a specific tip WITHOUT example sentences containing the word. If great, null", "points": <number: +20 for correct use, +30 for excellent creative use, -5 for incorrect use, +10 for partially correct>}` }]
    });
    const text = msg.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { correct: false, feedback: 'Could not evaluate', suggestion: 'Please try again', points: 0 };

    // Save attempt
    const insertResult = await pool.query(
      `INSERT INTO free_write_attempts (user_id, word_id, sentence, correct, feedback, suggestion, points, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.userId, wordId, sentence.trim(), result.correct, result.feedback, result.suggestion, result.points || 0, attemptNumber]
    );

    // Record points
    if (result.points && result.points !== 0) {
      await pool.query(
        'INSERT INTO point_events (user_id, points, reason) VALUES ($1, $2, $3)',
        [req.user.userId, result.points, 'freewrite_' + (result.correct ? 'correct' : 'attempt')]
      );
    }

    // Also record in exercise_history for gamification
    const { randomUUID } = await import('crypto');
    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO exercise_history (user_id, word_id, exercise_type, correct, points_earned, session_id, metadata)
       VALUES ($1, $2, 'freewrite', $3, $4, $5, $6)`,
      [req.user.userId, wordId, result.correct, result.points || 0, sessionId, JSON.stringify({ sentence: sentence.trim(), attempt: attemptNumber })]
    );

    res.json({
      attempt: insertResult.rows[0],
      ...result,
      attemptNumber,
    });
  } catch (err) {
    console.error('Free write error:', err);
    res.status(500).json({ error: 'Failed to process sentence' });
  }
});

// ── Admin ──
app.get('/api/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM words WHERE approved = false ORDER BY created_at DESC');
    res.json({ words: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending words' });
  }
});

app.post('/api/admin/approve/:wordId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('UPDATE words SET approved = true WHERE id = $1 RETURNING *', [req.params.wordId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    res.json({ word: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve word' });
  }
});

app.post('/api/admin/words', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors } = req.body;
    if (!word || !definition) return res.status(400).json({ error: 'word and definition required' });
    const result = await pool.query(`
      INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      ON CONFLICT (word) DO UPDATE SET definition=EXCLUDED.definition, example_sentence=EXCLUDED.example_sentence, teacher_tip=EXCLUDED.teacher_tip, synonyms=EXCLUDED.synonyms, antonyms=EXCLUDED.antonyms, category=EXCLUDED.category, difficulty=EXCLUDED.difficulty, visual_emoji=EXCLUDED.visual_emoji, visual_anchors=EXCLUDED.visual_anchors
      RETURNING *
    `, [word, definition, example_sentence, teacher_tip, synonyms || [], antonyms || [], category, difficulty || 1, visual_emoji, JSON.stringify(visual_anchors || [])]);
    res.json({ word: result.rows[0] });
  } catch (err) {
    console.error('Add word error:', err);
    res.status(500).json({ error: 'Failed to add word' });
  }
});

app.put('/api/admin/words/:wordId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors } = req.body;
    const result = await pool.query(`
      UPDATE words SET word=COALESCE($2,word), definition=COALESCE($3,definition), example_sentence=COALESCE($4,example_sentence),
        teacher_tip=COALESCE($5,teacher_tip), synonyms=COALESCE($6,synonyms), antonyms=COALESCE($7,antonyms),
        category=COALESCE($8,category), difficulty=COALESCE($9,difficulty), visual_emoji=COALESCE($10,visual_emoji),
        visual_anchors=COALESCE($11,visual_anchors)
      WHERE id = $1 RETURNING *
    `, [req.params.wordId, word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors ? JSON.stringify(visual_anchors) : null]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    res.json({ word: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update word' });
  }
});

app.delete('/api/admin/words/:wordId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM words WHERE id = $1 RETURNING id', [req.params.wordId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete word' });
  }
});

app.post('/api/admin/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'word required' });
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `You are creating vocabulary content for 9-10 year old students studying for the 11 Plus exam.\n\nFor the word "${word}", generate:\n1. A clear, simple definition suitable for a 9-10 year old\n2. An example sentence a child might encounter\n3. A teacher's tip about common mistakes or subtle usage\n4. 2-4 synonyms (simpler words preferred)\n5. 1-3 antonyms\n6. A category (one of: adjectives, verbs, nouns, adverbs, emotions, character, academic, nature, relationships)\n7. Difficulty 1-3 (1=common, 2=intermediate, 3=advanced)\n8. A single emoji that represents the word\n9. Three "visual anchors" - each is an emoji + a vivid one-sentence scene\n\nRespond in JSON:\n{"definition":"...","example_sentence":"...","teacher_tip":"...","synonyms":["..."],"antonyms":["..."],"category":"...","difficulty":1,"visual_emoji":"...","visual_anchors":[{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."}]}` }]
    });
    const text = msg.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' });
    res.json({ word, ...JSON.parse(jsonMatch[0]) });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

const uploadHandler = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/admin/upload', authMiddleware, adminMiddleware, uploadHandler.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let text = '';
    if (req.file.mimetype === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      text = req.file.buffer.toString('utf-8');
    }
    if (!text.trim()) return res.status(400).json({ error: 'No text content found' });
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: `You are a vocabulary extraction expert for the 11 Plus exam (UK, ages 9-10).\n\nFrom the following text, extract vocabulary words useful for 11 Plus preparation. Focus on words that appear in 11+ verbal reasoning, academic vocabulary, and words a 9-10 year old should learn.\n\nText:\n---\n${text.substring(0, 8000)}\n---\n\nRespond as JSON array (max 20 words):\n[{"word":"...","definition":"...","example_sentence":"...","teacher_tip":"...","synonyms":["..."],"antonyms":["..."],"category":"adjectives|verbs|nouns|adverbs|emotions|character|academic|nature|relationships","difficulty":1,"visual_emoji":"...","visual_anchors":[{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."}]}]` }]
    });
    const responseText = msg.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' });
    const extractedWords = JSON.parse(jsonMatch[0]);
    for (const w of extractedWords) {
      await pool.query(`
        INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) ON CONFLICT (word) DO NOTHING
      `, [w.word, w.definition, w.example_sentence, w.teacher_tip, w.synonyms || [], w.antonyms || [], w.category, w.difficulty || 1, w.visual_emoji, JSON.stringify(w.visual_anchors || [])]);
    }
    await pool.query('INSERT INTO uploads (user_id, filename, words_extracted) VALUES ($1,$2,$3)', [req.user.userId, req.file.originalname, extractedWords.length]);
    res.json({ extracted: extractedWords.length, words: extractedWords });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// ── Add synonym/antonym (auto-creates missing words) ──
app.post('/api/words/:id/add-related', authMiddleware, async (req, res) => {
  try {
    const { word: newWord, type } = req.body; // type: 'synonym' or 'antonym'
    if (!newWord || !type) return res.status(400).json({ error: 'word and type required' });
    if (!['synonym', 'antonym'].includes(type)) return res.status(400).json({ error: 'type must be synonym or antonym' });

    const clean = newWord.trim().toLowerCase();
    if (!clean) return res.status(400).json({ error: 'empty word' });

    // Get the source word
    const srcResult = await pool.query('SELECT * FROM words WHERE id = $1', [req.params.id]);
    if (srcResult.rows.length === 0) return res.status(404).json({ error: 'Source word not found' });
    const srcWord = srcResult.rows[0];

    // Add to source word's synonym/antonym array
    const col = type === 'synonym' ? 'synonyms' : 'antonyms';
    const existing = srcWord[col] || [];
    if (existing.map(w => w.toLowerCase()).includes(clean)) {
      return res.json({ message: 'Already exists', created: false });
    }
    await pool.query(
      `UPDATE words SET ${col} = array_append(${col}, $1) WHERE id = $2`,
      [clean, req.params.id]
    );

    // Check if the word exists in database
    const existCheck = await pool.query('SELECT id FROM words WHERE LOWER(word) = $1', [clean]);
    let created = false;
    let generatedWord = null;

    if (existCheck.rows.length === 0) {
      // Word doesn't exist — generate it with AI
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic();
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `You are creating vocabulary content for 9-10 year old students studying for the 11 Plus exam (UK).

For the word "${clean}", generate vocabulary content. This word was added as a ${type} of "${srcWord.word}".

Generate:
1. A clear, simple definition suitable for a 9-10 year old
2. An example sentence a child might encounter
3. A teacher's tip about common mistakes or subtle usage
4. 2-4 synonyms (must include "${srcWord.word}" since it's a ${type === 'synonym' ? 'synonym' : 'related word'})
5. 1-3 antonyms${type === 'antonym' ? ` (must include "${srcWord.word}")` : ''}
6. A category (one of: adjectives, verbs, nouns, adverbs, emotions, character, academic, nature, relationships)
7. Difficulty 1-3 (1=common, 2=intermediate, 3=advanced)
8. A single emoji that represents the word
9. Three "visual anchors" - each is an emoji + a vivid one-sentence scene

Respond in JSON only:
{"definition":"...","example_sentence":"...","teacher_tip":"...","synonyms":["..."],"antonyms":["..."],"category":"...","difficulty":1,"visual_emoji":"...","visual_anchors":[{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."},{"emoji":"...","scene":"..."}]}` }]
        });
        const text = msg.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const gen = JSON.parse(jsonMatch[0]);
          await pool.query(`
            INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) ON CONFLICT (word) DO NOTHING
          `, [clean, gen.definition, gen.example_sentence, gen.teacher_tip, gen.synonyms || [], gen.antonyms || [], gen.category, gen.difficulty || 1, gen.visual_emoji, JSON.stringify(gen.visual_anchors || [])]);
          created = true;
          generatedWord = { word: clean, ...gen };
        }
      } catch (aiErr) {
        console.error('AI generation error for related word:', aiErr.message);
        // Still succeed — the synonym/antonym was added, just not auto-generated
      }
    } else {
      // Word exists — add reverse link
      const reverseCol = type === 'synonym' ? 'synonyms' : 'antonyms';
      const reverseWord = srcWord.word.toLowerCase();
      await pool.query(
        `UPDATE words SET ${reverseCol} = array_append(${reverseCol}, $1) WHERE LOWER(word) = $2 AND NOT ($1 = ANY(${reverseCol}))`,
        [reverseWord, clean]
      );
    }

    res.json({
      message: `Added ${clean} as ${type}`,
      created,
      generatedWord,
    });
  } catch (err) {
    console.error('Add related error:', err);
    res.status(500).json({ error: 'Failed to add related word' });
  }
});

// ── Image Generation for Visual Anchors ──
app.post('/api/words/:id/generate-images', async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    let anchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];

    // Already generated? Return cached
    if (anchors.length > 0 && anchors.every(a => a.image_url)) {
      return res.json({ word: word.word, visual_anchors: anchors });
    }

    // Generate images via Gemini Imagen (only for anchors missing image_url)
    let anyGenerated = false;
    for (let idx = 0; idx < anchors.length; idx++) {
      const anchor = anchors[idx];
      if (anchor.image_url) continue; // Already generated, skip
      const prompt = `Watercolor illustration for children, soft pastel colors, whimsical style. The word "${word.word}" is illustrated: ${anchor.scene}. Include the word "${word.word}" written in friendly handwritten text in the image.`;

      try {
        const imageBuffer = await generateImageWithImagen(prompt);
        const filename = `word-${word.id}-anchor-${idx}.png`;
        const filepath = join(imagesDir, filename);
        writeFileSync(filepath, imageBuffer);
        anchors[idx] = { ...anchor, image_url: `/images/${filename}` };
        anyGenerated = true;
        console.log(`Generated Imagen image for word ${word.id} anchor ${idx}`);
      } catch (err) {
        console.log(`Imagen generation failed for word ${word.id} anchor ${idx}: ${err.message}`);
        // Continue with remaining anchors instead of breaking
      }
    }

    // Save to DB if any images were generated
    if (anyGenerated) {
      await pool.query('UPDATE words SET visual_anchors = $1 WHERE id = $2', [JSON.stringify(anchors), word.id]);
    }

    res.json({ word: word.word, visual_anchors: anchors });
  } catch (err) {
    console.error('Generate images error:', err);
    res.status(500).json({ error: 'Failed to generate images' });
  }
});

// ── Generate Single Anchor Image ──
app.post('/api/words/:id/generate-single-anchor', async (req, res) => {
  try {
    const { anchorIndex } = req.body;
    if (anchorIndex === undefined) return res.status(400).json({ error: 'anchorIndex required' });

    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    let anchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];
    if (anchorIndex >= anchors.length) return res.status(400).json({ error: 'Invalid anchor index' });

    const anchor = anchors[anchorIndex];
    const prompt = `Watercolor illustration for children, soft pastel colors, whimsical style: ${anchor.scene}`;

    const imageBuffer = await generateImageWithImagen(prompt);
    const filename = `word-${word.id}-anchor-${anchorIndex}-${Date.now()}.png`;
    const filepath = join(imagesDir, filename);
    writeFileSync(filepath, imageBuffer);

    anchors[anchorIndex] = { ...anchor, image_url: `/images/${filename}` };
    await pool.query('UPDATE words SET visual_anchors = $1 WHERE id = $2', [JSON.stringify(anchors), word.id]);

    console.log(`Generated single anchor image for word ${word.id} anchor ${anchorIndex}`);
    res.json({ image_url: `/images/${filename}` });
  } catch (err) {
    console.error('Generate single anchor error:', err);
    res.status(500).json({ error: 'Failed to generate image: ' + err.message });
  }
});

// ── Generate Picture Hint ──
app.post('/api/words/:id/picture-hint', authMiddleware, async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    const filename = `hint-${word.id}.png`;
    const filepath = join(imagesDir, filename);
    const imageUrl = `/images/${filename}`;

    // Return cached if exists
    if (existsSync(filepath)) {
      return res.json({ image_url: imageUrl });
    }

    const prompt = `A vivid, colourful children's book illustration that captures the meaning of the word "${word.word}" (${word.definition}). Friendly, whimsical watercolour style, no text or words in the image.`;
    const imageBuffer = await generateImageWithImagen(prompt);
    writeFileSync(filepath, imageBuffer);
    console.log(`Generated picture hint for word "${word.word}"`);

    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error('Picture hint error:', err);
    res.status(500).json({ error: 'Failed to generate picture hint' });
  }
});

// ── Text Prompt: generate a situation description ──
app.post('/api/words/:id/text-prompt', authMiddleware, async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    const profileCtx = await getProfileContext(req.user.userId);
    const personalisation = profileCtx
      ? `\n\nThe student's interests: ${profileCtx}\nTry to relate the scenario to their interests when possible.`
      : '';

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      messages: [{ role: 'user', content: `You are helping a 10-year-old student practice vocabulary for the UK 11+ exam.

The word is: "${word.word}" (${word.definition})${personalisation}

Write a simple, short scenario in EXACTLY 3 sentences maximum. Describe a situation where the word "${word.word}" would be the perfect word to use. Do NOT use the word "${word.word}" anywhere. Keep it very simple — a 9-year-old must easily understand it. Use short, clear sentences.

Return ONLY the scenario text, nothing else.` }],
    });

    const scenario = msg.content[0]?.text?.trim() || '';
    res.json({ scenario });
  } catch (err) {
    console.error('Text prompt error:', err);
    res.status(500).json({ error: 'Failed to generate text prompt' });
  }
});

// ── Picture Prompt: generate a scene image ──
app.post('/api/words/:id/picture-prompt', authMiddleware, async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];

    // First generate a scene description with Claude
    const profileCtx = await getProfileContext(req.user.userId);
    const personalisation = profileCtx
      ? ` Relate the scene to the student's interests if possible: ${profileCtx}`
      : '';

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: `Describe a vivid visual scene (one sentence, max 20 words) that perfectly illustrates the meaning of the word "${word.word}" (${word.definition}). The scene should be suitable for a children's illustration.${personalisation} Return ONLY the scene description.` }],
    });

    const sceneDescription = msg.content[0]?.text?.trim() || '';

    // Generate the image
    const filename = `prompt-${word.id}-${Date.now()}.png`;
    const filepath = join(imagesDir, filename);
    const imageUrl = `/images/${filename}`;

    const imagePrompt = `A detailed, colourful children's book illustration: ${sceneDescription}. Vivid watercolour style, expressive characters, rich details to describe, no text or words in the image.`;
    const imageBuffer = await generateImageWithImagen(imagePrompt);
    writeFileSync(filepath, imageBuffer);
    console.log(`Generated picture prompt for word "${word.word}": ${sceneDescription}`);

    res.json({ image_url: imageUrl, scene: sceneDescription });
  } catch (err) {
    console.error('Picture prompt error:', err);
    res.status(500).json({ error: 'Failed to generate picture prompt' });
  }
});

// ── Related Words Matching Game ──
app.post('/api/words/:id/related-match', authMiddleware, async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    const relatedIds = new Set([word.id]);
    const related = [{ id: word.id, word: word.word, definition: word.definition }];

    // 1. Synonyms & antonyms
    const allRelated = [...(word.synonyms || []), ...(word.antonyms || [])];
    if (allRelated.length > 0) {
      const synResult = await pool.query(
        'SELECT id, word, definition FROM words WHERE approved = true AND word = ANY($1)',
        [allRelated]
      );
      for (const r of synResult.rows) {
        if (!relatedIds.has(r.id)) { relatedIds.add(r.id); related.push(r); }
      }
    }

    // 2. Same category words
    if (related.length < 8 && word.category) {
      const catResult = await pool.query(
        'SELECT id, word, definition FROM words WHERE approved = true AND category = $1 AND id != $2 ORDER BY RANDOM() LIMIT $3',
        [word.category, word.id, 8 - related.length]
      );
      for (const r of catResult.rows) {
        if (!relatedIds.has(r.id)) { relatedIds.add(r.id); related.push(r); }
      }
    }

    // 3. Similar sounding/written words (fuzzy match on first 3 chars or same length ±1)
    if (related.length < 8) {
      const prefix = word.word.slice(0, 3);
      const simResult = await pool.query(
        `SELECT id, word, definition FROM words WHERE approved = true AND id != $1 AND (
          word ILIKE $2 OR ABS(LENGTH(word) - LENGTH($3)) <= 1
        ) ORDER BY RANDOM() LIMIT $4`,
        [word.id, prefix + '%', word.word, 8 - related.length]
      );
      for (const r of simResult.rows) {
        if (!relatedIds.has(r.id)) { relatedIds.add(r.id); related.push(r); }
      }
    }

    // 4. Fill remaining with random words
    if (related.length < 6) {
      const ids = Array.from(relatedIds);
      const fillResult = await pool.query(
        `SELECT id, word, definition FROM words WHERE approved = true AND id != ALL($1) ORDER BY RANDOM() LIMIT $2`,
        [ids, 6 - related.length]
      );
      for (const r of fillResult.rows) {
        if (!relatedIds.has(r.id)) { relatedIds.add(r.id); related.push(r); }
      }
    }

    // Cap at 8
    res.json({ words: related.slice(0, 8) });
  } catch (err) {
    console.error('Related match error:', err);
    res.status(500).json({ error: 'Failed to fetch related words' });
  }
});

// ── Save Favorite Anchor ──
app.put('/api/progress/:wordId/favorite', authMiddleware, async (req, res) => {
  try {
    const { anchor } = req.body;
    if (anchor === undefined || anchor < 0 || anchor > 2) return res.status(400).json({ error: 'anchor must be 0, 1, or 2' });

    const result = await pool.query(`
      INSERT INTO progress (user_id, word_id, status, times_practiced, favorite_anchor)
      VALUES ($1, $2, 'new', 0, $3)
      ON CONFLICT (user_id, word_id) DO UPDATE SET favorite_anchor = $3
      RETURNING *
    `, [req.user.userId, req.params.wordId, anchor]);

    res.json({ progress: result.rows[0] });
  } catch (err) {
    console.error('Save favorite error:', err);
    res.status(500).json({ error: 'Failed to save favorite' });
  }
});

// ── Book Quotes for a Word ──
app.get('/api/words/:id/quotes', async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];

    // Return cached quotes if we have exactly 5
    const cached = Array.isArray(word.quotes) ? word.quotes : [];
    if (cached.length === 5) {
      return res.json({ quotes: cached });
    }

    // Try to get profile context from auth header
    let profileCtx = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const jwt = await import('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
        profileCtx = await getProfileContext(decoded.userId);
      }
    } catch {}

    const favouriteBooks = profileCtx && profileCtx.includes('Favourite books:')
      ? profileCtx.match(/Favourite books: ([^.]+)/)?.[1] || ''
      : '';
    const bookSuggestions = favouriteBooks
      ? `Use these books if possible: ${favouriteBooks}. Fill remaining slots from: Harry Potter, Matilda, Charlie and the Chocolate Factory, The BFG, Narnia, Percy Jackson, Diary of a Wimpy Kid, Tom Gates, etc.`
      : `One MUST be from Harry Potter\n- Others from books like: Matilda, Charlie and the Chocolate Factory, The BFG, Narnia, Percy Jackson, Diary of a Wimpy Kid, Tom Gates, etc.`;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Create exactly 5 short example sentences using the word "${word.word}" (meaning: ${word.definition}) as if they come from famous children's books. Each sentence should sound like it belongs in that book's world and use the word naturally.

Rules:
- ${bookSuggestions}
- Keep sentences short (1-2 sentences max) and suitable for 9-10 year olds
- The word must be used correctly in context
- Return EXACTLY 5 quotes

Respond as JSON array:
[{"book":"Harry Potter","author":"J.K. Rowling","quote":"..."},{"book":"...","author":"...","quote":"..."}]` }]
    });

    const text = msg.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to generate quotes' });

    const quotes = JSON.parse(jsonMatch[0]);

    // Only cache if we got exactly 5 valid quotes
    if (Array.isArray(quotes) && quotes.length === 5 && quotes.every(q => q.book && q.author && q.quote)) {
      await pool.query('UPDATE words SET quotes = $1 WHERE id = $2', [JSON.stringify(quotes), word.id]);
    }

    res.json({ quotes });
  } catch (err) {
    console.error('Quotes error:', err);
    res.status(500).json({ error: 'Failed to generate quotes' });
  }
});

// ── Text-to-Speech via Google Cloud ──
let cachedVoices = null;

// Curated British voices with natural human names
const VOICE_NAMES = {
  'en-GB-Studio-B':    { displayName: 'James',     quality: 'Premium' },
  'en-GB-Studio-C':    { displayName: 'Charlotte',  quality: 'Premium' },
  'en-GB-Neural2-A':   { displayName: 'Sophie',     quality: 'Natural' },
  'en-GB-Neural2-B':   { displayName: 'Oliver',     quality: 'Natural' },
  'en-GB-Neural2-C':   { displayName: 'Emily',      quality: 'Natural' },
  'en-GB-Neural2-D':   { displayName: 'William',    quality: 'Natural' },
  'en-GB-Neural2-F':   { displayName: 'Amelia',     quality: 'Natural' },
  'en-GB-Neural2-N':   { displayName: 'Isabella',   quality: 'Natural' },
  'en-GB-Neural2-O':   { displayName: 'Henry',      quality: 'Natural' },
  'en-GB-Wavenet-A':   { displayName: 'Eleanor',    quality: 'Clear' },
  'en-GB-Wavenet-B':   { displayName: 'Thomas',     quality: 'Clear' },
  'en-GB-Wavenet-C':   { displayName: 'Grace',      quality: 'Clear' },
  'en-GB-Wavenet-D':   { displayName: 'George',     quality: 'Clear' },
  'en-GB-Wavenet-F':   { displayName: 'Alice',      quality: 'Clear' },
  'en-GB-Wavenet-N':   { displayName: 'Florence',   quality: 'Clear' },
  'en-GB-Wavenet-O':   { displayName: 'Edward',     quality: 'Clear' },
};

app.get('/api/tts/voices', async (req, res) => {
  try {
    if (cachedVoices) return res.json({ voices: cachedVoices });

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'TTS not configured' });

    const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}&languageCode=en`);
    if (!response.ok) return res.status(500).json({ error: 'Failed to fetch voices' });

    const data = await response.json();
    const voices = (data.voices || [])
      .filter(v => v.languageCodes.some(lc => lc === 'en-GB') && VOICE_NAMES[v.name])
      .map(v => {
        const info = VOICE_NAMES[v.name];
        const gender = v.ssmlGender;
        const avatarBg = gender === 'MALE' ? '4a90d9' : 'd94a8a';
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(info.displayName)}&background=${avatarBg}&color=fff&size=128&rounded=true&bold=true`;
        return { name: v.name, displayName: info.displayName, quality: info.quality, gender, language: v.languageCodes[0], avatarUrl };
      })
      .sort((a, b) => {
        const qualityOrder = { Premium: 0, Natural: 1, Clear: 2 };
        return (qualityOrder[a.quality] ?? 5) - (qualityOrder[b.quality] ?? 5) || a.displayName.localeCompare(b.displayName);
      });

    cachedVoices = voices;
    res.json({ voices });
  } catch (err) {
    console.error('Voices error:', err);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || text.length > 500) return res.status(400).json({ error: 'Text required (max 500 chars)' });

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'TTS not configured' });

    const voiceName = voice || 'en-GB-Wavenet-B';
    const langCode = voiceName.split('-').slice(0, 2).join('-');

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: langCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Google TTS error:', err);
      return res.status(500).json({ error: 'TTS failed' });
    }

    const data = await response.json();
    res.json({ audio: data.audioContent });
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: 'TTS failed' });
  }
});

// ── Speech-to-Text via Google Cloud ──
app.post('/api/stt', authMiddleware, async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio data required' });

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Speech-to-text not configured' });

    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-GB',
          model: 'latest_long',
          enableAutomaticPunctuation: true,
        },
        audio: { content: audio },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Google STT error:', err);
      return res.status(500).json({ error: 'Speech recognition failed' });
    }

    const data = await response.json();
    const rawTranscript = data.results
      ?.map(r => r.alternatives?.[0]?.transcript)
      .filter(Boolean)
      .join(' ') || '';

    if (!rawTranscript) return res.json({ transcript: '' });

    // Post-process with Claude for proper capitalisation and punctuation
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic();
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: `Fix the capitalisation and punctuation of this dictated sentence. Only return the corrected sentence, nothing else. Do not change any words, only fix capitalisation (start of sentence, proper nouns) and add punctuation marks (full stops, commas, question marks, exclamation marks) where needed.\n\n${rawTranscript}` }],
      });
      const cleaned = msg.content[0]?.text?.trim();
      res.json({ transcript: cleaned || rawTranscript });
    } catch (err) {
      console.log('Claude post-processing failed, returning raw transcript:', err.message);
      res.json({ transcript: rawTranscript });
    }
  } catch (err) {
    console.error('STT error:', err);
    res.status(500).json({ error: 'Speech recognition failed' });
  }
});

// Seed endpoint (one-time use)
app.post('/api/seed', async (req, res) => {
  try {
    const { default: seedData } = await import('./seed-data.js');
    let inserted = 0;
    for (const w of seedData) {
      const result = await pool.query(`
        INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        ON CONFLICT (word) DO NOTHING RETURNING id
      `, [w.word, w.definition, w.example_sentence, w.teacher_tip, w.synonyms, w.antonyms, w.category, w.difficulty, w.visual_emoji, JSON.stringify(w.visual_anchors)]);
      if (result.rows.length > 0) inserted++;
    }
    res.json({ seeded: inserted, total: seedData.length });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── User Profile CRUD ──
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [req.user.userId]);
    res.json({ profile: result.rows[0] || null });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { year_of_birth, gender, countries, places_people, about_me, books, tv_shows, youtube_interests } = req.body;
    const result = await pool.query(`
      INSERT INTO user_profiles (user_id, year_of_birth, gender, countries, places_people, about_me, books, tv_shows, youtube_interests, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        year_of_birth = COALESCE($2, user_profiles.year_of_birth),
        gender = COALESCE($3, user_profiles.gender),
        countries = COALESCE($4, user_profiles.countries),
        places_people = COALESCE($5, user_profiles.places_people),
        about_me = COALESCE($6, user_profiles.about_me),
        books = COALESCE($7, user_profiles.books),
        tv_shows = COALESCE($8, user_profiles.tv_shows),
        youtube_interests = COALESCE($9, user_profiles.youtube_interests),
        updated_at = NOW()
      RETURNING *
    `, [req.user.userId, year_of_birth || null, gender || null, countries || [], places_people || [], about_me || null, books ? JSON.stringify(books) : null, tv_shows ? JSON.stringify(tv_shows) : null, youtube_interests || []]);
    res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error('Profile save error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// ── Helper: get user profile interests string for prompts ──
async function getProfileContext(userId) {
  try {
    const result = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
    if (!result.rows[0]) return null;
    const p = result.rows[0];
    const parts = [];
    if (p.books && Array.isArray(p.books) && p.books.length > 0) {
      const bookTitles = p.books.map(b => b.title).filter(Boolean);
      if (bookTitles.length) parts.push(`Favourite books: ${bookTitles.join(', ')}`);
    }
    if (p.tv_shows && Array.isArray(p.tv_shows) && p.tv_shows.length > 0) {
      const showTitles = p.tv_shows.map(s => s.title).filter(Boolean);
      if (showTitles.length) parts.push(`Favourite TV/films: ${showTitles.join(', ')}`);
    }
    if (p.places_people && p.places_people.length > 0) {
      parts.push(`Loves: ${p.places_people.join(', ')}`);
    }
    if (p.youtube_interests && p.youtube_interests.length > 0) {
      parts.push(`YouTube interests: ${p.youtube_interests.join(', ')}`);
    }
    if (p.about_me) parts.push(`About them: ${p.about_me}`);
    if (p.year_of_birth) parts.push(`Age: approximately ${new Date().getFullYear() - p.year_of_birth} years old`);
    return parts.length > 0 ? parts.join('. ') + '.' : null;
  } catch { return null; }
}

// ── Learning Schedule ──
app.get('/api/schedule', authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || (new Date().getMonth() + 1);
    const y = parseInt(year) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDayObj = new Date(y, m, 0);
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;

    const result = await pool.query(`
      SELECT ls.*, w.word, w.definition, w.difficulty, w.visual_emoji, w.category,
             p.status as progress_status
      FROM learning_schedule ls
      JOIN words w ON w.id = ls.word_id
      LEFT JOIN progress p ON p.user_id = ls.user_id AND p.word_id = ls.word_id
      WHERE ls.user_id = $1 AND ls.scheduled_date BETWEEN $2 AND $3
      ORDER BY ls.scheduled_date, w.difficulty, w.word
    `, [req.user.userId, startDate, endDate]);

    res.json({ schedule: result.rows });
  } catch (err) {
    console.error('Schedule fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

app.post('/api/schedule/generate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get words already scheduled for this user
    const scheduledResult = await pool.query(
      'SELECT word_id FROM learning_schedule WHERE user_id = $1', [userId]
    );
    const scheduledIds = new Set(scheduledResult.rows.map(r => r.word_id));

    // Get words already mastered
    const masteredResult = await pool.query(
      "SELECT word_id FROM progress WHERE user_id = $1 AND status = 'mastered'", [userId]
    );
    const masteredIds = new Set(masteredResult.rows.map(r => r.word_id));

    // Get all approved words sorted by difficulty then alphabetical
    const wordsResult = await pool.query(
      'SELECT id FROM words WHERE approved = true ORDER BY difficulty ASC, word ASC'
    );

    // Filter to unscheduled, non-mastered words
    const available = wordsResult.rows
      .filter(w => !scheduledIds.has(w.id) && !masteredIds.has(w.id))
      .map(w => w.id);

    if (available.length === 0) {
      return res.json({ scheduled: 0, message: 'All words are already scheduled or mastered!' });
    }

    // Find the last scheduled date for this user, or use today
    const lastDateResult = await pool.query(
      'SELECT MAX(scheduled_date) as last_date FROM learning_schedule WHERE user_id = $1', [userId]
    );
    let startDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (lastDateResult.rows[0]?.last_date) {
      const lastDate = new Date(lastDateResult.rows[0].last_date);
      startDate = lastDate >= today ? new Date(lastDate.getTime() + 86400000) : today;
    } else {
      startDate = today;
    }

    // Schedule 7 words per day
    const WORDS_PER_DAY = 7;
    let scheduled = 0;
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (let i = 0; i < available.length; i++) {
      const dayOffset = Math.floor(i / WORDS_PER_DAY);
      const date = new Date(startDate.getTime() + dayOffset * 86400000);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2})`);
      params.push(userId, available[i], dateStr);
      paramIdx += 3;
      scheduled++;
    }

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO learning_schedule (user_id, word_id, scheduled_date)
         VALUES ${values.join(', ')}
         ON CONFLICT (user_id, word_id) DO NOTHING`,
        params
      );
    }

    res.json({ scheduled, days: Math.ceil(scheduled / WORDS_PER_DAY) });
  } catch (err) {
    console.error('Schedule generate error:', err);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

app.put('/api/schedule/swap', authMiddleware, async (req, res) => {
  try {
    const { oldWordId, newWordId, date } = req.body;
    const userId = req.user.userId;

    // Remove old word from this date
    await pool.query(
      'DELETE FROM learning_schedule WHERE user_id = $1 AND word_id = $2 AND scheduled_date = $3',
      [userId, oldWordId, date]
    );
    // Add new word to this date
    await pool.query(
      `INSERT INTO learning_schedule (user_id, word_id, scheduled_date)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, word_id) DO UPDATE SET scheduled_date = $3`,
      [userId, newWordId, date]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Schedule swap error:', err);
    res.status(500).json({ error: 'Failed to swap word' });
  }
});

app.delete('/api/schedule', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM learning_schedule WHERE user_id = $1', [req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Schedule delete error:', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

app.get('/api/schedule/unscheduled', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.id, w.word, w.definition, w.difficulty, w.visual_emoji, w.category
      FROM words w
      WHERE w.approved = true
        AND w.id NOT IN (SELECT word_id FROM learning_schedule WHERE user_id = $1)
        AND w.id NOT IN (SELECT word_id FROM progress WHERE user_id = $1 AND status = 'mastered')
      ORDER BY w.difficulty ASC, w.word ASC
    `, [req.user.userId]);
    res.json({ words: result.rows });
  } catch (err) {
    console.error('Unscheduled words error:', err);
    res.status(500).json({ error: 'Failed to fetch unscheduled words' });
  }
});

// ── Gamification: Tier helper ──
function getTier(totalPoints) {
  if (totalPoints >= 20000) return { name: 'Diamond', emoji: '💎', color: '#b9f2ff' };
  if (totalPoints >= 8000)  return { name: 'Gold',    emoji: '🥇', color: '#ffd700' };
  if (totalPoints >= 3000)  return { name: 'Silver',  emoji: '🥈', color: '#c0c0c0' };
  return { name: 'Bronze', emoji: '🥉', color: '#cd7f32' };
}

// ── Gamification Endpoints ──

// 1. POST /api/exercises — record exercise answer
app.post('/api/exercises', authMiddleware, async (req, res) => {
  try {
    const { wordId, exerciseType, correct, sessionId, metadata } = req.body;
    if (!wordId || !exerciseType || correct === undefined || !sessionId) {
      return res.status(400).json({ error: 'wordId, exerciseType, correct, and sessionId are required' });
    }
    const result = await recordExercise({
      userId: req.user.userId,
      wordId,
      exerciseType,
      correct: !!correct,
      sessionId,
      metadata: metadata || {},
    });
    res.json(result);
  } catch (err) {
    console.error('Record exercise error:', err);
    res.status(500).json({ error: 'Failed to record exercise' });
  }
});

// 2. POST /api/exercises/bonus — record bonus points
app.post('/api/exercises/bonus', authMiddleware, async (req, res) => {
  try {
    const { points, reason } = req.body;
    if (!points || !reason) return res.status(400).json({ error: 'points and reason required' });
    await recordBonus({ userId: req.user.userId, points, reason });
    res.json({ success: true, points, reason });
  } catch (err) {
    console.error('Record bonus error:', err);
    res.status(500).json({ error: 'Failed to record bonus' });
  }
});

// 3. GET /api/exercises/history — paginated history
app.get('/api/exercises/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query(`
      SELECT eh.*, w.word, w.visual_emoji
      FROM exercise_history eh
      JOIN words w ON w.id = eh.word_id
      WHERE eh.user_id = $1
      ORDER BY eh.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.userId, parseInt(limit), parseInt(offset)]);
    const countResult = await pool.query(
      'SELECT COUNT(*)::int as total FROM exercise_history WHERE user_id = $1',
      [req.user.userId]
    );
    res.json({ history: result.rows, total: countResult.rows[0].total });
  } catch (err) {
    console.error('Exercise history error:', err);
    res.status(500).json({ error: 'Failed to fetch exercise history' });
  }
});

// 4. GET /api/exercises/sessions — session summaries
app.get('/api/exercises/sessions', authMiddleware, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const result = await pool.query(`
      SELECT
        session_id,
        MIN(created_at) as started_at,
        MAX(created_at) as ended_at,
        COUNT(*)::int as total_exercises,
        COUNT(*) FILTER (WHERE correct)::int as correct_count,
        SUM(points_earned)::int as total_points,
        array_agg(DISTINCT exercise_type) as exercise_types
      FROM exercise_history
      WHERE user_id = $1
      GROUP BY session_id
      ORDER BY MIN(created_at) DESC
      LIMIT $2 OFFSET $3
    `, [req.user.userId, parseInt(limit), parseInt(offset)]);
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// 5. GET /api/points/today — today's earned/lost/target
app.get('/api/points/today', authMiddleware, async (req, res) => {
  try {
    const todayPts = await getTodayPoints(req.user.userId);
    const target = await getDailyTarget(req.user.userId);
    res.json({ ...todayPts, target, net: todayPts.earned - todayPts.lost });
  } catch (err) {
    console.error('Today points error:', err);
    res.status(500).json({ error: 'Failed to fetch today points' });
  }
});

// 6. GET /api/points/total — all-time total
app.get('/api/points/total', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COALESCE(SUM(points), 0)::int as total FROM point_events WHERE user_id = $1',
      [req.user.userId]
    );
    const total = result.rows[0].total;
    const tier = getTier(total);
    res.json({ total, tier });
  } catch (err) {
    console.error('Total points error:', err);
    res.status(500).json({ error: 'Failed to fetch total points' });
  }
});

// 7. GET /api/streak — streak days + freezes + todayActive
app.get('/api/streak', authMiddleware, async (req, res) => {
  try {
    const streakDays = await getStreakDays(req.user.userId);
    const freezeResult = await pool.query(
      'SELECT streak_freezes FROM users WHERE id = $1',
      [req.user.userId]
    );
    const freezes = freezeResult.rows[0]?.streak_freezes || 0;
    // Check if user has positive points today
    const todayResult = await pool.query(`
      SELECT EXISTS(
        SELECT 1 FROM point_events
        WHERE user_id = $1 AND points > 0 AND created_at >= CURRENT_DATE
      ) as active
    `, [req.user.userId]);
    const todayActive = todayResult.rows[0].active;
    res.json({ streakDays, freezes, todayActive });
  } catch (err) {
    console.error('Streak error:', err);
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

// 8. GET /api/achievements — all achievements with unlock status
app.get('/api/achievements', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
      ORDER BY a.category, a.threshold
    `, [req.user.userId]);
    res.json({
      achievements: result.rows.map(a => ({
        id: a.id,
        key: a.key,
        title: a.title,
        description: a.description,
        emoji: a.emoji,
        threshold: a.threshold,
        category: a.category,
        unlocked: !!a.unlocked_at,
        unlockedAt: a.unlocked_at || null,
      })),
    });
  } catch (err) {
    console.error('Achievements error:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// 9. GET /api/tree — tree state
app.get('/api/tree', authMiddleware, async (req, res) => {
  try {
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(points), 0)::int as total FROM point_events WHERE user_id = $1',
      [req.user.userId]
    );
    const totalPoints = totalResult.rows[0].total;
    const tree = getTreeStage(totalPoints);
    const todayPts = await getTodayPoints(req.user.userId);
    const target = await getDailyTarget(req.user.userId);
    const healthPercent = target > 0 ? Math.min(100, Math.round((todayPts.earned / target) * 100)) : 100;
    res.json({
      totalPoints,
      ...tree,
      healthPercent,
      todayEarned: todayPts.earned,
      todayTarget: target,
    });
  } catch (err) {
    console.error('Tree error:', err);
    res.status(500).json({ error: 'Failed to fetch tree state' });
  }
});

// 10. GET /api/leaderboard — weekly/monthly rankings with tier badges
app.get('/api/leaderboard', authMiddleware, async (req, res) => {
  try {
    const { period = 'weekly' } = req.query;
    const dateFilter = period === 'monthly'
      ? "created_at >= date_trunc('month', CURRENT_DATE)"
      : "created_at >= date_trunc('week', CURRENT_DATE)";

    const result = await pool.query(`
      SELECT
        u.id as user_id,
        u.name,
        u.avatar_url,
        COALESCE(SUM(pe.points), 0)::int as period_points,
        all_time.total as all_time_points
      FROM users u
      LEFT JOIN point_events pe ON pe.user_id = u.id AND pe.${dateFilter}
      LEFT JOIN (
        SELECT user_id, COALESCE(SUM(points), 0)::int as total
        FROM point_events GROUP BY user_id
      ) all_time ON all_time.user_id = u.id
      GROUP BY u.id, u.name, u.avatar_url, all_time.total
      HAVING COALESCE(SUM(pe.points), 0) > 0
      ORDER BY period_points DESC
      LIMIT 50
    `);

    const leaderboard = result.rows.map((row, idx) => ({
      rank: idx + 1,
      userId: row.user_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      periodPoints: row.period_points,
      allTimePoints: row.all_time_points || 0,
      tier: getTier(row.all_time_points || 0),
    }));

    res.json({ period, leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  if (existsSync(clientDist)) {
    res.sendFile(join(clientDist, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

async function start() {
  await initDatabase();
  await seedAchievements();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`11plus-vocab server running on http://localhost:${PORT}`);
    if (existsSync(clientDist)) console.log(`Serving frontend from ${clientDist}`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });

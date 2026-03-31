import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import pool from './db.js';
import { initDatabase } from './init-db.js';
import { generateJwt, authMiddleware, adminMiddleware } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
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

// ── Auth (Name only) ──
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
      messages: [{ role: 'user', content: `You are a friendly English teacher for 9-10 year old students preparing for the 11 Plus exam.\n\nA student has written a sentence using the word "${word.word}" (meaning: ${word.definition}).\n\nTheir sentence: "${sentence}"\n\nEvaluate:\n1. Is the word used correctly in context?\n2. Is the grammar correct?\n3. Does the sentence make sense?\n\nRespond in JSON format:\n{"correct": true/false, "feedback": "One short, encouraging sentence of feedback for a 9 year old", "suggestion": "If incorrect, a gentle suggestion for improvement. If correct, null"}` }]
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

// ── Image Generation for Visual Anchors ──
app.post('/api/words/:id/generate-images', async (req, res) => {
  try {
    const wordResult = await pool.query('SELECT * FROM words WHERE id = $1 AND approved = true', [req.params.id]);
    if (wordResult.rows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const word = wordResult.rows[0];
    let anchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];

    // Already generated? Return cached
    if (anchors.length > 0 && anchors[0].image_url) {
      return res.json({ word: word.word, visual_anchors: anchors });
    }

    // Generate Pollinations URLs and verify they work (one at a time to avoid rate limits)
    let allWorked = true;
    for (let idx = 0; idx < anchors.length; idx++) {
      const anchor = anchors[idx];
      const prompt = `watercolor illustration for children: ${anchor.scene}`;
      const encodedPrompt = encodeURIComponent(prompt);
      const seed = word.id * 10 + idx;
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=400&height=400&nologo=true&seed=${seed}&model=flux`;

      try {
        const check = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
        if (check.ok) {
          anchors[idx] = { ...anchor, image_url: url };
        } else {
          console.log(`Pollinations returned ${check.status} for word ${word.id} anchor ${idx}`);
          allWorked = false;
          break;
        }
      } catch (err) {
        console.log(`Pollinations fetch failed for word ${word.id}: ${err.message}`);
        allWorked = false;
        break;
      }

      // 2s delay between requests to avoid rate limits
      if (idx < anchors.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    // Only save to DB if all images verified
    if (allWorked && anchors[0]?.image_url) {
      await pool.query('UPDATE words SET visual_anchors = $1 WHERE id = $2', [JSON.stringify(anchors), word.id]);
    }

    res.json({ word: word.word, visual_anchors: anchors });
  } catch (err) {
    console.error('Generate images error:', err);
    res.status(500).json({ error: 'Failed to generate images' });
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

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Create exactly 5 short example sentences using the word "${word.word}" (meaning: ${word.definition}) as if they come from famous children's books. Each sentence should sound like it belongs in that book's world and use the word naturally.

Rules:
- One MUST be from Harry Potter
- Others from books like: Matilda, Charlie and the Chocolate Factory, The BFG, Narnia, Percy Jackson, Diary of a Wimpy Kid, Tom Gates, etc.
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

app.get('/api/tts/voices', async (req, res) => {
  try {
    if (cachedVoices) return res.json({ voices: cachedVoices });

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'TTS not configured' });

    const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}&languageCode=en`);
    if (!response.ok) return res.status(500).json({ error: 'Failed to fetch voices' });

    const data = await response.json();
    const voices = (data.voices || [])
      .filter(v => v.languageCodes.some(lc => lc === 'en-GB'))
      .map((v, i) => {
        const gender = v.ssmlGender;
        const type = v.name.includes('Wavenet') ? 'Wavenet' : v.name.includes('Neural2') ? 'Neural2' : v.name.includes('Studio') ? 'Studio' : v.name.includes('Journey') ? 'Journey' : 'Standard';
        const shortName = v.name.replace('en-GB-', '').replace('Chirp3-HD-', '').replace('Chirp-HD-', '');
        const avatarSeed = v.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const genderWord = gender === 'MALE' ? 'male' : 'female';
        const avatarUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`portrait photo, friendly British ${genderWord} voice actor, professional headshot, warm smile, studio lighting`)}&width=128&height=128&nologo=true&seed=${avatarSeed}`;
        return { name: v.name, shortName, gender, language: v.languageCodes[0], type, avatarUrl };
      })
      .sort((a, b) => {
        const typeOrder = { Studio: 0, Neural2: 1, Wavenet: 2, Standard: 3 };
        return (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5) || a.name.localeCompare(b.name);
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
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`11plus-vocab server running on http://localhost:${PORT}`);
    if (existsSync(clientDist)) console.log(`Serving frontend from ${clientDist}`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });

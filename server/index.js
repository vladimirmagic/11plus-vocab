import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import pool from './db.js';
import { initDatabase } from './init-db.js';
import { verifyGoogleToken, generateJwt, authMiddleware, adminMiddleware } from './auth.js';

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

// ── Auth ──
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken required' });
    const gUser = await verifyGoogleToken(idToken);
    const result = await pool.query(`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
      RETURNING id, google_id, email, name, avatar_url, role
    `, [gUser.googleId, gUser.email, gUser.name, gUser.picture]);
    const user = result.rows[0];
    const token = generateJwt(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role } });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, avatar_url, role FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
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

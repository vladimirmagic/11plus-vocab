# 11 Plus Vocabulary Trainer - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-stack vocabulary learning app for 11+ exam prep with Claude AI integration, Google OAuth, and Railway deployment.

**Architecture:** Monorepo with React+Vite client and Express+PostgreSQL server. Multi-stage Docker build for Railway deployment. Claude API for content generation and sentence validation. Google OAuth for auth.

**Tech Stack:** React 18, Vite 5, Express 4, PostgreSQL (pg), Google OAuth (google-auth-library), JWT (jsonwebtoken), Anthropic SDK, Docker, Railway

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `client/package.json`
- Create: `server/package.json`
- Create: `client/vite.config.js`
- Create: `Dockerfile`
- Create: `railway.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/.env.example`

**Step 1: Create root package.json**

```json
{
  "name": "11plus-vocab",
  "version": "1.0.0",
  "description": "11 Plus Vocabulary Trainer",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "build": "cd client && npm install && npm run build",
    "start": "cd server && node index.js",
    "install:all": "cd server && npm install && cd ../client && npm install"
  },
  "engines": {
    "node": ">=18"
  }
}
```

**Step 2: Create client/package.json**

```json
{
  "name": "11plus-vocab-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0"
  }
}
```

**Step 3: Create server/package.json**

```json
{
  "name": "11plus-vocab-server",
  "version": "1.0.0",
  "description": "11 Plus Vocabulary Trainer API",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "google-auth-library": "^10.6.1",
    "jsonwebtoken": "^9.0.3",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "pg": "^8.11.3"
  }
}
```

**Step 4: Create client/vite.config.js**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

**Step 5: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]
```

**Step 6: Create railway.json**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
.cache/
*.log
```

**Step 8: Create .env.example**

```bash
# PostgreSQL Database
DATABASE_URL=postgresql://user:password@host:port/dbname

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
JWT_SECRET=your-random-secret-string

# Server
PORT=3001
```

**Step 9: Install dependencies**

Run: `cd client && npm install && cd ../server && npm install`

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with React+Vite, Express, Docker, Railway config"
```

---

### Task 2: Database Schema & Connection

**Files:**
- Create: `server/db.js`
- Create: `server/schema.sql`
- Create: `server/init-db.js`

**Step 1: Create server/db.js**

```javascript
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env'), override: true });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
```

**Step 2: Create server/schema.sql**

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(255) NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  example_sentence TEXT,
  teacher_tip TEXT,
  synonyms TEXT[] DEFAULT '{}',
  antonyms TEXT[] DEFAULT '{}',
  category VARCHAR(100),
  difficulty INTEGER DEFAULT 1,
  visual_emoji VARCHAR(10),
  visual_anchors JSONB DEFAULT '[]',
  approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  times_practiced INTEGER NOT NULL DEFAULT 0,
  last_practiced TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500),
  words_extracted INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_word ON progress(word_id);
CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
CREATE INDEX IF NOT EXISTS idx_words_approved ON words(approved);
```

**Step 3: Create server/init-db.js**

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDatabase() {
  try {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    throw err;
  }
}
```

**Step 4: Commit**

```bash
git add server/db.js server/schema.sql server/init-db.js
git commit -m "feat: database schema and connection pool"
```

---

### Task 3: Auth System (Server)

**Files:**
- Create: `server/auth.js`

**Step 1: Create server/auth.js**

```javascript
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRY = '7d';

const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export async function verifyGoogleToken(idToken) {
  if (!oauthClient) throw new Error('GOOGLE_CLIENT_ID not configured');
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export function generateJwt(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = verifyJwt(auth.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

**Step 2: Commit**

```bash
git add server/auth.js
git commit -m "feat: Google OAuth verification, JWT, auth middleware"
```

---

### Task 4: Server Entry Point & Auth Routes

**Files:**
- Create: `server/index.js`

**Step 1: Create server/index.js with core setup + auth routes**

```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

// Serve built frontend
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// ── Auth Routes ──
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const gUser = await verifyGoogleToken(idToken);

    const result = await pool.query(`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url
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
    const result = await pool.query(
      'SELECT id, email, name, avatar_url, role FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ── Word Routes ──
app.get('/api/words', async (req, res) => {
  try {
    const { search, category, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM words WHERE approved = true';
    const params = [];
    let paramIdx = 1;

    if (search) {
      query += ` AND (word ILIKE $${paramIdx} OR definition ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (category) {
      query += ` AND category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    query += ` ORDER BY word ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    const countQuery = 'SELECT COUNT(*) FROM words WHERE approved = true';
    const countResult = await pool.query(countQuery);

    res.json({ words: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    console.error('Words error:', err);
    res.status(500).json({ error: 'Failed to fetch words' });
  }
});

app.get('/api/words/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category, COUNT(*) as count FROM words WHERE approved = true AND category IS NOT NULL GROUP BY category ORDER BY category'
    );
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
      const placeholders = allRelated.map((_, i) => `$${i + 1}`).join(',');
      const relResult = await pool.query(
        `SELECT id, word, definition, synonyms, antonyms, visual_emoji FROM words WHERE LOWER(word) IN (${placeholders}) AND approved = true`,
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

// ── Progress Routes ──
app.get('/api/progress', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, w.word, w.definition, w.visual_emoji, w.category
       FROM progress p JOIN words w ON p.word_id = w.id
       WHERE p.user_id = $1 ORDER BY p.last_practiced DESC NULLS LAST`,
      [req.user.userId]
    );
    res.json({ progress: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

app.get('/api/progress/stats', authMiddleware, async (req, res) => {
  try {
    const totalWords = await pool.query('SELECT COUNT(*) FROM words WHERE approved = true');
    const userProgress = await pool.query(
      `SELECT status, COUNT(*) as count FROM progress WHERE user_id = $1 GROUP BY status`,
      [req.user.userId]
    );
    const todayPracticed = await pool.query(
      `SELECT COUNT(*) FROM progress WHERE user_id = $1 AND last_practiced >= CURRENT_DATE`,
      [req.user.userId]
    );

    const stats = { new: 0, learning: 0, mastered: 0 };
    userProgress.rows.forEach(r => { stats[r.status] = parseInt(r.count); });

    res.json({
      totalWords: parseInt(totalWords.rows[0].count),
      ...stats,
      practicedToday: parseInt(todayPracticed.rows[0].count),
      notStarted: parseInt(totalWords.rows[0].count) - stats.new - stats.learning - stats.mastered,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.put('/api/progress/:wordId', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'learning', 'mastered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(`
      INSERT INTO progress (user_id, word_id, status, times_practiced, last_practiced)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_id, word_id) DO UPDATE SET
        status = $3,
        times_practiced = progress.times_practiced + 1,
        last_practiced = NOW()
      RETURNING *
    `, [req.user.userId, req.params.wordId, status]);

    res.json({ progress: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ── Game Routes ──
app.get('/api/games/matching', async (req, res) => {
  try {
    const { count = 8, category } = req.query;
    let query = 'SELECT id, word, definition, visual_emoji FROM words WHERE approved = true';
    const params = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }

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
      messages: [{
        role: 'user',
        content: `You are a friendly English teacher for 9-10 year old students preparing for the 11 Plus exam.

A student has written a sentence using the word "${word.word}" (meaning: ${word.definition}).

Their sentence: "${sentence}"

Evaluate:
1. Is the word used correctly in context?
2. Is the grammar correct?
3. Does the sentence make sense?

Respond in JSON format:
{
  "correct": true/false,
  "feedback": "One short, encouraging sentence of feedback for a 9 year old",
  "suggestion": "If incorrect, a gentle suggestion for improvement. If correct, null"
}`
      }]
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

// ── Admin Routes ──
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
    const result = await pool.query(
      'UPDATE words SET approved = true WHERE id = $1 RETURNING *',
      [req.params.wordId]
    );
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
      ON CONFLICT (word) DO UPDATE SET
        definition = EXCLUDED.definition,
        example_sentence = EXCLUDED.example_sentence,
        teacher_tip = EXCLUDED.teacher_tip,
        synonyms = EXCLUDED.synonyms,
        antonyms = EXCLUDED.antonyms,
        category = EXCLUDED.category,
        difficulty = EXCLUDED.difficulty,
        visual_emoji = EXCLUDED.visual_emoji,
        visual_anchors = EXCLUDED.visual_anchors
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
      UPDATE words SET
        word = COALESCE($2, word),
        definition = COALESCE($3, definition),
        example_sentence = COALESCE($4, example_sentence),
        teacher_tip = COALESCE($5, teacher_tip),
        synonyms = COALESCE($6, synonyms),
        antonyms = COALESCE($7, antonyms),
        category = COALESCE($8, category),
        difficulty = COALESCE($9, difficulty),
        visual_emoji = COALESCE($10, visual_emoji),
        visual_anchors = COALESCE($11, visual_anchors)
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

// ── Admin: AI Generate Word Content ──
app.post('/api/admin/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'word required' });

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are creating vocabulary content for 9-10 year old students studying for the 11 Plus exam.

For the word "${word}", generate:

1. A clear, simple definition suitable for a 9-10 year old
2. An example sentence a child might encounter
3. A teacher's tip about common mistakes or subtle usage
4. 2-4 synonyms (simpler words preferred)
5. 1-3 antonyms
6. A category (one of: adjectives, verbs, nouns, adverbs, emotions, character, academic, nature, relationships)
7. Difficulty 1-3 (1=common, 2=intermediate, 3=advanced)
8. A single emoji that represents the word
9. Three "visual anchors" - each is an emoji + a vivid one-sentence scene that paints a mental picture of the word's meaning

Respond in JSON:
{
  "definition": "...",
  "example_sentence": "...",
  "teacher_tip": "...",
  "synonyms": ["...", "..."],
  "antonyms": ["..."],
  "category": "...",
  "difficulty": 1,
  "visual_emoji": "...",
  "visual_anchors": [
    {"emoji": "...", "scene": "..."},
    {"emoji": "...", "scene": "..."},
    {"emoji": "...", "scene": "..."}
  ]
}`
      }]
    });

    const text = msg.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' });

    const generated = JSON.parse(jsonMatch[0]);
    res.json({ word, ...generated });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// ── Admin: Upload & Extract Words ──
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/admin/upload', authMiddleware, adminMiddleware, upload.single('file'), async (req, res) => {
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

    if (!text.trim()) return res.status(400).json({ error: 'No text content found in file' });

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a vocabulary extraction expert for the 11 Plus exam (UK, ages 9-10).

From the following text, extract vocabulary words that would be useful for 11 Plus preparation. Focus on:
- Words that appear in 11+ verbal reasoning papers
- Academic and descriptive vocabulary
- Words that a 9-10 year old should learn but may not know yet
- Skip very common words (the, and, is, etc.)

For each word, generate complete learning content.

Text to analyze:
---
${text.substring(0, 8000)}
---

Respond as a JSON array (max 20 words):
[
  {
    "word": "...",
    "definition": "simple definition for 9-10 year olds",
    "example_sentence": "...",
    "teacher_tip": "...",
    "synonyms": ["..."],
    "antonyms": ["..."],
    "category": "adjectives|verbs|nouns|adverbs|emotions|character|academic|nature|relationships",
    "difficulty": 1-3,
    "visual_emoji": "...",
    "visual_anchors": [
      {"emoji": "...", "scene": "..."},
      {"emoji": "...", "scene": "..."},
      {"emoji": "...", "scene": "..."}
    ]
  }
]`
      }]
    });

    const responseText = msg.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' });

    const extractedWords = JSON.parse(jsonMatch[0]);

    // Insert as unapproved
    for (const w of extractedWords) {
      await pool.query(`
        INSERT INTO words (word, definition, example_sentence, teacher_tip, synonyms, antonyms, category, difficulty, visual_emoji, visual_anchors, approved)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
        ON CONFLICT (word) DO NOTHING
      `, [w.word, w.definition, w.example_sentence, w.teacher_tip, w.synonyms || [], w.antonyms || [], w.category, w.difficulty || 1, w.visual_emoji, JSON.stringify(w.visual_anchors || [])]);
    }

    // Track upload
    await pool.query(
      'INSERT INTO uploads (user_id, filename, words_extracted) VALUES ($1, $2, $3)',
      [req.user.userId, req.file.originalname, extractedWords.length]
    );

    res.json({ extracted: extractedWords.length, words: extractedWords });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// ── SPA Fallback ──
app.get('*', (req, res) => {
  if (existsSync(clientDist)) {
    res.sendFile(join(clientDist, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start ──
async function start() {
  await initDatabase();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`11plus-vocab server running on http://localhost:${PORT}`);
    if (existsSync(clientDist)) {
      console.log(`Serving frontend from ${clientDist}`);
    }
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: Express server with all API routes (auth, words, progress, games, admin)"
```

---

### Task 5: Seed Data (100+ 11 Plus Words)

**Files:**
- Create: `server/seed.js`

**Step 1: Create seed.js with 100+ high-frequency 11+ vocabulary words**

Create a comprehensive seed file with words across categories: adjectives, verbs, nouns, emotions, character, academic, nature, relationships. Each word has definition, example, tip, synonyms, antonyms, emoji, and 3 visual anchors.

Run: `node server/seed.js`
Expected: "Seeded N words"

**Step 2: Commit**

```bash
git add server/seed.js
git commit -m "feat: seed data with 100+ 11 Plus vocabulary words"
```

---

### Task 6: Client - Entry Point, Auth Context, API Utils

**Files:**
- Create: `client/index.html`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/AuthContext.jsx`
- Create: `client/src/api.js`
- Create: `client/src/index.css`

**Step 1: Create index.html with Google Sign-In script**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>11 Plus Vocabulary Trainer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

**Step 2: Create main.jsx, AuthContext.jsx, api.js, index.css, App.jsx skeleton**

AuthContext follows the exact pattern from langmagic-view. api.js provides `apiFetch(path, options)` helper that auto-attaches Bearer token. App.jsx manages tab navigation via state. index.css sets up warm organic theme (Nunito font, cream/green palette, CSS variables).

**Step 3: Commit**

```bash
git add client/
git commit -m "feat: client entry point, auth context, API utils, global styles"
```

---

### Task 7: Client - Dashboard Page

**Files:**
- Create: `client/src/pages/Dashboard.jsx`

Shows: welcome message, progress stats (mastered/learning/new), today's practice count, quick links to study modes. Fetches from `/api/progress/stats`.

**Commit after working.**

---

### Task 8: Client - Word List Page

**Files:**
- Create: `client/src/pages/WordList.jsx`
- Create: `client/src/components/WordCard.jsx`

Searchable, filterable word list. Click word to expand detail card showing definition, example, teacher tip, visual anchors, synonyms/antonyms as clickable links. Category filter pills. Progress status badge per word.

**Commit after working.**

---

### Task 9: Client - Word Clusters Page

**Files:**
- Create: `client/src/pages/WordClusters.jsx`

Visual network: center word with synonym nodes (green lines) and antonym nodes (red lines) radiating out. Uses SVG for rendering. Click a node to re-center on that word. Dropdown to select starting word.

**Commit after working.**

---

### Task 10: Client - Matching Game Page

**Files:**
- Create: `client/src/pages/MatchingGame.jsx`

Two columns: words (left) and shuffled definitions (right). Click word then click definition to match. Correct matches highlight green, incorrect flash red. Timer, score counter, streak tracker. 8 words per round. Category selector. Updates progress on completion.

**Commit after working.**

---

### Task 11: Client - Sentence Builder Page

**Files:**
- Create: `client/src/pages/SentenceBuilder.jsx`

Shows random word + definition. Text input for sentence. Submit calls `/api/games/validate-sentence`. Displays Claude's feedback with encouraging tone. "Next word" button. Progress tracking.

**Commit after working.**

---

### Task 12: Client - Admin Panel

**Files:**
- Create: `client/src/pages/AdminPanel.jsx`

Three sections:
1. **Upload**: File drop zone for PDF/text, shows extraction results, approve/reject each word
2. **Pending**: List of unapproved words with approve/edit/reject actions
3. **Manual Add**: Form to add a word manually, with "Generate with AI" button that calls `/api/admin/generate`

Only visible to users with role='admin'.

**Commit after working.**

---

### Task 13: Client - Navigation & App Assembly

**Files:**
- Modify: `client/src/App.jsx` - wire up all pages with navigation

Sidebar/header nav with icons: Dashboard, Word List, Clusters, Matching Game, Sentence Builder, Admin (if admin). Google sign-in button. User avatar + logout. Mobile hamburger menu.

**Commit after working.**

---

### Task 14: GitHub Repository & Railway Deployment

**Step 1: Create GitHub repo**

```bash
gh repo create vladimirmagic/11plus-vocab --public --source=. --push
```

**Step 2: Set up Railway**

Connect GitHub repo to Railway. Set environment variables:
- DATABASE_URL (Railway PostgreSQL)
- ANTHROPIC_API_KEY
- GOOGLE_CLIENT_ID
- JWT_SECRET
- PORT=3001

**Step 3: Run seed data on production**

**Step 4: Verify deployment**

---

### Task 15: End-to-End Testing & Bug Fixes

Test every feature:
1. Google login/logout
2. Word list search and filtering
3. Word detail cards with visual anchors
4. Cluster navigation
5. Matching game full round
6. Sentence builder with AI validation
7. Admin upload PDF
8. Admin approve/reject words
9. Admin manual add with AI generation
10. Progress tracking across pages
11. Mobile responsiveness

Fix any issues found.

**Final commit after all fixes.**

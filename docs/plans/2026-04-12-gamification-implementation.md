# Gamification System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add points, exercise history, growth tree, milestones, achievements, streaks, and leaderboard to the 11plus-vocab app.

**Architecture:** Monolithic normalised tables (exercise_history, point_events, achievements, user_achievements). All aggregates computed via SQL. New GamificationContext on the client provides state + `recordExercise()` to all pages. CelebrationOverlay rendered at App level.

**Tech Stack:** PostgreSQL, Express, React 18, CSS animations, Web Audio API (for celebration chime)

---

### Task 1: Database Schema — New Gamification Tables

**Files:**
- Modify: `server/schema.sql` (append after line 100)

**Step 1: Add the new tables and migrations to schema.sql**

Append to end of `server/schema.sql`:

```sql
-- ── Gamification tables ──

CREATE TABLE IF NOT EXISTS exercise_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  exercise_type VARCHAR(30) NOT NULL,
  correct BOOLEAN NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  session_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON exercise_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_history_session ON exercise_history(session_id);

CREATE TABLE IF NOT EXISTS point_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  exercise_history_id INTEGER REFERENCES exercise_history(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_points_user_date ON point_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  threshold INTEGER,
  category VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Migration: add streak_freezes to users
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN streak_freezes INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
```

**Step 2: Restart server and verify tables created**

Run: restart the server process and check logs for "Database schema initialized" with no errors.

**Step 3: Commit**

```bash
git add server/schema.sql
git commit -m "feat: add gamification database tables (exercise_history, point_events, achievements)"
```

---

### Task 2: Seed Achievement Definitions

**Files:**
- Create: `server/seed-achievements.js`
- Modify: `server/index.js` (add seed endpoint)

**Step 1: Create seed-achievements.js**

Create `server/seed-achievements.js`:

```js
import pool from './db.js';

const ACHIEVEMENTS = [
  // Points milestones
  { key: 'first_point', title: 'First Steps', description: 'Earn your first point', emoji: '🌱', threshold: 1, category: 'points' },
  { key: 'ten_points', title: 'Double Digits', description: 'Earn 10 points', emoji: '🎉', threshold: 10, category: 'points' },
  { key: 'fifty_points', title: 'Rising Star', description: 'Earn 50 points', emoji: '🌿', threshold: 50, category: 'points' },
  { key: 'hundred_points', title: 'Triple Digits', description: 'Earn 100 points', emoji: '⭐', threshold: 100, category: 'points' },
  { key: 'five_hundred_points', title: 'Word Wizard', description: 'Earn 500 points', emoji: '🧙', threshold: 500, category: 'points' },
  { key: 'thousand_points', title: 'Legendary', description: 'Earn 1000 points', emoji: '👑', threshold: 1000, category: 'points' },
  { key: 'two_thousand_points', title: 'Grand Master', description: 'Earn 2000 points', emoji: '💎', threshold: 2000, category: 'points' },

  // Streak milestones
  { key: 'streak_3', title: 'Hat Trick', description: '3-day streak', emoji: '🔥', threshold: 3, category: 'streak' },
  { key: 'streak_7', title: 'One Week', description: '7-day streak', emoji: '🔥', threshold: 7, category: 'streak' },
  { key: 'streak_14', title: 'Fortnight', description: '14-day streak', emoji: '🔥', threshold: 14, category: 'streak' },
  { key: 'streak_30', title: 'Monthly Master', description: '30-day streak', emoji: '🏆', threshold: 30, category: 'streak' },

  // Mastery milestones
  { key: 'mastery_10', title: 'Word Collector', description: 'Master 10 words', emoji: '📚', threshold: 10, category: 'mastery' },
  { key: 'mastery_25', title: 'Bookworm', description: 'Master 25 words', emoji: '📖', threshold: 25, category: 'mastery' },
  { key: 'mastery_50', title: 'Scholar', description: 'Master 50 words', emoji: '🎓', threshold: 50, category: 'mastery' },
  { key: 'mastery_all', title: 'Complete!', description: 'Master every word', emoji: '🏅', threshold: null, category: 'mastery' },

  // Games milestones
  { key: 'first_match', title: 'First Match', description: 'Complete your first matching game', emoji: '🎯', threshold: 1, category: 'games' },
  { key: 'first_sentence', title: 'Wordsmith', description: 'Write your first correct sentence', emoji: '✍️', threshold: 1, category: 'games' },
  { key: 'perfect_round', title: 'Perfectionist', description: 'Get a perfect matching round (8/8)', emoji: '💯', threshold: 1, category: 'games' },
  { key: 'ten_perfect_rounds', title: 'Flawless', description: 'Get 10 perfect matching rounds', emoji: '🏅', threshold: 10, category: 'games' },
  { key: 'hundred_sentences', title: 'Author', description: 'Write 100 correct sentences', emoji: '📝', threshold: 100, category: 'games' },
];

export async function seedAchievements() {
  for (const a of ACHIEVEMENTS) {
    await pool.query(
      `INSERT INTO achievements (key, title, description, emoji, threshold, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE SET title=$2, description=$3, emoji=$4, threshold=$5, category=$6`,
      [a.key, a.title, a.description, a.emoji, a.threshold, a.category]
    );
  }
}

export { ACHIEVEMENTS };
```

**Step 2: Call seedAchievements on server startup**

In `server/index.js`, after the `initDatabase()` call (near the bottom of the file where the server starts), add:

```js
import { seedAchievements } from './seed-achievements.js';
```

And in the startup block after `await initDatabase()`:

```js
await seedAchievements();
console.log('Achievements seeded');
```

**Step 3: Restart server and verify "Achievements seeded" in logs**

**Step 4: Commit**

```bash
git add server/seed-achievements.js server/index.js
git commit -m "feat: seed achievement badge definitions on startup"
```

---

### Task 3: Server — Exercise Recording & Points Logic

**Files:**
- Create: `server/gamification.js` (points calculation + achievement check logic)
- Modify: `server/index.js` (add new API endpoints)

**Step 1: Create server/gamification.js**

```js
import pool from './db.js';

// Points awarded per exercise type
const POINTS = {
  matching:        { correct: 10, wrong: -3 },
  sentence:        { correct: 20, wrong: -5 },
  picture_prompt:  { correct: 15, wrong: -4 },
  related_match:   { correct: 10, wrong: -3 },
};

export async function recordExercise({ userId, wordId, exerciseType, correct, sessionId, metadata }) {
  const pts = POINTS[exerciseType] || { correct: 10, wrong: -3 };
  const pointsEarned = correct ? pts.correct : pts.wrong;

  // 1. Insert exercise_history
  const histRes = await pool.query(
    `INSERT INTO exercise_history (user_id, word_id, exercise_type, correct, points_earned, session_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, wordId, exerciseType, correct, pointsEarned, sessionId, JSON.stringify(metadata || {})]
  );
  const historyId = histRes.rows[0].id;

  // 2. Insert point_event
  const reason = `${exerciseType}_${correct ? 'correct' : 'wrong'}`;
  await pool.query(
    `INSERT INTO point_events (user_id, points, reason, exercise_history_id) VALUES ($1, $2, $3, $4)`,
    [userId, pointsEarned, reason, historyId]
  );

  // 3. Check for streak bonus (every 5 correct in a row)
  let bonusPoints = 0;
  if (correct) {
    const streakRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM (
        SELECT correct FROM exercise_history
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5
      ) sub WHERE correct = true`,
      [userId]
    );
    if (parseInt(streakRes.rows[0].cnt) === 5) {
      bonusPoints += 10;
      await pool.query(
        `INSERT INTO point_events (user_id, points, reason) VALUES ($1, 10, 'streak_bonus')`,
        [userId]
      );
    }
  }

  // 4. Also update legacy progress table
  const status = correct ? 'mastered' : 'learning';
  await pool.query(
    `INSERT INTO progress (user_id, word_id, status, times_practiced, last_practiced)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET
       status = CASE WHEN $3 = 'mastered' THEN 'mastered' ELSE progress.status END,
       times_practiced = progress.times_practiced + 1,
       last_practiced = NOW()`,
    [userId, wordId, status]
  );

  // 5. Check achievements
  const newAchievements = await checkAchievements(userId);

  // 6. Get updated totals
  const totalRes = await pool.query(
    `SELECT COALESCE(SUM(points), 0) as total FROM point_events WHERE user_id = $1`,
    [userId]
  );

  return {
    pointsEarned: pointsEarned + bonusPoints,
    bonusPoints,
    totalPoints: parseInt(totalRes.rows[0].total),
    newAchievements,
  };
}

export async function recordBonus({ userId, points, reason }) {
  await pool.query(
    `INSERT INTO point_events (user_id, points, reason) VALUES ($1, $2, $3)`,
    [userId, points, reason]
  );
}

export async function checkAchievements(userId) {
  const newlyUnlocked = [];

  // Get current stats
  const [totalPtsRes, streakDays, masteryRes, gamesRes, sentencesRes, perfectRes] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(points), 0) as total FROM point_events WHERE user_id = $1`, [userId]),
    getStreakDays(userId),
    pool.query(`SELECT COUNT(*) as cnt FROM progress WHERE user_id = $1 AND status = 'mastered'`, [userId]),
    pool.query(`SELECT COUNT(DISTINCT session_id) as cnt FROM exercise_history WHERE user_id = $1 AND exercise_type = 'matching'`, [userId]),
    pool.query(`SELECT COUNT(*) as cnt FROM exercise_history WHERE user_id = $1 AND exercise_type = 'sentence' AND correct = true`, [userId]),
    pool.query(
      `SELECT COUNT(*) as cnt FROM (
        SELECT session_id FROM exercise_history
        WHERE user_id = $1 AND exercise_type = 'matching'
        GROUP BY session_id
        HAVING COUNT(*) = SUM(CASE WHEN correct THEN 1 ELSE 0 END) AND COUNT(*) >= 8
      ) sub`,
      [userId]
    ),
  ]);

  const totalPts = parseInt(totalPtsRes.rows[0].total);
  const masteredCount = parseInt(masteryRes.rows[0].cnt);
  const matchGames = parseInt(gamesRes.rows[0].cnt);
  const correctSentences = parseInt(sentencesRes.rows[0].cnt);
  const perfectRounds = parseInt(perfectRes.rows[0].cnt);
  const totalWords = (await pool.query(`SELECT COUNT(*) as cnt FROM words WHERE approved = true`)).rows[0].cnt;

  // Get already-unlocked achievement keys
  const unlockedRes = await pool.query(
    `SELECT a.key FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = $1`,
    [userId]
  );
  const unlocked = new Set(unlockedRes.rows.map(r => r.key));

  // Check each category
  const checks = [
    // Points
    { key: 'first_point', val: totalPts, thresh: 1 },
    { key: 'ten_points', val: totalPts, thresh: 10 },
    { key: 'fifty_points', val: totalPts, thresh: 50 },
    { key: 'hundred_points', val: totalPts, thresh: 100 },
    { key: 'five_hundred_points', val: totalPts, thresh: 500 },
    { key: 'thousand_points', val: totalPts, thresh: 1000 },
    { key: 'two_thousand_points', val: totalPts, thresh: 2000 },
    // Streaks
    { key: 'streak_3', val: streakDays, thresh: 3 },
    { key: 'streak_7', val: streakDays, thresh: 7 },
    { key: 'streak_14', val: streakDays, thresh: 14 },
    { key: 'streak_30', val: streakDays, thresh: 30 },
    // Mastery
    { key: 'mastery_10', val: masteredCount, thresh: 10 },
    { key: 'mastery_25', val: masteredCount, thresh: 25 },
    { key: 'mastery_50', val: masteredCount, thresh: 50 },
    { key: 'mastery_all', val: masteredCount, thresh: parseInt(totalWords) },
    // Games
    { key: 'first_match', val: matchGames, thresh: 1 },
    { key: 'first_sentence', val: correctSentences, thresh: 1 },
    { key: 'perfect_round', val: perfectRounds, thresh: 1 },
    { key: 'ten_perfect_rounds', val: perfectRounds, thresh: 10 },
    { key: 'hundred_sentences', val: correctSentences, thresh: 100 },
  ];

  for (const { key, val, thresh } of checks) {
    if (!unlocked.has(key) && val >= thresh) {
      const achRes = await pool.query(`SELECT id, title, emoji, description FROM achievements WHERE key = $1`, [key]);
      if (achRes.rows.length > 0) {
        await pool.query(
          `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, achRes.rows[0].id]
        );
        newlyUnlocked.push(achRes.rows[0]);
      }
    }
  }

  return newlyUnlocked;
}

export async function getStreakDays(userId) {
  const res = await pool.query(
    `SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') as d
     FROM point_events WHERE user_id = $1 AND points > 0
     ORDER BY d DESC`,
    [userId]
  );

  if (res.rows.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < res.rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const dayStr = expected.toISOString().split('T')[0];
    const rowStr = new Date(res.rows[i].d).toISOString().split('T')[0];

    if (rowStr === dayStr) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export async function getDailyTarget(userId) {
  // Count today's scheduled words, default 7
  const today = new Date().toISOString().split('T')[0];
  const schedRes = await pool.query(
    `SELECT COUNT(*) as cnt FROM learning_schedule WHERE user_id = $1 AND scheduled_date = $2`,
    [userId, today]
  );
  const scheduledWords = Math.max(parseInt(schedRes.rows[0].cnt), 7);
  // 7 matching (10pts each) + 2 sentences (20pts each) = 110
  return scheduledWords * 10 + 2 * 20;
}

export async function getTodayPoints(userId) {
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) as earned,
       COALESCE(SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END), 0) as lost
     FROM point_events
     WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`,
    [userId]
  );
  return { earned: parseInt(res.rows[0].earned), lost: parseInt(res.rows[0].lost) };
}

export function getTreeStage(totalPoints) {
  if (totalPoints >= 2000) return { stage: 6, name: 'Grand Tree' };
  if (totalPoints >= 1000) return { stage: 5, name: 'Full Tree' };
  if (totalPoints >= 500) return { stage: 4, name: 'Young Tree' };
  if (totalPoints >= 200) return { stage: 3, name: 'Sapling' };
  if (totalPoints >= 50) return { stage: 2, name: 'Sprout' };
  return { stage: 1, name: 'Seed' };
}
```

**Step 2: Verify no syntax errors by importing**

Run: `cd server && node -e "import('./gamification.js').then(() => console.log('OK')).catch(e => console.error(e))"`
Expected: "OK"

**Step 3: Commit**

```bash
git add server/gamification.js
git commit -m "feat: add gamification logic — points, streaks, achievements, tree stages"
```

---

### Task 4: Server — API Endpoints

**Files:**
- Modify: `server/index.js` (add 7 new endpoints)

**Step 1: Add imports at top of index.js**

After the existing imports (line ~10), add:

```js
import { recordExercise, recordBonus, getStreakDays, getDailyTarget, getTodayPoints, getTreeStage, checkAchievements } from './gamification.js';
```

**Step 2: Add the gamification endpoints**

Add these endpoints in `server/index.js` after the existing game endpoints (after the `/api/games/validate-sentence` route):

```js
// ── Gamification endpoints ──

// Record an exercise answer
app.post('/api/exercises', authMiddleware, async (req, res) => {
  try {
    const { wordId, exerciseType, correct, sessionId, metadata } = req.body;
    if (!wordId || !exerciseType || correct === undefined || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields: wordId, exerciseType, correct, sessionId' });
    }
    const result = await recordExercise({
      userId: req.user.id,
      wordId,
      exerciseType,
      correct,
      sessionId,
      metadata: metadata || {},
    });
    res.json(result);
  } catch (err) {
    console.error('Record exercise error:', err);
    res.status(500).json({ error: 'Failed to record exercise' });
  }
});

// Record a bonus (perfect round, daily target met)
app.post('/api/exercises/bonus', authMiddleware, async (req, res) => {
  try {
    const { points, reason } = req.body;
    await recordBonus({ userId: req.user.id, points, reason });
    const newAchievements = await checkAchievements(req.user.id);
    res.json({ ok: true, newAchievements });
  } catch (err) {
    console.error('Bonus error:', err);
    res.status(500).json({ error: 'Failed to record bonus' });
  }
});

// Exercise history (paginated)
app.get('/api/exercises/history', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT eh.*, w.word, w.visual_emoji
       FROM exercise_history eh
       JOIN words w ON w.id = eh.word_id
       WHERE eh.user_id = $1
       ORDER BY eh.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM exercise_history WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ history: result.rows, total: parseInt(countRes.rows[0].total), page, limit });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Session summaries
app.get('/api/exercises/sessions', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, exercise_type,
              COUNT(*) as total_answers,
              SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct_answers,
              SUM(points_earned) as total_points,
              MIN(created_at) as started_at,
              MAX(created_at) as ended_at
       FROM exercise_history WHERE user_id = $1
       GROUP BY session_id, exercise_type
       ORDER BY MAX(created_at) DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Today's points
app.get('/api/points/today', authMiddleware, async (req, res) => {
  try {
    const { earned, lost } = await getTodayPoints(req.user.id);
    const dailyTarget = await getDailyTarget(req.user.id);
    res.json({ earned, lost, dailyTarget });
  } catch (err) {
    console.error('Today points error:', err);
    res.status(500).json({ error: 'Failed to fetch today points' });
  }
});

// Total points
app.get('/api/points/total', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(points), 0) as total FROM point_events WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ total: parseInt(result.rows[0].total) });
  } catch (err) {
    console.error('Total points error:', err);
    res.status(500).json({ error: 'Failed to fetch total points' });
  }
});

// Streak
app.get('/api/streak', authMiddleware, async (req, res) => {
  try {
    const days = await getStreakDays(req.user.id);
    const { earned } = await getTodayPoints(req.user.id);
    const user = await pool.query(`SELECT streak_freezes FROM users WHERE id = $1`, [req.user.id]);
    res.json({
      days,
      todayActive: earned > 0,
      freezes: user.rows[0]?.streak_freezes || 0,
    });
  } catch (err) {
    console.error('Streak error:', err);
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

// Achievements
app.get('/api/achievements', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ua.unlocked_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
       ORDER BY a.category, a.threshold NULLS LAST`,
      [req.user.id]
    );
    res.json({ achievements: result.rows });
  } catch (err) {
    console.error('Achievements error:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Tree state
app.get('/api/tree', authMiddleware, async (req, res) => {
  try {
    const totalRes = await pool.query(
      `SELECT COALESCE(SUM(points), 0) as total FROM point_events WHERE user_id = $1`,
      [req.user.id]
    );
    const totalPoints = parseInt(totalRes.rows[0].total);
    const { earned, lost } = await getTodayPoints(req.user.id);
    const dailyTarget = await getDailyTarget(req.user.id);
    const { stage, name } = getTreeStage(totalPoints);
    const healthPercent = earned > 0 ? Math.min(100, Math.round((earned / (earned + lost)) * 100)) : 100;

    res.json({ totalPoints, stage, stageName: name, healthPercent, todayEarned: earned, todayLost: lost, dailyTarget });
  } catch (err) {
    console.error('Tree error:', err);
    res.status(500).json({ error: 'Failed to fetch tree state' });
  }
});

// Leaderboard
app.get('/api/leaderboard', authMiddleware, async (req, res) => {
  try {
    const period = req.query.period || 'week';
    let dateFilter;
    if (period === 'week') {
      dateFilter = `DATE(pe.created_at) >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else {
      dateFilter = `DATE(pe.created_at) >= DATE_TRUNC('month', CURRENT_DATE)`;
    }
    const result = await pool.query(
      `SELECT u.id, u.name, u.avatar_url,
              COALESCE(SUM(pe.points), 0) as weekly_points,
              COALESCE((SELECT SUM(points) FROM point_events WHERE user_id = u.id), 0) as total_points
       FROM users u
       LEFT JOIN point_events pe ON pe.user_id = u.id AND ${dateFilter}
       WHERE u.role = 'student'
       GROUP BY u.id, u.name, u.avatar_url
       HAVING COALESCE(SUM(pe.points), 0) > 0
       ORDER BY weekly_points DESC
       LIMIT 50`
    );

    const leaderboard = result.rows.map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      name: r.name,
      avatarUrl: r.avatar_url,
      weeklyPoints: parseInt(r.weekly_points),
      totalPoints: parseInt(r.total_points),
      tier: getTier(parseInt(r.total_points)),
    }));

    res.json({ leaderboard, period });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

function getTier(totalPoints) {
  if (totalPoints >= 2000) return { name: 'Diamond', emoji: '💎' };
  if (totalPoints >= 1000) return { name: 'Gold', emoji: '🥇' };
  if (totalPoints >= 500) return { name: 'Silver', emoji: '🥈' };
  return { name: 'Bronze', emoji: '🥉' };
}
```

**Step 3: Restart server and verify all endpoints return valid JSON**

Test manually: `curl http://localhost:3001/api/tree` (should 401 without auth, confirming route exists)

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add gamification API endpoints (exercises, points, streak, tree, leaderboard, achievements)"
```

---

### Task 5: Client — GamificationContext

**Files:**
- Create: `client/src/GamificationContext.jsx`
- Modify: `client/src/main.jsx` (wrap app in provider)

**Step 1: Create GamificationContext.jsx**

```jsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from './api.js';
import { useAuth } from './AuthContext.jsx';

const GamificationContext = createContext(null);

export function useGamification() {
  return useContext(GamificationContext);
}

export function GamificationProvider({ children }) {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState(null);
  const [streak, setStreak] = useState(null);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const sessionIdRef = useRef(crypto.randomUUID());

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [tree, streakData] = await Promise.all([
        apiFetch('/tree'),
        apiFetch('/streak'),
      ]);
      setTreeData(tree);
      setStreak(streakData);
    } catch (err) {
      console.error('Failed to refresh gamification:', err);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const newSessionId = useCallback(() => {
    sessionIdRef.current = crypto.randomUUID();
    return sessionIdRef.current;
  }, []);

  const recordExercise = useCallback(async ({ wordId, exerciseType, correct, metadata }) => {
    if (!user) return null;
    try {
      const result = await apiFetch('/exercises', {
        method: 'POST',
        body: {
          wordId,
          exerciseType,
          correct,
          sessionId: sessionIdRef.current,
          metadata,
        },
      });

      // Queue celebrations for new achievements
      if (result.newAchievements && result.newAchievements.length > 0) {
        setCelebrationQueue(prev => [...prev, ...result.newAchievements.map(a => ({
          type: 'achievement',
          title: a.title,
          emoji: a.emoji,
          description: a.description,
        }))]);
      }

      // Check for point milestones
      const milestones = [
        { threshold: 1, message: "You're on your way! 🌱" },
        { threshold: 10, message: "Double digits! 🎉" },
        { threshold: 50, message: "Your tree is sprouting! 🌿" },
        { threshold: 100, message: "Triple digits — amazing! ⭐" },
        { threshold: 500, message: "Half a thousand! You're a word wizard! 🧙" },
        { threshold: 1000, message: "ONE THOUSAND! Legendary! 👑" },
      ];
      const prevTotal = (treeData?.totalPoints || 0);
      const newTotal = result.totalPoints;
      for (const m of milestones) {
        if (prevTotal < m.threshold && newTotal >= m.threshold) {
          setCelebrationQueue(prev => [...prev, { type: 'milestone', message: m.message }]);
        }
      }

      // Refresh tree and streak
      await refresh();
      return result;
    } catch (err) {
      console.error('Failed to record exercise:', err);
      return null;
    }
  }, [user, treeData, refresh]);

  const recordBonus = useCallback(async ({ points, reason }) => {
    if (!user) return;
    try {
      const result = await apiFetch('/exercises/bonus', {
        method: 'POST',
        body: { points, reason },
      });
      if (result.newAchievements?.length > 0) {
        setCelebrationQueue(prev => [...prev, ...result.newAchievements.map(a => ({
          type: 'achievement',
          title: a.title,
          emoji: a.emoji,
          description: a.description,
        }))]);
      }
      await refresh();
    } catch (err) {
      console.error('Failed to record bonus:', err);
    }
  }, [user, refresh]);

  const dismissCelebration = useCallback(() => {
    setCelebrationQueue(prev => prev.slice(1));
  }, []);

  const value = {
    treeData,
    streak,
    celebrationQueue,
    sessionId: sessionIdRef.current,
    newSessionId,
    recordExercise,
    recordBonus,
    dismissCelebration,
    refresh,
  };

  return (
    <GamificationContext.Provider value={value}>
      {children}
    </GamificationContext.Provider>
  );
}
```

**Step 2: Wrap App in GamificationProvider in main.jsx**

Modify `client/src/main.jsx` to add the provider. The new file:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './AuthContext.jsx';
import { GamificationProvider } from './GamificationContext.jsx';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <GamificationProvider>
        <App />
      </GamificationProvider>
    </AuthProvider>
  </React.StrictMode>
);
```

**Step 3: Verify app loads without errors**

**Step 4: Commit**

```bash
git add client/src/GamificationContext.jsx client/src/main.jsx
git commit -m "feat: add GamificationContext with recordExercise, tree state, celebrations"
```

---

### Task 6: Client — CelebrationOverlay Component

**Files:**
- Create: `client/src/CelebrationOverlay.jsx`
- Modify: `client/src/App.jsx` (render overlay at app level)
- Modify: `client/src/index.css` (add celebration styles)

**Step 1: Create CelebrationOverlay.jsx**

```jsx
import React, { useEffect, useRef } from 'react';
import { useGamification } from './GamificationContext.jsx';

// Short cheerful chime using Web Audio API
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch (e) {
    // Audio not available, skip
  }
}

export default function CelebrationOverlay() {
  const { celebrationQueue, dismissCelebration } = useGamification();
  const timerRef = useRef(null);
  const current = celebrationQueue[0];

  useEffect(() => {
    if (current) {
      playChime();
      timerRef.current = setTimeout(() => {
        dismissCelebration();
      }, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, dismissCelebration]);

  if (!current) return null;

  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#1abc9c'][i % 6],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="celebration-overlay" onClick={dismissCelebration}>
      {confettiPieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            background: p.color,
            width: p.size,
            height: p.size,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
      <div className="celebration-content">
        {current.type === 'achievement' ? (
          <>
            <div className="celebration-emoji">{current.emoji}</div>
            <div className="celebration-title">Achievement Unlocked!</div>
            <div className="celebration-message">{current.title}</div>
            <div className="celebration-description">{current.description}</div>
          </>
        ) : (
          <>
            <div className="celebration-emoji">🎉</div>
            <div className="celebration-title">Milestone!</div>
            <div className="celebration-message">{current.message}</div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add celebration CSS to index.css**

Append to `client/src/index.css`:

```css
/* ── Celebration Overlay ── */
.celebration-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  cursor: pointer;
  overflow: hidden;
}

.celebration-content {
  text-align: center;
  animation: celebrationBounce 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
  z-index: 10001;
}

.celebration-emoji {
  font-size: 72px;
  margin-bottom: 16px;
}

.celebration-title {
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 8px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.celebration-message {
  font-size: 22px;
  font-weight: 700;
  color: #ffd700;
  margin-bottom: 8px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.celebration-description {
  font-size: 16px;
  color: rgba(255,255,255,0.85);
}

@keyframes celebrationBounce {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}

.confetti-piece {
  position: absolute;
  top: -10px;
  border-radius: 2px;
  animation: confettiFall 2.5s ease-in forwards;
}

@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}

/* ── Points Float Animation ── */
.points-float {
  position: absolute;
  font-weight: 800;
  font-size: 18px;
  pointer-events: none;
  animation: pointsFloat 1s ease-out forwards;
  z-index: 100;
}

.points-float.positive { color: #27ae60; }
.points-float.negative { color: #e74c3c; }

@keyframes pointsFloat {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-40px); opacity: 0; }
}
```

**Step 3: Render CelebrationOverlay in App.jsx**

In `client/src/App.jsx`, add the import at the top:

```js
import CelebrationOverlay from './CelebrationOverlay.jsx';
```

Then inside the `App` component's return, right before `</WordsProvider>` (around line 268), add:

```jsx
<CelebrationOverlay />
```

So the return ends like:

```jsx
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
    <CelebrationOverlay />
    </WordsProvider>
```

**Step 4: Verify app loads, no errors, overlay not visible (empty queue)**

**Step 5: Commit**

```bash
git add client/src/CelebrationOverlay.jsx client/src/App.jsx client/src/index.css
git commit -m "feat: add CelebrationOverlay with confetti, chime sound, and bounce animation"
```

---

### Task 7: Client — GrowthTree Component in Sidebar

**Files:**
- Create: `client/src/GrowthTree.jsx`
- Modify: `client/src/App.jsx` (add tree + streak to sidebar)

**Step 1: Create GrowthTree.jsx**

Create `client/src/GrowthTree.jsx` with an SVG tree that renders different visuals based on `stage` (1-6) and `healthPercent` (0-100). The tree should:

- Stage 1: brown seed/mound
- Stage 2: thin green stem with 1-2 small leaves
- Stage 3: small trunk with 3-4 branches and leaves
- Stage 4: taller trunk, 6-8 branches with leaves and some flowers
- Stage 5: full canopy with birds and flowers
- Stage 6: grand tree with golden leaves, butterflies, fruit

Health affects leaf colour: 100% = bright green, 50% = yellow-green, 25% = brown/dry, 0% = grey/bare.

Keep it as a single self-contained SVG component (~120x160px). Use CSS transitions for smooth stage changes.

```jsx
import React from 'react';

const LEAF_COLORS = {
  healthy: '#4CAF50',
  good: '#8BC34A',
  warning: '#FFC107',
  dry: '#A0522D',
  dead: '#9E9E9E',
};

function getLeafColor(healthPercent) {
  if (healthPercent >= 80) return LEAF_COLORS.healthy;
  if (healthPercent >= 60) return LEAF_COLORS.good;
  if (healthPercent >= 40) return LEAF_COLORS.warning;
  if (healthPercent >= 20) return LEAF_COLORS.dry;
  return LEAF_COLORS.dead;
}

function Leaves({ count, healthPercent, yBase, spread }) {
  const color = getLeafColor(healthPercent);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const x = 60 + Math.cos(angle) * spread;
    const y = yBase + Math.sin(angle) * spread * 0.6;
    return (
      <ellipse
        key={i}
        cx={x} cy={y}
        rx={8 + Math.random() * 4}
        ry={6 + Math.random() * 3}
        fill={color}
        opacity={0.8 + Math.random() * 0.2}
        style={{ transition: 'fill 1s ease' }}
      />
    );
  });
}

export default function GrowthTree({ stage = 1, healthPercent = 100 }) {
  return (
    <svg viewBox="0 0 120 160" width="120" height="160" style={{ display: 'block', margin: '0 auto' }}>
      {/* Ground */}
      <ellipse cx="60" cy="150" rx="50" ry="10" fill="#8B6914" opacity="0.3" />

      {stage === 1 && (
        /* Seed */
        <>
          <ellipse cx="60" cy="140" rx="12" ry="8" fill="#8B6914" />
          <ellipse cx="60" cy="138" rx="6" ry="4" fill="#A0522D" />
        </>
      )}

      {stage >= 2 && (
        /* Trunk — grows taller with stage */
        <rect
          x={stage >= 4 ? 54 : 57}
          y={stage >= 5 ? 60 : stage >= 4 ? 80 : stage >= 3 ? 100 : 120}
          width={stage >= 4 ? 12 : 6}
          height={150 - (stage >= 5 ? 60 : stage >= 4 ? 80 : stage >= 3 ? 100 : 120)}
          rx="3"
          fill="#8B6914"
          style={{ transition: 'all 1s ease' }}
        />
      )}

      {stage >= 2 && stage < 3 && (
        /* Sprout: 2 tiny leaves */
        <>
          <ellipse cx="52" cy="118" rx="8" ry="5" fill={getLeafColor(healthPercent)} transform="rotate(-30,52,118)" style={{ transition: 'fill 1s' }} />
          <ellipse cx="68" cy="115" rx="8" ry="5" fill={getLeafColor(healthPercent)} transform="rotate(30,68,115)" style={{ transition: 'fill 1s' }} />
        </>
      )}

      {stage >= 3 && stage < 4 && (
        /* Sapling: 4 branches */
        <>
          <line x1="60" y1="110" x2="40" y2="95" stroke="#8B6914" strokeWidth="3" />
          <line x1="60" y1="115" x2="80" y2="100" stroke="#8B6914" strokeWidth="3" />
          <Leaves count={6} healthPercent={healthPercent} yBase={90} spread={25} />
        </>
      )}

      {stage >= 4 && stage < 5 && (
        /* Young tree: 8 branches with flowers */
        <>
          <line x1="60" y1="100" x2="35" y2="80" stroke="#8B6914" strokeWidth="3" />
          <line x1="60" y1="95" x2="85" y2="75" stroke="#8B6914" strokeWidth="3" />
          <line x1="60" y1="110" x2="30" y2="95" stroke="#8B6914" strokeWidth="2" />
          <line x1="60" y1="105" x2="90" y2="90" stroke="#8B6914" strokeWidth="2" />
          <Leaves count={12} healthPercent={healthPercent} yBase={75} spread={30} />
          {healthPercent > 60 && <>
            <circle cx="38" cy="78" r="3" fill="#FF69B4" />
            <circle cx="82" cy="73" r="3" fill="#FF69B4" />
          </>}
        </>
      )}

      {stage >= 5 && stage < 6 && (
        /* Full tree: full canopy, birds */
        <>
          <line x1="60" y1="90" x2="30" y2="65" stroke="#8B6914" strokeWidth="4" />
          <line x1="60" y1="85" x2="90" y2="60" stroke="#8B6914" strokeWidth="4" />
          <line x1="60" y1="100" x2="25" y2="80" stroke="#8B6914" strokeWidth="3" />
          <line x1="60" y1="95" x2="95" y2="75" stroke="#8B6914" strokeWidth="3" />
          <Leaves count={20} healthPercent={healthPercent} yBase={55} spread={35} />
          {healthPercent > 50 && <>
            <circle cx="35" cy="62" r="3" fill="#FF69B4" />
            <circle cx="85" cy="58" r="3" fill="#FFB6C1" />
            <circle cx="50" cy="50" r="3" fill="#FF69B4" />
            {/* Bird */}
            <text x="20" y="45" fontSize="10">🐦</text>
          </>}
        </>
      )}

      {stage >= 6 && (
        /* Grand tree: golden leaves, butterflies, fruit */
        <>
          <line x1="60" y1="85" x2="25" y2="55" stroke="#8B6914" strokeWidth="5" />
          <line x1="60" y1="80" x2="95" y2="50" stroke="#8B6914" strokeWidth="5" />
          <line x1="60" y1="95" x2="20" y2="70" stroke="#8B6914" strokeWidth="4" />
          <line x1="60" y1="90" x2="100" y2="65" stroke="#8B6914" strokeWidth="4" />
          <line x1="60" y1="105" x2="30" y2="85" stroke="#8B6914" strokeWidth="3" />
          <line x1="60" y1="100" x2="90" y2="80" stroke="#8B6914" strokeWidth="3" />
          {/* Golden canopy */}
          {Array.from({ length: 24 }, (_, i) => {
            const angle = (i / 24) * Math.PI * 2;
            const x = 60 + Math.cos(angle) * 38;
            const y = 50 + Math.sin(angle) * 25;
            return (
              <ellipse key={i} cx={x} cy={y} rx={9} ry={7}
                fill={healthPercent > 60 ? '#FFD700' : getLeafColor(healthPercent)}
                opacity={0.85} style={{ transition: 'fill 1s' }} />
            );
          })}
          {healthPercent > 50 && <>
            <text x="15" y="40" fontSize="10">🦋</text>
            <text x="90" y="35" fontSize="10">🦋</text>
            <text x="20" y="55" fontSize="10">🐦</text>
            <circle cx="45" cy="70" r="4" fill="#e74c3c" /> {/* Fruit */}
            <circle cx="75" cy="65" r="4" fill="#e74c3c" />
          </>}
        </>
      )}
    </svg>
  );
}
```

**Step 2: Add tree and streak to sidebar in App.jsx**

In `client/src/App.jsx`, add the imports:

```js
import GrowthTree from './GrowthTree.jsx';
import { useGamification } from './GamificationContext.jsx';
```

Inside the `App()` function, add:

```js
const { treeData, streak } = useGamification() || {};
```

Then in the sidebar JSX, between the `</div>` closing `.nav-items` (line ~243) and `<div className="sidebar-footer">` (line ~245), insert:

```jsx
        {/* Gamification widgets */}
        {user && treeData && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--cream-dark, #e0d5c1)' }}>
            {streak && (
              <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 14, fontWeight: 700, color: 'var(--orange, #f39c12)' }}>
                🔥 {streak.days} day streak{!streak.todayActive && streak.days > 0 ? ' — keep it going!' : ''}
              </div>
            )}
            <GrowthTree stage={treeData.stage} healthPercent={treeData.healthPercent} />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
              ⚡ {treeData.todayEarned} / {treeData.dailyTarget} pts today
            </div>
          </div>
        )}
```

**Step 3: Verify sidebar shows tree (will be seed/stage 1 with 0 points)**

**Step 4: Commit**

```bash
git add client/src/GrowthTree.jsx client/src/App.jsx
git commit -m "feat: add GrowthTree SVG component in sidebar with streak counter"
```

---

### Task 8: Client — Integrate MatchingGame with Gamification

**Files:**
- Modify: `client/src/pages/MatchingGame.jsx`

**Step 1: Wire up GamificationContext in MatchingGame**

Key changes to `client/src/pages/MatchingGame.jsx`:

1. Import `useGamification`:
   ```js
   import { useGamification } from '../GamificationContext.jsx';
   ```

2. Inside the component, add:
   ```js
   const { recordExercise, recordBonus, newSessionId } = useGamification() || {};
   ```

3. In `startGame()` (line 38), call `newSessionId()` at the start:
   ```js
   const startGame = useCallback(async () => {
     if (newSessionId) newSessionId();
     // ... rest of existing code
   ```

4. In `handleDefClick` correct match block (line 80-101), after `setSelectedWord(null)` (line 86), replace the `apiFetch('/progress/...')` call with:
   ```js
   if (recordExercise) {
     await recordExercise({
       wordId: defWord.id,
       exerciseType: 'matching',
       correct: true,
       metadata: { timeElapsed: timer },
     });
   }
   ```

5. In the wrong match block (line 102-119), replace the `apiFetch('/progress/...')` call with:
   ```js
   if (recordExercise) {
     await recordExercise({
       wordId: selectedWord.id,
       exerciseType: 'matching',
       correct: false,
       metadata: {},
     });
   }
   ```

6. In the game complete check (line 97-101), after `clearInterval`, add perfect round bonus:
   ```js
   if (newMatched.size === words.length) {
     setGameComplete(true);
     setGameActive(false);
     if (timerRef.current) clearInterval(timerRef.current);
     // Perfect round bonus if no wrong answers
     if (score + 1 === words.length && recordBonus) {
       recordBonus({ points: 25, reason: 'perfect_round' });
     }
   }
   ```

7. Add a floating points indicator: add `pointsFloat` state and render it near matched items. Add state:
   ```js
   const [pointsFloat, setPointsFloat] = useState(null);
   ```
   After recording a correct exercise, show float:
   ```js
   setPointsFloat({ id: Date.now(), points: '+10', positive: true });
   setTimeout(() => setPointsFloat(null), 1000);
   ```
   After wrong:
   ```js
   setPointsFloat({ id: Date.now(), points: '-3', positive: false });
   setTimeout(() => setPointsFloat(null), 1000);
   ```
   Render in the game header area:
   ```jsx
   {pointsFloat && (
     <span key={pointsFloat.id} className={`points-float ${pointsFloat.positive ? 'positive' : 'negative'}`}>
       {pointsFloat.points}
     </span>
   )}
   ```

**Step 2: Play a matching game and verify points appear, tree updates in sidebar**

**Step 3: Commit**

```bash
git add client/src/pages/MatchingGame.jsx
git commit -m "feat: integrate MatchingGame with gamification — records exercises, shows floating points"
```

---

### Task 9: Client — Integrate SentenceBuilder with Gamification

**Files:**
- Modify: `client/src/pages/SentenceBuilder.jsx`

**Step 1: Wire up GamificationContext**

Key changes to `client/src/pages/SentenceBuilder.jsx`:

1. Import:
   ```js
   import { useGamification } from '../GamificationContext.jsx';
   ```

2. Add to component:
   ```js
   const { recordExercise } = useGamification() || {};
   const [pointsFloat, setPointsFloat] = useState(null);
   ```

3. In `handleSubmit()` (line 97-117), after `setFeedback(data)` (line 110), add:
   ```js
   if (recordExercise) {
     const result = await recordExercise({
       wordId: currentWord.id,
       exerciseType: 'sentence',
       correct: data.correct,
       metadata: { sentence: sentence.trim(), feedback: data.feedback },
     });
     if (result) {
       const pts = data.correct ? '+20' : '-5';
       setPointsFloat({ id: Date.now(), points: pts, positive: data.correct });
       setTimeout(() => setPointsFloat(null), 1000);
     }
   }
   ```

4. Add float display somewhere near the feedback area:
   ```jsx
   {pointsFloat && (
     <span key={pointsFloat.id} className={`points-float ${pointsFloat.positive ? 'positive' : 'negative'}`}
       style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)' }}>
       {pointsFloat.points}
     </span>
   )}
   ```

**Step 2: Test by submitting a sentence, verify points + tree update**

**Step 3: Commit**

```bash
git add client/src/pages/SentenceBuilder.jsx
git commit -m "feat: integrate SentenceBuilder with gamification — records exercises, shows floating points"
```

---

### Task 10: Client — Achievement Badges on Dashboard

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`

**Step 1: Add achievements section to Dashboard**

Add to imports:
```js
import { useGamification } from '../GamificationContext.jsx';
```

Inside the component, add:
```js
const { treeData } = useGamification() || {};
const [achievements, setAchievements] = useState([]);

useEffect(() => {
  if (user) {
    apiFetch('/achievements')
      .then(data => setAchievements(data.achievements || []))
      .catch(() => {});
  }
}, [user]);
```

Add a badges section after the "Your Progress" card (after line ~247), before the "What would you like to do?" card:

```jsx
{/* Achievement Badges */}
{achievements.length > 0 && (
  <div className="card" style={{ marginTop: '1.5rem' }}>
    <h3 style={{ marginBottom: '1rem' }}>🏆 Achievements</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px' }}>
      {achievements.map(a => (
        <div key={a.id} style={{
          textAlign: 'center', padding: '10px 6px', borderRadius: 10,
          background: a.unlocked_at ? 'var(--cream, #f5f0e8)' : '#f0f0f0',
          opacity: a.unlocked_at ? 1 : 0.4,
          border: a.unlocked_at ? '2px solid var(--green, #6b9e7a)' : '2px solid #ddd',
          transition: 'all 0.2s',
        }}>
          <div style={{ fontSize: 28 }}>{a.unlocked_at ? a.emoji : '❓'}</div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, lineHeight: 1.2 }}>
            {a.unlocked_at ? a.title : '???'}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

Also add a points summary card after the welcome card:

```jsx
{/* Points Summary */}
{treeData && (
  <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green-dark)' }}>
        ⚡ {treeData.totalPoints} pts
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Today: {treeData.todayEarned} / {treeData.dailyTarget} pts
      </div>
    </div>
    <div style={{ height: 6, flex: 2, minWidth: 120, background: 'var(--cream-dark)', borderRadius: 3 }}>
      <div style={{
        height: '100%', borderRadius: 3, transition: 'width 0.3s',
        width: `${Math.min(100, (treeData.todayEarned / treeData.dailyTarget) * 100)}%`,
        background: treeData.todayEarned >= treeData.dailyTarget ? 'var(--green)' : 'var(--orange, #f39c12)',
      }} />
    </div>
  </div>
)}
```

**Step 2: Verify dashboard shows badges (all locked initially) and points summary**

**Step 3: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat: add achievement badges grid and points summary to Dashboard"
```

---

### Task 11: Client — Leaderboard Page

**Files:**
- Create: `client/src/pages/Leaderboard.jsx`
- Modify: `client/src/App.jsx` (add route + nav item)

**Step 1: Create Leaderboard.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Leaderboard() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/leaderboard?period=${period}`)
      .then(data => setLeaderboard(data.leaderboard || []))
      .catch(err => console.error('Leaderboard error:', err))
      .finally(() => setLoading(false));
  }, [user, period]);

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Leaderboard</h2>
        <p>Please log in to see the leaderboard.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>🏆 Leaderboard</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            className={period === 'week' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setPeriod('week')}
            style={{ fontSize: 13 }}
          >
            This Week
          </button>
          <button
            className={period === 'month' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setPeriod('month')}
            style={{ fontSize: 13 }}
          >
            This Month
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading leaderboard...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: 32 }}>📊</p>
          <p>No activity yet this {period}. Start practising to get on the board!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {leaderboard.map((entry) => {
            const isMe = entry.userId === user.id;
            const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
            return (
              <div
                key={entry.userId}
                className="card"
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  border: isMe ? '2px solid var(--green)' : undefined,
                  background: isMe ? '#E8F5EC' : undefined,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, minWidth: 36, textAlign: 'center' }}>
                  {rankEmoji}
                </div>
                <img
                  src={entry.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.name)}&background=6B9E7A&color=fff&size=36`}
                  alt={entry.name}
                  style={{ width: 36, height: 36, borderRadius: '50%' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {entry.name} {isMe && <span style={{ fontSize: 12, color: 'var(--green)' }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {entry.tier.emoji} {entry.tier.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green-dark)' }}>
                    {entry.weeklyPoints}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add Leaderboard to App.jsx routing**

Import at top:
```js
import Leaderboard from './pages/Leaderboard.jsx';
```

Add to `NAV_ITEMS` array (after calendar, line ~15):
```js
{ id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
```

Add to `renderPage()` switch (after calendar case):
```js
case 'leaderboard': return <Leaderboard />;
```

The final NAV_ITEMS:
```js
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'words', label: 'Word List', icon: '📚' },
  { id: 'clusters', label: 'Word Clusters', icon: '🕸️' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '🔧' },
];
```

**Step 3: Verify Leaderboard page renders (empty state initially)**

**Step 4: Commit**

```bash
git add client/src/pages/Leaderboard.jsx client/src/App.jsx
git commit -m "feat: add Leaderboard page with weekly/monthly ranking and league tiers"
```

---

### Task 12: Integration Testing & Polish

**Files:**
- Various — all modified files

**Step 1: Full flow test**

1. Start both servers
2. Log in as a student
3. Play a matching game — verify:
   - Floating points (+10/-3) appear on correct/wrong matches
   - Tree in sidebar updates after game
   - Streak counter appears
   - "First Match" achievement celebration triggers on first game
   - Perfect round triggers "Perfectionist" achievement + 25 bonus
4. Use Sentence Builder — verify:
   - Points awarded (+20/-5) after Claude validation
   - "Wordsmith" achievement on first correct sentence
5. Check Dashboard — verify:
   - Points summary card shows correct totals
   - Achievement badges show unlocked ones with emoji, locked with "?"
   - Daily progress bar fills up
6. Check Leaderboard — verify:
   - Student appears with correct weekly points
   - Tier badge shows correctly

**Step 2: Fix any issues found during testing**

**Step 3: Build client for production**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete gamification system — points, tree, celebrations, leaderboard, achievements"
```

---

## Summary of All Files

**New files (7):**
- `server/gamification.js` — points logic, streak calculation, achievement checking
- `server/seed-achievements.js` — achievement definitions + seed function
- `client/src/GamificationContext.jsx` — React context for gamification state
- `client/src/CelebrationOverlay.jsx` — confetti + chime celebration component
- `client/src/GrowthTree.jsx` — SVG tree component for sidebar
- `client/src/pages/Leaderboard.jsx` — weekly leaderboard page
- `docs/plans/2026-04-12-gamification-design.md` — design document (already committed)

**Modified files (7):**
- `server/schema.sql` — 4 new tables + 1 migration
- `server/index.js` — import seed + gamification, 11 new API endpoints
- `client/src/main.jsx` — wrap in GamificationProvider
- `client/src/App.jsx` — import tree/leaderboard/overlay, sidebar widgets, nav item, route
- `client/src/index.css` — celebration + points-float animations
- `client/src/pages/MatchingGame.jsx` — record exercises via context
- `client/src/pages/SentenceBuilder.jsx` — record exercises via context
- `client/src/pages/Dashboard.jsx` — achievements grid + points summary

# Gamification & Exercise History Design

## Overview

Add a points-based gamification system with exercise history tracking, a growing tree visualisation, milestone celebrations, achievement badges, daily streaks, and a weekly leaderboard. Inspired by Duolingo. All state computed from normalised tables (Approach A).

## Database Schema

### exercise_history — every individual answer

```sql
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
```

exercise_type values: 'matching', 'sentence', 'picture_prompt', 'related_match'
metadata examples: {sentence: "...", feedback: "...", time_ms: 3200}

### point_events — every point earned or deducted

```sql
CREATE TABLE IF NOT EXISTS point_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  exercise_history_id INTEGER REFERENCES exercise_history(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_points_user_date ON point_events(user_id, created_at);
```

reason values: 'matching_correct', 'matching_wrong', 'sentence_correct', 'sentence_wrong', 'picture_prompt_correct', 'picture_prompt_wrong', 'related_match_correct', 'related_match_wrong', 'streak_bonus', 'perfect_round', 'daily_target_met', 'milestone_bonus'

### achievements — badge definitions (seeded)

```sql
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  threshold INTEGER,
  category VARCHAR(30) NOT NULL
);
```

Categories: 'points', 'streak', 'mastery', 'games'

### user_achievements — unlocked badges per user

```sql
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);
```

### users table addition

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER DEFAULT 0;
```

## Points System

| Exercise | Correct | Wrong |
|----------|---------|-------|
| Matching (per word) | +10 | −3 |
| Sentence Builder | +20 | −5 |
| Picture Prompt | +15 | −4 |
| Related Match | +10 | −3 |

### Bonuses
- Perfect matching round (8/8): +25
- Streak bonus: every 5 correct in a row → +10
- Daily target met: +15

### Daily Target
Auto-calculated from schedule: 7 words × 10pts (matching) + 2 sentences × 20pts = 110 points/day.

## Growth Tree

Lives in the sidebar, below nav links. Pure CSS/SVG component (~120×160px).

### Stages

| Stage | Points | Visual |
|-------|--------|--------|
| Seed | 0–49 | Small seed in soil |
| Sprout | 50–199 | Tiny green shoot, 1-2 leaves |
| Sapling | 200–499 | Small trunk, 3-4 branches with leaves |
| Young tree | 500–999 | Taller trunk, 6-8 branches, some flowers |
| Full tree | 1000–1999 | Full canopy, birds, flowers |
| Grand tree | 2000+ | Majestic tree, golden leaves, butterflies, fruit |

### Branch Health (Error Mechanic)
- Each branch has health state: green → yellow → dry → dead
- Wrong answers: newest branches start turning yellow/dry
- Correct answers: restore branches in order (dry → yellow → green) before growing new ones
- Tree never drops a full stage — worst case all current-stage branches go dry, trunk stays
- healthPercent = ratio of today's earned vs lost points (clamped 0–100)

### Sidebar Display
- Tree SVG with smooth CSS transitions
- Below tree: "🔥 85 / 110 pts" (today's points / daily target)
- Streak counter above tree: "🔥 5 day streak"

## Milestones & Celebrations

### Milestone Triggers

| Milestone | Trigger | Message |
|-----------|---------|---------|
| First Point | 1st correct answer ever | "You're on your way! 🌱" |
| 10 Points | total ≥ 10 | "Double digits! 🎉" |
| 50 Points | total ≥ 50 | "Your tree is sprouting! 🌿" |
| 100 Points | total ≥ 100 | "Triple digits — amazing! ⭐" |
| 500 Points | total ≥ 500 | "Half a thousand! You're a word wizard! 🧙" |
| 1000 Points | total ≥ 1000 | "ONE THOUSAND! Legendary! 👑" |
| Perfect Round | 8/8 matching | "Flawless victory! 💯" |
| 7-Day Streak | 7 consecutive days | "One whole week — unstoppable! 🔥" |
| 30-Day Streak | 30 consecutive days | "A whole month! Incredible! 🏆" |
| 10 Words Mastered | mastered count ≥ 10 | "10 words down! 📚" |
| 50 Words Mastered | mastered count ≥ 50 | "50 words mastered! Scholar! 🎓" |

### CelebrationOverlay Component
- Full-screen overlay, rendered at App level
- Confetti: ~50 CSS-animated coloured squares/circles falling
- Bouncy scale-in text animation for message
- Sound: short cheerful chime via Web Audio API (~1s, base64-encoded inline)
- Auto-dismisses after 3 seconds, click to dismiss early
- Queues multiple milestones sequentially

## Achievement Badges

### Seeded Definitions

**Points:** First Point, 10pts, 50pts, 100pts, 500pts, 1000pts, 2000pts
**Streaks:** 3-day, 7-day, 14-day, 30-day
**Mastery:** 10 words, 25 words, 50 words, all words mastered
**Games:** First matching game, first sentence, perfect round, 10 perfect rounds, 100 sentences written

### Display
- Badge grid on Dashboard
- Locked: greyed out with "?" icon
- Unlocked: emoji + title + unlock date

### Achievement Check
Server-side after every POST /api/exercises:
1. Query current totals (points, streak, mastery count, game counts)
2. Compare against unearned achievement thresholds
3. Insert newly unlocked achievements
4. Return newAchievements[] in API response
5. Client triggers celebration for each

## Daily Streak

- Day counts if user earns ≥1 point
- Computed server-side: query point_events grouped by date, count consecutive days backward from today
- Displayed in sidebar above tree
- If today has no points: "🔥 5 — keep it going today!"

### Streak Freeze
- Earn 1 freeze per 7-day streak achieved
- Max 2 banked (stored in users.streak_freezes)
- Auto-consumed if a day is missed

## Leaderboard

### Weekly XP Leaderboard
- Resets every Monday
- GET /api/leaderboard?period=week — top users by points earned this week
- Shows: rank, name, avatar, weekly points, streak
- Current user highlighted
- New sidebar page: Leaderboard.jsx

### League Tiers (based on all-time points)
- Bronze (0–499), Silver (500–999), Gold (1000–1999), Diamond (2000+)
- Tier badge shown on leaderboard and dashboard

## API Endpoints

### Exercise History
- POST /api/exercises — save answer, returns points_earned + newAchievements[]
- GET /api/exercises/history?page=1&limit=20 — paginated history
- GET /api/exercises/sessions — session summaries

### Points & Gamification
- GET /api/points/today — today's earned, target, lost
- GET /api/points/total — all-time total
- GET /api/streak — current streak, freezes, today status
- GET /api/leaderboard?period=week — weekly rankings
- GET /api/achievements — all achievements with unlock status

### Tree State
- GET /api/tree — { totalPoints, stage, healthPercent, todayEarned, todayLost, dailyTarget }
- Computed from point_events, not stored separately

## Client Integration

### GamificationContext (new React context)
Provides: todayPoints, dailyTarget, totalPoints, streak, treeStage, healthPercent, newAchievements queue
Method: recordExercise(data) — posts to API, updates local state, checks celebrations
Refreshes on mount + after each exercise

### Page Changes
- **MatchingGame.jsx:** Generate sessionId on start, POST /api/exercises per match, floating points animation (+10/−3), check newAchievements on complete
- **SentenceBuilder.jsx:** Generate sessionId, POST /api/exercises on Claude feedback, points animation
- **WordDetail.jsx:** Wrap picture prompt and related match handlers to also POST /api/exercises
- **App.jsx:** Fetch tree + streak on mount, render GrowthTree in sidebar, CelebrationOverlay at App level
- **Dashboard.jsx:** Add badges grid section

### New Pages
- **Leaderboard.jsx** — weekly rankings table

### Updated Sidebar Order
1. Dashboard
2. Calendar
3. Leaderboard (NEW)
4. Word List
5. Word Clusters
6. My Profile
7. Settings

Persistent sidebar widgets:
- 🔥 Streak counter
- 🌳 Growth tree
- Today's points / daily target

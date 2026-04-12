CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
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
  favorite_anchor INTEGER,
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

-- Migration: add favorite_anchor if missing
DO $$ BEGIN
  ALTER TABLE progress ADD COLUMN favorite_anchor INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Migration: add voice_preference to users
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN voice_preference VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Migration: add quotes column to words
DO $$ BEGIN
  ALTER TABLE words ADD COLUMN quotes JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Learning schedule table
CREATE TABLE IF NOT EXISTS learning_schedule (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_user_date ON learning_schedule(user_id, scheduled_date);

-- Migration: add unique constraint on email
DO $$ BEGIN
  CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  year_of_birth INTEGER,
  gender VARCHAR(30),
  countries TEXT[] DEFAULT '{}',
  places_people TEXT[] DEFAULT '{}',
  about_me TEXT,
  books JSONB DEFAULT '[]',
  tv_shows JSONB DEFAULT '[]',
  youtube_interests TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

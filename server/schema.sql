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

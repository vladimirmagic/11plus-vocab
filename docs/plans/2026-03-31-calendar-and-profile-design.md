# Calendar & My Profile Design

## Calendar Page

Month grid view added to sidebar as "Calendar". Each day cell shows colour-coded dots for word status (green=mastered, orange=learning, grey=not started) and a progress badge (e.g. "3/7"). Today is highlighted with a green border.

Clicking a day expands a detail panel below the grid showing 7 target words. Each word displays a status badge, a clickable link to its word page, and a brief definition. An "Edit" button lets users swap a word with another unscheduled one.

### Schedule Logic

- 7 words per day, assigned by difficulty (easiest first: difficulty 1, then 2, then 3; alphabetical within same difficulty)
- Words already mastered are skipped
- Schedule starts from today, fills forward
- Past days show actual activity based on `last_practiced` timestamps

### Database

```sql
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
```

## My Profile Page

Sidebar entry "My Profile" between Word Clusters and Settings.

### Sections

**About Me:** Year of birth (dropdown), gender (Boy/Girl/Prefer not to say), countries (multi-select tags), places and people they love (free text tags), free text "About me" textarea.

**Books & Reading:** Add books as tags/cards, optionally mark favourites.

**TV & Film:** Add shows/films as tags/cards, optionally mark favourites.

**YouTube:** Text input for favourite channels/topics. Placeholder for future YouTube history integration.

### Database

```sql
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
```

Books and TV shows JSONB format: `[{"title": "Harry Potter", "favourite": true}]`

## Personalization Integration

When generating content via Claude or Imagen, fetch the user's profile and inject interests into prompts:

- **Book quotes**: Replace hardcoded book list with user's books
- **Visual anchors / picture hints**: Reference user interests in scene descriptions
- **Text prompts / picture prompts**: Scenarios reference user's world (shows, places, people)
- **Fallback**: If no profile exists, use current generic prompts (no breaking change)

## Updated Sidebar Order

1. Dashboard
2. Calendar (NEW)
3. Word List
4. Word Clusters
5. My Profile (NEW)
6. Settings

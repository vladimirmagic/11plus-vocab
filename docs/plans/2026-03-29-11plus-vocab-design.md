# 11 Plus Vocabulary Trainer - Design Document

**Date:** 2026-03-29
**Status:** Approved

## Overview

A vocabulary learning platform for 11+ exam preparation (ages 9-10). Uses Claude AI for intelligent content generation and Google OAuth for user accounts. Deployed on Railway.

## Tech Stack

- **Frontend:** React 18 + Vite
- **Backend:** Express.js + PostgreSQL (Railway)
- **Auth:** Google OAuth + JWT
- **AI:** Claude API (Anthropic SDK) - server-side only
- **Deployment:** Railway via Docker (multi-stage build)
- **Repo:** GitHub (vladimirmagic)

## Architecture

```
11plus-vocab/
├── client/              # React 18 + Vite
│   └── src/
│       ├── components/  # Reusable UI components
│       ├── pages/       # Dashboard, WordList, Clusters, MatchingGame, SentenceBuilder, Admin
│       ├── contexts/    # AuthContext, WordContext
│       ├── hooks/       # useWords, useProgress, useAuth
│       └── utils/       # API helpers
├── server/
│   ├── index.js         # Express entry
│   ├── routes/          # /api/auth, /api/words, /api/progress, /api/admin
│   ├── services/        # claude.js (AI), pdf-parser.js
│   └── db/              # PostgreSQL schema, queries
├── Dockerfile           # Multi-stage build
├── railway.json
└── package.json         # Root orchestration
```

## Database Schema

```sql
users: id, google_id, email, name, avatar_url, role('student'|'admin'), created_at

words: id, word, definition, example_sentence, teacher_tip,
       synonyms[], antonyms[], category, difficulty,
       visual_emoji, visual_description, created_at

progress: id, user_id, word_id, status('new'|'learning'|'mastered'),
          times_practiced, last_practiced, created_at

uploads: id, user_id, filename, words_extracted, created_at
```

## Pages

### Student
1. **Dashboard** - Progress stats, words mastered today, suggested reviews
2. **Word List** - Searchable/filterable library, click for detail card (definition, example, tip, emoji, synonyms/antonyms)
3. **Word Clusters** - Visual network graph of synonym/antonym relationships
4. **Matching Game** - Drag-and-drop word-to-definition matching (8 per round, timed, scored)
5. **Sentence Builder** - Construct sentences with a given word, Claude validates usage

### Admin (role='admin')
6. **Admin Panel** - Upload PDF/text, Claude extracts words + generates content, admin reviews/approves. Manual add/edit.

## Visual Anchors

No AI image generation. Each word gets 3 "visual anchor cards":
- Large relevant emoji
- Vivid 1-sentence scene description (Claude-generated)
- Soft gradient background per category

Students favorite the anchor that resonates most.

## API Routes

```
POST   /api/auth/google             # Google OAuth → JWT
GET    /api/auth/me                  # Current user

GET    /api/words                    # All words (paginated, filterable)
GET    /api/words/:id                # Single word detail
GET    /api/words/:id/clusters       # Synonym/antonym graph

GET    /api/progress                 # User's progress
PUT    /api/progress/:wordId         # Update word status

POST   /api/games/validate-sentence  # Claude validates sentence

POST   /api/admin/upload             # Upload doc → extract words
GET    /api/admin/pending            # Words awaiting approval
POST   /api/admin/approve/:wordId    # Approve word
PUT    /api/admin/words/:wordId      # Edit word
POST   /api/admin/words              # Add word manually
DELETE /api/admin/words/:wordId      # Remove word
```

## Claude API Usage (server-side)
- Document upload: extract vocabulary, generate definitions/examples/tips/synonyms/antonyms/visual anchors
- Sentence validation: check grammar and correct word usage
- Manual word add: auto-generate all supporting content from the word alone

## UI Theme
Warm organic aesthetic: soft creams, muted greens, rounded corners, friendly typography. Mobile-responsive. Designed to reduce study anxiety.

## Seed Data
~100-150 high-frequency 11+ vocabulary words pre-loaded at first deploy.

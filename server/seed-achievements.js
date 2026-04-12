import pool from './db.js';

const ACHIEVEMENTS = [
  // Points (7)
  { key: 'first_point',           title: 'First Steps',     description: 'Earn your first point',        emoji: '\u{1F331}', threshold: 1,     category: 'points' },
  { key: 'ten_points',            title: 'Double Digits',    description: 'Earn 10 points',               emoji: '\u{1F389}', threshold: 10,    category: 'points' },
  { key: 'fifty_points',          title: 'Rising Star',      description: 'Earn 50 points',               emoji: '\u{1F33F}', threshold: 50,    category: 'points' },
  { key: 'hundred_points',        title: 'Triple Digits',    description: 'Earn 100 points',              emoji: '\u2B50',    threshold: 100,   category: 'points' },
  { key: 'five_hundred_points',   title: 'Word Wizard',      description: 'Earn 500 points',              emoji: '\u{1F9D9}', threshold: 500,   category: 'points' },
  { key: 'thousand_points',       title: 'Legendary',        description: 'Earn 1000 points',             emoji: '\u{1F451}', threshold: 1000,  category: 'points' },
  { key: 'two_thousand_points',   title: 'Grand Master',     description: 'Earn 2000 points',             emoji: '\u{1F48E}', threshold: 2000,  category: 'points' },

  // Streak (4)
  { key: 'streak_3',   title: 'Hat Trick',       description: '3-day streak',   emoji: '\u{1F525}', threshold: 3,   category: 'streak' },
  { key: 'streak_7',   title: 'One Week',         description: '7-day streak',   emoji: '\u{1F525}', threshold: 7,   category: 'streak' },
  { key: 'streak_14',  title: 'Fortnight',        description: '14-day streak',  emoji: '\u{1F525}', threshold: 14,  category: 'streak' },
  { key: 'streak_30',  title: 'Monthly Master',   description: '30-day streak',  emoji: '\u{1F3C6}', threshold: 30,  category: 'streak' },

  // Mastery (4)
  { key: 'mastery_10',   title: 'Word Collector',  description: 'Master 10 words',       emoji: '\u{1F4DA}', threshold: 10,   category: 'mastery' },
  { key: 'mastery_25',   title: 'Bookworm',        description: 'Master 25 words',       emoji: '\u{1F4D6}', threshold: 25,   category: 'mastery' },
  { key: 'mastery_50',   title: 'Scholar',          description: 'Master 50 words',       emoji: '\u{1F393}', threshold: 50,   category: 'mastery' },
  { key: 'mastery_all',  title: 'Complete!',        description: 'Master every word',     emoji: '\u{1F3C5}', threshold: null, category: 'mastery' },

  // Games (5)
  { key: 'first_match',          title: 'First Match',    description: 'Complete your first matching game',       emoji: '\u{1F3AF}', threshold: 1,    category: 'games' },
  { key: 'first_sentence',       title: 'Wordsmith',      description: 'Write your first correct sentence',      emoji: '\u270D\uFE0F',  threshold: 1,    category: 'games' },
  { key: 'perfect_round',        title: 'Perfectionist',  description: 'Get a perfect matching round (8/8)',     emoji: '\u{1F4AF}', threshold: 1,    category: 'games' },
  { key: 'ten_perfect_rounds',   title: 'Flawless',       description: 'Get 10 perfect matching rounds',         emoji: '\u{1F3C5}', threshold: 10,   category: 'games' },
  { key: 'hundred_sentences',    title: 'Author',         description: 'Write 100 correct sentences',            emoji: '\u{1F4DD}', threshold: 100,  category: 'games' },
];

export async function seedAchievements() {
  try {
    for (const a of ACHIEVEMENTS) {
      await pool.query(`
        INSERT INTO achievements (key, title, description, emoji, threshold, category)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (key) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          emoji = EXCLUDED.emoji,
          threshold = EXCLUDED.threshold,
          category = EXCLUDED.category
      `, [a.key, a.title, a.description, a.emoji, a.threshold, a.category]);
    }
    // Clean up old achievement keys that are no longer in the spec
    const validKeys = ACHIEVEMENTS.map(a => a.key);
    await pool.query(
      'DELETE FROM achievements WHERE key != ALL($1::text[])',
      [validKeys]
    );
    console.log(`Seeded ${ACHIEVEMENTS.length} achievements`);
  } catch (err) {
    console.error('Failed to seed achievements:', err.message);
  }
}

export { ACHIEVEMENTS };

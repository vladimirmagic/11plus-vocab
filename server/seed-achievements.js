import pool from './db.js';

const ACHIEVEMENTS = [
  // ── Points (7) ──
  { key: 'points_100',    title: 'First Hundred',     description: 'Earn 100 points total',               emoji: '💯', threshold: 100,    category: 'points' },
  { key: 'points_500',    title: 'Rising Star',        description: 'Earn 500 points total',               emoji: '⭐', threshold: 500,    category: 'points' },
  { key: 'points_1000',   title: 'Point Collector',    description: 'Earn 1,000 points total',             emoji: '🏅', threshold: 1000,   category: 'points' },
  { key: 'points_2500',   title: 'Word Warrior',       description: 'Earn 2,500 points total',             emoji: '⚔️', threshold: 2500,   category: 'points' },
  { key: 'points_5000',   title: 'Vocabulary Hero',    description: 'Earn 5,000 points total',             emoji: '🦸', threshold: 5000,   category: 'points' },
  { key: 'points_10000',  title: 'Legendary Learner',  description: 'Earn 10,000 points total',            emoji: '👑', threshold: 10000,  category: 'points' },
  { key: 'points_25000',  title: 'Grand Master',       description: 'Earn 25,000 points total',            emoji: '🏆', threshold: 25000,  category: 'points' },

  // ── Streak (4) ──
  { key: 'streak_3',   title: 'Getting Started',   description: 'Maintain a 3-day streak',   emoji: '🔥', threshold: 3,   category: 'streak' },
  { key: 'streak_7',   title: 'Week Warrior',       description: 'Maintain a 7-day streak',   emoji: '🗓️', threshold: 7,   category: 'streak' },
  { key: 'streak_14',  title: 'Fortnight Focus',    description: 'Maintain a 14-day streak',  emoji: '💪', threshold: 14,  category: 'streak' },
  { key: 'streak_30',  title: 'Monthly Marvel',     description: 'Maintain a 30-day streak',  emoji: '🌟', threshold: 30,  category: 'streak' },

  // ── Mastery (4) ──
  { key: 'mastery_10',   title: 'Word Apprentice',  description: 'Master 10 words',    emoji: '📖', threshold: 10,   category: 'mastery' },
  { key: 'mastery_25',   title: 'Word Scholar',     description: 'Master 25 words',    emoji: '🎓', threshold: 25,   category: 'mastery' },
  { key: 'mastery_50',   title: 'Word Expert',      description: 'Master 50 words',    emoji: '🧠', threshold: 50,   category: 'mastery' },
  { key: 'mastery_100',  title: 'Word Genius',      description: 'Master 100 words',   emoji: '🌈', threshold: 100,  category: 'mastery' },

  // ── Games (5) ──
  { key: 'games_first',      title: 'First Steps',        description: 'Complete your first exercise',           emoji: '👶', threshold: 1,    category: 'games' },
  { key: 'games_50',         title: 'Practice Makes Perfect', description: 'Complete 50 exercises',               emoji: '✏️', threshold: 50,   category: 'games' },
  { key: 'games_200',        title: 'Exercise Champion',   description: 'Complete 200 exercises',                 emoji: '🏋️', threshold: 200,  category: 'games' },
  { key: 'games_perfect_10', title: 'Perfect Ten',         description: 'Get 10 correct answers in a row',        emoji: '🎯', threshold: 10,   category: 'games' },
  { key: 'games_500',        title: 'Unstoppable',         description: 'Complete 500 exercises',                 emoji: '🚀', threshold: 500,  category: 'games' },
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
    console.log(`Seeded ${ACHIEVEMENTS.length} achievements`);
  } catch (err) {
    console.error('Failed to seed achievements:', err.message);
  }
}

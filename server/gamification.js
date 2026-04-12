import pool from './db.js';

// ── Points table ──
const POINTS = {
  matching:       { correct: 10, wrong: -3 },
  sentence:       { correct: 20, wrong: -5 },
  picture_prompt: { correct: 15, wrong: -4 },
  related_match:  { correct: 10, wrong: -3 },
};

const STREAK_BONUS_INTERVAL = 5;   // every 5 correct in a row
const STREAK_BONUS_POINTS   = 10;

// ── Tree stages (matching design spec) ──
const TREE_STAGES = [
  { stage: 1, name: 'Seed',        minPoints: 0 },
  { stage: 2, name: 'Sprout',      minPoints: 50 },
  { stage: 3, name: 'Sapling',     minPoints: 200 },
  { stage: 4, name: 'Young Tree',  minPoints: 500 },
  { stage: 5, name: 'Full Tree',   minPoints: 1000 },
  { stage: 6, name: 'Grand Tree',  minPoints: 2000 },
];

/**
 * Record a single exercise answer.
 * Inserts exercise_history + point_events, checks streak bonus, updates legacy progress, checks achievements.
 */
export async function recordExercise({ userId, wordId, exerciseType, correct, sessionId, metadata = {} }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate base points
    const pointDef = POINTS[exerciseType] || POINTS.matching;
    const basePoints = correct ? pointDef.correct : pointDef.wrong;

    // Insert exercise history
    const historyResult = await client.query(`
      INSERT INTO exercise_history (user_id, word_id, exercise_type, correct, points_earned, session_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, wordId, exerciseType, correct, basePoints, sessionId, JSON.stringify(metadata)]);
    const historyId = historyResult.rows[0].id;

    // Insert base point event with exercise-type-specific reason
    const reason = `${exerciseType}_${correct ? 'correct' : 'wrong'}`;
    await client.query(`
      INSERT INTO point_events (user_id, points, reason, exercise_history_id)
      VALUES ($1, $2, $3, $4)
    `, [userId, basePoints, reason, historyId]);

    // Check streak bonus (every N correct in a row)
    let bonusPoints = 0;
    if (correct) {
      const streakResult = await client.query(`
        SELECT correct FROM exercise_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, STREAK_BONUS_INTERVAL]);
      const allCorrect = streakResult.rows.length === STREAK_BONUS_INTERVAL &&
                          streakResult.rows.every(r => r.correct);
      if (allCorrect) {
        bonusPoints = STREAK_BONUS_POINTS;
        await client.query(`
          INSERT INTO point_events (user_id, points, reason, exercise_history_id)
          VALUES ($1, $2, 'streak_bonus', $3)
        `, [userId, bonusPoints, historyId]);
      }
    }

    // Update legacy progress table
    const status = correct ? 'mastered' : 'learning';
    await client.query(`
      INSERT INTO progress (user_id, word_id, status, times_practiced, last_practiced)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_id, word_id) DO UPDATE SET
        status = CASE WHEN $3 = 'mastered' THEN 'mastered' ELSE progress.status END,
        times_practiced = progress.times_practiced + 1,
        last_practiced = NOW()
    `, [userId, wordId, status]);

    await client.query('COMMIT');

    // Get total points (outside transaction for performance)
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(points), 0)::int as total FROM point_events WHERE user_id = $1',
      [userId]
    );
    const totalPoints = totalResult.rows[0].total;

    // Check achievements (non-transactional, best-effort)
    const newAchievements = await checkAchievements(userId);

    return {
      pointsEarned: basePoints,
      bonusPoints,
      totalPoints,
      newAchievements,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Record a bonus point event (e.g. perfect round, daily target met).
 */
export async function recordBonus({ userId, points, reason }) {
  await pool.query(
    'INSERT INTO point_events (user_id, points, reason) VALUES ($1, $2, $3)',
    [userId, points, reason]
  );
}

/**
 * Check all achievement thresholds and unlock any newly earned.
 * Returns array of newly unlocked achievements.
 */
export async function checkAchievements(userId) {
  const newlyUnlocked = [];

  // Get all achievements and which ones the user already has
  const allResult = await pool.query('SELECT * FROM achievements');
  const unlockedResult = await pool.query(
    'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
    [userId]
  );
  const unlockedIds = new Set(unlockedResult.rows.map(r => r.achievement_id));

  // Gather stats in parallel
  const [totalPointsRes, streakDays, masteredRes, totalWordsRes, matchGamesRes, correctSentencesRes, perfectRoundsRes] = await Promise.all([
    pool.query('SELECT COALESCE(SUM(points), 0)::int as total FROM point_events WHERE user_id = $1', [userId]),
    getStreakDays(userId),
    pool.query("SELECT COUNT(*)::int as count FROM progress WHERE user_id = $1 AND status = 'mastered'", [userId]),
    pool.query("SELECT COUNT(*)::int as count FROM words WHERE approved = true"),
    pool.query("SELECT COUNT(DISTINCT session_id)::int as count FROM exercise_history WHERE user_id = $1 AND exercise_type = 'matching'", [userId]),
    pool.query("SELECT COUNT(*)::int as count FROM exercise_history WHERE user_id = $1 AND exercise_type = 'sentence' AND correct = true", [userId]),
    pool.query(`
      SELECT COUNT(*)::int as count FROM (
        SELECT session_id FROM exercise_history
        WHERE user_id = $1 AND exercise_type = 'matching'
        GROUP BY session_id
        HAVING COUNT(*) = SUM(CASE WHEN correct THEN 1 ELSE 0 END) AND COUNT(*) >= 8
      ) sub
    `, [userId]),
  ]);

  const totalPoints = totalPointsRes.rows[0].total;
  const masteredCount = masteredRes.rows[0].count;
  const totalWords = totalWordsRes.rows[0].count;
  const matchGames = matchGamesRes.rows[0].count;
  const correctSentences = correctSentencesRes.rows[0].count;
  const perfectRounds = perfectRoundsRes.rows[0].count;

  // Check each achievement
  const checks = {
    // Points
    first_point: totalPoints >= 1,
    ten_points: totalPoints >= 10,
    fifty_points: totalPoints >= 50,
    hundred_points: totalPoints >= 100,
    five_hundred_points: totalPoints >= 500,
    thousand_points: totalPoints >= 1000,
    two_thousand_points: totalPoints >= 2000,
    // Streaks
    streak_3: streakDays >= 3,
    streak_7: streakDays >= 7,
    streak_14: streakDays >= 14,
    streak_30: streakDays >= 30,
    // Mastery
    mastery_10: masteredCount >= 10,
    mastery_25: masteredCount >= 25,
    mastery_50: masteredCount >= 50,
    mastery_all: totalWords > 0 && masteredCount >= totalWords,
    // Games
    first_match: matchGames >= 1,
    first_sentence: correctSentences >= 1,
    perfect_round: perfectRounds >= 1,
    ten_perfect_rounds: perfectRounds >= 10,
    hundred_sentences: correctSentences >= 100,
  };

  for (const achievement of allResult.rows) {
    if (unlockedIds.has(achievement.id)) continue;

    const earned = checks[achievement.key];
    if (earned) {
      try {
        await pool.query(
          'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, achievement.id]
        );
        newlyUnlocked.push({
          key: achievement.key,
          title: achievement.title,
          description: achievement.description,
          emoji: achievement.emoji,
          category: achievement.category,
        });
      } catch {
        // ignore duplicate
      }
    }
  }

  return newlyUnlocked;
}

/**
 * Count consecutive days with positive points, starting from today backward.
 */
export async function getStreakDays(userId) {
  const result = await pool.query(`
    SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') as day
    FROM point_events
    WHERE user_id = $1 AND points > 0
    ORDER BY day DESC
  `, [userId]);

  if (result.rows.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const checkDate = new Date(today);

  for (const row of result.rows) {
    const dayDate = new Date(row.day);
    dayDate.setHours(0, 0, 0, 0);

    if (dayDate.getTime() === checkDate.getTime()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (streak === 0 && dayDate.getTime() === checkDate.getTime() - 86400000) {
      // First row is yesterday (haven't played today yet) — count from yesterday
      streak++;
      checkDate.setDate(checkDate.getDate() - 2);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate daily target from scheduled words (default 110 points).
 * Formula: 7 words x 10pts (matching) + 2 sentences x 20pts = 110
 */
export async function getDailyTarget(userId) {
  const result = await pool.query(`
    SELECT COUNT(*)::int as count
    FROM learning_schedule
    WHERE user_id = $1 AND scheduled_date = CURRENT_DATE
  `, [userId]);
  const scheduledWords = Math.max(parseInt(result.rows[0].count), 7);
  return scheduledWords * 10 + 2 * 20;
}

/**
 * Get today's earned and lost points.
 */
export async function getTodayPoints(userId) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)::int as earned,
      COALESCE(SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END), 0)::int as lost
    FROM point_events
    WHERE user_id = $1 AND created_at >= CURRENT_DATE
  `, [userId]);
  return {
    earned: result.rows[0].earned,
    lost: result.rows[0].lost,
  };
}

/**
 * Get tree stage based on total points.
 */
export function getTreeStage(totalPoints) {
  let current = TREE_STAGES[0];
  for (const stage of TREE_STAGES) {
    if (totalPoints >= stage.minPoints) {
      current = stage;
    } else {
      break;
    }
  }
  return { stage: current.stage, name: current.name };
}

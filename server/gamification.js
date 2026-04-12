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

// ── Tree stages ──
const TREE_STAGES = [
  { stage: 1, name: 'Seed',          minPoints: 0 },
  { stage: 2, name: 'Sprout',        minPoints: 200 },
  { stage: 3, name: 'Sapling',       minPoints: 1000 },
  { stage: 4, name: 'Young Tree',    minPoints: 3000 },
  { stage: 5, name: 'Mighty Oak',    minPoints: 8000 },
  { stage: 6, name: 'Ancient Tree',  minPoints: 20000 },
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

    // Insert base point event
    await client.query(`
      INSERT INTO point_events (user_id, points, reason, exercise_history_id)
      VALUES ($1, $2, $3, $4)
    `, [userId, basePoints, correct ? 'correct_answer' : 'wrong_answer', historyId]);

    // Check streak bonus (every N correct in a row)
    let bonusPoints = 0;
    if (correct) {
      const streakResult = await client.query(`
        SELECT COUNT(*) as streak FROM (
          SELECT correct FROM exercise_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        ) recent
        WHERE correct = true
      `, [userId, STREAK_BONUS_INTERVAL]);
      const currentStreak = parseInt(streakResult.rows[0].streak);
      if (currentStreak > 0 && currentStreak % STREAK_BONUS_INTERVAL === 0) {
        bonusPoints = STREAK_BONUS_POINTS;
        await client.query(`
          INSERT INTO point_events (user_id, points, reason, exercise_history_id)
          VALUES ($1, $2, 'streak_bonus', $3)
        `, [userId, bonusPoints, historyId]);
      }
    }

    // Update legacy progress table
    const newStatus = correct ? 'learning' : 'new';
    await client.query(`
      INSERT INTO progress (user_id, word_id, status, times_practiced, last_practiced)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_id, word_id) DO UPDATE SET
        status = CASE
          WHEN progress.times_practiced + 1 >= 5 AND $4 = true THEN 'mastered'
          WHEN $4 = true THEN 'learning'
          ELSE progress.status
        END,
        times_practiced = progress.times_practiced + 1,
        last_practiced = NOW()
    `, [userId, wordId, newStatus, correct]);

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
 * Record a bonus point event (e.g. daily login bonus).
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

  // Gather stats
  const [totalPointsRes, streakDays, exerciseCountRes, masteredRes, correctStreakRes] = await Promise.all([
    pool.query('SELECT COALESCE(SUM(points), 0)::int as total FROM point_events WHERE user_id = $1', [userId]),
    getStreakDays(userId),
    pool.query('SELECT COUNT(*)::int as count FROM exercise_history WHERE user_id = $1', [userId]),
    pool.query("SELECT COUNT(*)::int as count FROM progress WHERE user_id = $1 AND status = 'mastered'", [userId]),
    pool.query(`
      SELECT COUNT(*) as streak FROM (
        SELECT correct FROM exercise_history
        WHERE user_id = $1 ORDER BY created_at DESC
        LIMIT 500
      ) t WHERE correct = true
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT correct, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
          FROM exercise_history WHERE user_id = $1
        ) t2 WHERE t2.correct = false AND t2.rn <= (
          SELECT MIN(rn) FROM (
            SELECT correct, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
            FROM exercise_history WHERE user_id = $1
          ) t3 WHERE t3.correct = false
        )
      )
    `, [userId]).catch(() => ({ rows: [{ streak: 0 }] })),
  ]);

  const totalPoints = totalPointsRes.rows[0].total;
  const exerciseCount = exerciseCountRes.rows[0].count;
  const masteredCount = masteredRes.rows[0].count;

  // Calculate current correct-answer streak
  const correctStreakQuery = await pool.query(`
    SELECT correct FROM exercise_history
    WHERE user_id = $1
    ORDER BY created_at DESC LIMIT 500
  `, [userId]);
  let correctStreak = 0;
  for (const row of correctStreakQuery.rows) {
    if (row.correct) correctStreak++;
    else break;
  }

  for (const achievement of allResult.rows) {
    if (unlockedIds.has(achievement.id)) continue;

    let earned = false;
    switch (achievement.category) {
      case 'points':
        earned = totalPoints >= achievement.threshold;
        break;
      case 'streak':
        earned = streakDays >= achievement.threshold;
        break;
      case 'mastery':
        earned = masteredCount >= achievement.threshold;
        break;
      case 'games':
        if (achievement.key === 'games_perfect_10') {
          earned = correctStreak >= achievement.threshold;
        } else {
          earned = exerciseCount >= achievement.threshold;
        }
        break;
    }

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
    } else if (dayDate.getTime() === checkDate.getTime() - 86400000) {
      // Allow the first row to be yesterday (haven't played today yet)
      if (streak === 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 2);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate daily target from scheduled words (default 110 points).
 */
export async function getDailyTarget(userId) {
  const result = await pool.query(`
    SELECT COUNT(*)::int as count
    FROM learning_schedule
    WHERE user_id = $1 AND scheduled_date = CURRENT_DATE AND completed = false
  `, [userId]);
  const scheduledWords = result.rows[0].count;
  // Each word is worth ~15 points average, minimum target 110
  return Math.max(110, scheduledWords * 15);
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

  // Calculate progress to next stage
  const nextStage = TREE_STAGES.find(s => s.minPoints > totalPoints);
  const progressToNext = nextStage
    ? (totalPoints - current.minPoints) / (nextStage.minPoints - current.minPoints)
    : 1;

  return {
    stage: current.stage,
    name: current.name,
    progressToNext: Math.min(1, Math.max(0, progressToNext)),
    nextStageName: nextStage?.name || null,
    nextStagePoints: nextStage?.minPoints || null,
  };
}

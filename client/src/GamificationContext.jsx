import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext.jsx';
import { apiFetch } from './api.js';

const GamificationContext = createContext(null);

const MILESTONES = [
  { threshold: 1, message: "You're on your way! 🌱" },
  { threshold: 10, message: "Double digits! 🎉" },
  { threshold: 50, message: "Your tree is sprouting! 🌿" },
  { threshold: 100, message: "Triple digits — amazing! ⭐" },
  { threshold: 500, message: "Half a thousand! You're a word wizard! 🧙" },
  { threshold: 1000, message: "ONE THOUSAND! Legendary! 👑" },
];

function checkMilestones(prevTotal, newTotal) {
  return MILESTONES.filter(m => prevTotal < m.threshold && newTotal >= m.threshold);
}

export function GamificationProvider({ children }) {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState(null);
  const [streak, setStreak] = useState(null);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const prevTotalRef = useRef(null);

  const fetchTree = useCallback(async () => {
    if (!user) return null;
    try {
      const data = await apiFetch('/tree');
      setTreeData(data);
      if (prevTotalRef.current === null) {
        prevTotalRef.current = data.totalPoints;
      }
      return data;
    } catch {
      return null;
    }
  }, [user]);

  const fetchStreak = useCallback(async () => {
    if (!user) return null;
    try {
      const data = await apiFetch('/streak');
      setStreak(data);
      return data;
    } catch {
      return null;
    }
  }, [user]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchTree(), fetchStreak()]);
  }, [fetchTree, fetchStreak]);

  useEffect(() => {
    if (user) {
      refresh();
    } else {
      setTreeData(null);
      setStreak(null);
      setCelebrationQueue([]);
      prevTotalRef.current = null;
    }
  }, [user, refresh]);

  const newSessionId = useCallback(() => {
    const id = crypto.randomUUID();
    setSessionId(id);
    return id;
  }, []);

  const queueCelebration = useCallback((item) => {
    setCelebrationQueue(prev => [...prev, item]);
  }, []);

  const dismissCelebration = useCallback(() => {
    setCelebrationQueue(prev => prev.slice(1));
  }, []);

  const recordExercise = useCallback(async ({ wordId, exerciseType, correct, metadata }) => {
    if (!user) return null;
    const prevTotal = prevTotalRef.current ?? 0;

    const result = await apiFetch('/exercises', {
      method: 'POST',
      body: { wordId, exerciseType, correct, sessionId, metadata },
    });

    // Queue celebrations for new achievements
    if (result.newAchievements && result.newAchievements.length > 0) {
      for (const ach of result.newAchievements) {
        queueCelebration({
          type: 'achievement',
          title: ach.title || ach.name || 'Achievement Unlocked!',
          emoji: ach.emoji || '🏆',
          description: ach.description || '',
          message: ach.message || '',
        });
      }
    }

    // Check for point milestones
    const newTotal = result.totalPoints ?? prevTotal;
    const crossed = checkMilestones(prevTotal, newTotal);
    for (const m of crossed) {
      queueCelebration({
        type: 'milestone',
        title: `${m.threshold} Points!`,
        emoji: m.message.slice(-2),
        description: m.message,
        message: m.message,
      });
    }
    prevTotalRef.current = newTotal;

    // Refresh tree and streak data
    await refresh();
    return result;
  }, [user, sessionId, queueCelebration, refresh]);

  const recordBonus = useCallback(async ({ points, reason }) => {
    if (!user) return null;
    const prevTotal = prevTotalRef.current ?? 0;

    const result = await apiFetch('/exercises/bonus', {
      method: 'POST',
      body: { points, reason, sessionId },
    });

    const newTotal = result.totalPoints ?? prevTotal;
    const crossed = checkMilestones(prevTotal, newTotal);
    for (const m of crossed) {
      queueCelebration({
        type: 'milestone',
        title: `${m.threshold} Points!`,
        emoji: m.message.slice(-2),
        description: m.message,
        message: m.message,
      });
    }
    prevTotalRef.current = newTotal;

    await refresh();
    return result;
  }, [user, sessionId, queueCelebration, refresh]);

  const value = {
    treeData,
    streak,
    celebrationQueue,
    sessionId,
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

export function useGamification() {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error('useGamification must be used within GamificationProvider');
  return ctx;
}

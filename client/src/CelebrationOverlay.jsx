import { useEffect, useRef } from 'react';
import { useGamification } from './GamificationContext.jsx';

const CONFETTI_COLORS = ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#1abc9c'];
const CONFETTI_COUNT = 50;

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch {
    // Web Audio not available
  }
}

function generateConfetti() {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const left = Math.random() * 100;
    const width = Math.random() * 8 + 4;
    const height = Math.random() * 12 + 6;
    const delay = Math.random() * 1.5;
    return (
      <div
        key={i}
        className="confetti-piece"
        style={{
          left: `${left}%`,
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: color,
          animationDelay: `${delay}s`,
        }}
      />
    );
  });
}

export default function CelebrationOverlay() {
  const { celebrationQueue, dismissCelebration } = useGamification();
  const timerRef = useRef(null);
  const hasPlayedRef = useRef(false);

  const current = celebrationQueue?.[0];

  useEffect(() => {
    if (!current) {
      hasPlayedRef.current = false;
      return;
    }

    if (!hasPlayedRef.current) {
      playChime();
      hasPlayedRef.current = true;
    }

    timerRef.current = setTimeout(() => {
      dismissCelebration();
      hasPlayedRef.current = false;
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, dismissCelebration]);

  if (!current) return null;

  const handleClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hasPlayedRef.current = false;
    dismissCelebration();
  };

  return (
    <div className="celebration-overlay" onClick={handleClick}>
      {generateConfetti()}
      <div className="celebration-content">
        {current.type === 'achievement' ? (
          <>
            <div className="celebration-emoji">{current.emoji || '🏆'}</div>
            <div className="celebration-title">Achievement Unlocked!</div>
            <div className="celebration-message">{current.title}</div>
            <div className="celebration-description">{current.description}</div>
          </>
        ) : (
          <>
            <div className="celebration-emoji">🎉</div>
            <div className="celebration-title">Milestone!</div>
            <div className="celebration-message">{current.message}</div>
          </>
        )}
      </div>
    </div>
  );
}

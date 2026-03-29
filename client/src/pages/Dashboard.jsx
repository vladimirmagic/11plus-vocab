import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function Dashboard({ onNavigate }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    apiFetch('/progress/stats')
      .then(data => setStats(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.5rem' }}>📚 Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#e74c3c' }}>😟 Oops! Something went wrong: {error}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  const firstName = user?.firstName || user?.name?.split(' ')[0] || 'Learner';
  const total = stats?.totalWords || 0;
  const mastered = stats?.mastered || 0;
  const learning = stats?.learning || 0;
  const notStarted = stats?.notStarted || total - mastered - learning;
  const practicedToday = stats?.practicedToday || 0;
  const masteredPercent = total > 0 ? Math.round((mastered / total) * 100) : 0;

  function getEncouragingMessage() {
    if (masteredPercent === 100) {
      return "🏆 WOW! You've mastered every single word! You're a vocabulary superstar!";
    }
    if (masteredPercent >= 75) {
      return "🌟 Amazing work! You're so close to mastering all the words! Keep going!";
    }
    if (masteredPercent >= 50) {
      return "🚀 You're halfway there! You're doing brilliantly — keep it up!";
    }
    if (masteredPercent >= 25) {
      return "💪 Great progress! Every word you learn makes you stronger!";
    }
    if (practicedToday > 0) {
      return "🎯 Awesome — you've already practised today! Keep the streak going!";
    }
    return "👋 Ready for a fun vocabulary adventure? Let's learn some new words!";
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>
          👋 Welcome back, {firstName}!
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#555' }}>
          {getEncouragingMessage()}
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">📖 {total}</div>
          <div className="stat-label">Total Words</div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #27ae60' }}>
          <div className="stat-value" style={{ color: '#27ae60' }}>✅ {mastered}</div>
          <div className="stat-label">Mastered</div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #f39c12' }}>
          <div className="stat-value" style={{ color: '#f39c12' }}>📝 {learning}</div>
          <div className="stat-label">Learning</div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #95a5a6' }}>
          <div className="stat-value" style={{ color: '#95a5a6' }}>🆕 {notStarted}</div>
          <div className="stat-label">Not Started</div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #3498db' }}>
          <div className="stat-value" style={{ color: '#3498db' }}>🔥 {practicedToday}</div>
          <div className="stat-label">Practised Today</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>📊 Your Progress</h3>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${masteredPercent}%` }}
          />
        </div>
        <p style={{ textAlign: 'center', marginTop: '0.5rem', color: '#555' }}>
          {masteredPercent}% of words mastered — {mastered} out of {total}
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>🎮 What would you like to do?</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button className="btn-primary" onClick={() => onNavigate('practice')}>
            📝 Practice Words
          </button>
          <button className="btn-primary" onClick={() => onNavigate('quiz')}>
            🧠 Take a Quiz
          </button>
          <button className="btn-primary" onClick={() => onNavigate('words')}>
            📚 Browse Words
          </button>
          <button className="btn-primary" onClick={() => onNavigate('stories')}>
            📖 Word Stories
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

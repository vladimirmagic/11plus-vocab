import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Dashboard({ onNavigate }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todayWords, setTodayWords] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setScheduleLoading(false);
      return;
    }
    apiFetch('/progress/stats')
      .then(data => setStats(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

    // Fetch today's scheduled words
    const today = new Date();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();
    const todayStr = formatDate(today);
    apiFetch(`/schedule?month=${m}&year=${y}`)
      .then(data => {
        const all = data.schedule || [];
        const forToday = all.filter(item => {
          const d = new Date(item.scheduled_date);
          return formatDate(d) === todayStr;
        });
        setTodayWords(forToday);
      })
      .catch(() => setTodayWords([]))
      .finally(() => setScheduleLoading(false));
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
        <p style={{ color: '#e74c3c' }}>Something went wrong: {error}</p>
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

  const todayMastered = todayWords.filter(w => w.progress_status === 'mastered').length;
  const todayLearning = todayWords.filter(w => w.progress_status === 'learning').length;
  const todayNew = todayWords.filter(w => !w.progress_status || w.progress_status === 'new').length;

  function getEncouragingMessage() {
    if (todayWords.length > 0 && todayMastered === todayWords.length) {
      return "You've mastered all of today's words! Amazing work!";
    }
    if (todayWords.length > 0 && todayMastered > 0) {
      return `${todayMastered} of ${todayWords.length} words mastered today. Keep going!`;
    }
    if (masteredPercent === 100) {
      return "You've mastered every single word! You're a vocabulary superstar!";
    }
    if (practicedToday > 0) {
      return "Great job practising today! Keep the streak going!";
    }
    if (todayWords.length > 0) {
      return `You have ${todayWords.length} words to learn today. Let's get started!`;
    }
    return "Ready for a vocabulary adventure? Let's learn some new words!";
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>
          Welcome back, {firstName}!
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#555' }}>
          {getEncouragingMessage()}
        </p>
      </div>

      {/* Today's Words */}
      {!scheduleLoading && todayWords.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', background: 'var(--green, #6b9e7a)', color: 'white',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Today's Words
            </h3>
            <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
              {todayMastered}/{todayWords.length} mastered
            </span>
          </div>

          {/* Progress bar for today */}
          <div style={{ height: 4, background: 'var(--cream-dark, #e0d5c1)' }}>
            <div style={{
              height: '100%', transition: 'width 0.3s',
              width: todayWords.length > 0 ? `${(todayMastered / todayWords.length) * 100}%` : '0%',
              background: 'var(--green, #6b9e7a)',
            }} />
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayWords.map((w, idx) => {
              const status = w.progress_status || 'new';
              const statusIcon = status === 'mastered' ? '✅' : status === 'learning' ? '📝' : '🆕';
              return (
                <div
                  key={w.word_id || idx}
                  onClick={() => onNavigate('word', w.word_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderRadius: 10,
                    background: status === 'mastered' ? '#E8F5EC' : 'var(--cream, #f5f0e8)',
                    border: status === 'mastered' ? '1px solid var(--green, #6b9e7a)' : '1px solid var(--cream-dark, #e0d5c1)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    opacity: status === 'mastered' ? 0.7 : 1,
                  }}
                  onMouseEnter={e => { if (status !== 'mastered') e.currentTarget.style.background = '#f0ebe0'; }}
                  onMouseLeave={e => { if (status !== 'mastered') e.currentTarget.style.background = 'var(--cream, #f5f0e8)'; }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{w.visual_emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontWeight: 700, fontSize: 15,
                        color: status === 'mastered' ? 'var(--green, #6b9e7a)' : 'var(--green-dark, #4a7c59)',
                        textDecoration: status === 'mastered' ? 'line-through' : 'none',
                      }}>
                        {w.word}
                      </span>
                      <span style={{ fontSize: 14 }}>{statusIcon}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                        background: w.difficulty === 1 ? '#E8F5EC' : w.difficulty === 2 ? '#FFF8E1' : '#FFEBEE',
                      }}>
                        {'★'.repeat(w.difficulty || 1)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.3, marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {w.definition}
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}>&rsaquo;</span>
                </div>
              );
            })}
          </div>

          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--cream, #f5f0e8)',
            display: 'flex', justifyContent: 'center',
          }}>
            <button
              onClick={() => onNavigate('calendar')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--green, #6b9e7a)', fontWeight: 700, fontSize: 13,
                fontFamily: 'inherit', padding: '4px 12px',
              }}
            >
              View full calendar &rarr;
            </button>
          </div>
        </div>
      )}

      {/* No schedule yet */}
      {!scheduleLoading && todayWords.length === 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '24px 20px' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📅</p>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No words scheduled for today</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Set up your learning calendar to get daily word recommendations
          </p>
          <button className="btn-primary" onClick={() => onNavigate('calendar')} style={{ fontSize: 14 }}>
            Go to Calendar
          </button>
        </div>
      )}

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
        <h3 style={{ marginBottom: '0.75rem' }}>Your Progress</h3>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${masteredPercent}%`, background: 'var(--green)' }}
          />
        </div>
        <p style={{ textAlign: 'center', marginTop: '0.5rem', color: '#555' }}>
          {masteredPercent}% of words mastered — {mastered} out of {total}
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>What would you like to do?</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button className="btn-primary" onClick={() => onNavigate('words')}>
            📚 Browse Words
          </button>
          <button className="btn-primary" onClick={() => onNavigate('calendar')}>
            📅 Learning Calendar
          </button>
          <button className="btn-primary" onClick={() => onNavigate('clusters')}>
            🕸️ Word Clusters
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

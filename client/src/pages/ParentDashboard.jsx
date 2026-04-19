import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const exerciseTypeLabels = {
  matching: '🎯 Matching Game',
  freewrite: '✍️ Sentence Builder',
  freewrite_correct: '✍️ Sentence (correct)',
  freewrite_attempt: '✍️ Sentence (attempt)',
  quiz: '❓ Quiz',
  review: '📖 Review',
};

function StatCard({ icon, value, label, color }) {
  return (
    <div style={{
      flex: '1 1 120px', padding: '16px 12px', background: 'white', borderRadius: 14,
      border: '2px solid var(--cream-dark, #e0d5c1)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 10, background: 'var(--cream, #f5f0e8)', borderRadius: 5, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color || 'var(--green)', borderRadius: 5,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 40 }}>{pct}%</span>
    </div>
  );
}

function WeeklyChart({ data }) {
  if (!data || data.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No weekly data yet</p>;
  }
  const maxVal = Math.max(...data.map(d => d.total_practiced), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '0 4px' }}>
      {data.map((week, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '80%', maxWidth: 40,
              height: Math.max(4, (week.total_practiced / maxVal) * 90),
              background: 'var(--cream-dark, #e0d5c1)', borderRadius: 4,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', bottom: 0, width: '100%',
                height: week.total_practiced > 0 ? `${(week.mastered / week.total_practiced) * 100}%` : 0,
                background: 'var(--green)', borderRadius: '0 0 4px 4px',
              }} />
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
            {formatDateShort(week.week_start)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SessionCard({ session, freewriteAttempts }) {
  const [expanded, setExpanded] = useState(false);
  const accuracy = session.total_exercises > 0 ? Math.round((session.correct_count / session.total_exercises) * 100) : 0;

  // Find freewrite attempts that match this session's time window
  const sessionStart = new Date(session.started_at);
  const sessionEnd = new Date(session.ended_at);
  sessionEnd.setMinutes(sessionEnd.getMinutes() + 1); // small buffer
  const relatedFreewrites = (freewriteAttempts || []).filter(fw => {
    const fwDate = new Date(fw.created_at);
    return fwDate >= sessionStart && fwDate <= sessionEnd;
  });

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {formatDate(session.started_at)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(session.exercise_types || []).map(t => (
              <span key={t} style={{
                padding: '2px 8px', background: 'var(--cream)', borderRadius: 10, fontSize: 11, fontWeight: 600,
              }}>
                {exerciseTypeLabels[t] || t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: accuracy >= 70 ? 'var(--green)' : accuracy >= 40 ? 'var(--orange)' : 'var(--red)' }}>
              {session.correct_count}/{session.total_exercises}
            </span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> correct</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 600 }}>+{session.total_points} pts</div>
          <div style={{ fontSize: 18, marginTop: 2 }}>{expanded ? '▲' : '▼'}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--cream-dark)', paddingTop: 12 }}>
          {/* Exercise details */}
          {session.exercises && session.exercises.length > 0 && (
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                Exercises
              </h4>
              {session.exercises.map((ex, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < session.exercises.length - 1 ? '1px solid var(--cream)' : 'none',
                }}>
                  <span style={{ fontSize: 20 }}>{ex.visual_emoji || '📝'}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{ex.word}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>
                      {exerciseTypeLabels[ex.exercise_type] || ex.exercise_type}
                    </span>
                  </div>
                  <span style={{
                    padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: ex.correct ? '#e8f5e9' : '#ffebee',
                    color: ex.correct ? 'var(--green)' : 'var(--red)',
                  }}>
                    {ex.correct ? '✓ Correct' : '✗ Wrong'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600 }}>+{ex.points_earned}</span>
                </div>
              ))}
            </div>
          )}

          {/* Related freewrite attempts */}
          {relatedFreewrites.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                ✍️ Sentences Written
              </h4>
              {relatedFreewrites.map((fw, i) => (
                <div key={i} style={{
                  padding: 12, marginBottom: 8, background: 'var(--cream)',
                  borderRadius: 10, borderLeft: `4px solid ${fw.correct ? 'var(--green)' : 'var(--orange)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{fw.visual_emoji || '📝'}</span>
                    <span style={{ fontWeight: 700 }}>{fw.word}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, marginLeft: 'auto',
                      background: fw.correct ? '#e8f5e9' : '#fff3e0',
                      color: fw.correct ? 'var(--green)' : 'var(--orange)',
                    }}>
                      {fw.correct ? '✓ Correct' : 'Needs work'} · Attempt {fw.attempt_number}
                    </span>
                  </div>
                  <div style={{
                    padding: '8px 12px', background: 'white', borderRadius: 8, fontSize: 14,
                    fontStyle: 'italic', lineHeight: 1.5, marginBottom: 6,
                  }}>
                    "{fw.sentence}"
                  </div>
                  {fw.feedback && (
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                      <strong>Feedback:</strong> {fw.feedback}
                    </div>
                  )}
                  {fw.suggestion && (
                    <div style={{ fontSize: 13, color: 'var(--green-dark)', marginTop: 4, lineHeight: 1.4 }}>
                      <strong>Suggestion:</strong> {fw.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {session.exercises?.length === 0 && relatedFreewrites.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No detail data for this session</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [freewriteAttempts, setFreewriteAttempts] = useState([]);
  const [weeklyData, setWeeklyData] = useState(null);
  const [streak, setStreak] = useState(null);
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/progress/stats'),
      apiFetch('/parent/sessions?limit=10&offset=0'),
      apiFetch('/parent/freewrite-log?limit=100'),
      apiFetch('/parent/weekly-progress'),
      apiFetch('/streak'),
      apiFetch('/points/total'),
    ]).then(([statsData, sessionsData, fwData, weeklyData, streakData, pointsData]) => {
      setStats(statsData);
      setSessions(sessionsData.sessions);
      setSessionsTotal(sessionsData.total);
      setSessionsOffset(10);
      setFreewriteAttempts(fwData.attempts || []);
      setWeeklyData(weeklyData);
      setStreak(streakData);
      setPoints(pointsData);
    }).catch(err => console.error('Parent dashboard error:', err))
      .finally(() => setLoading(false));
  }, []);

  const loadMoreSessions = async () => {
    setLoadingMore(true);
    try {
      const data = await apiFetch(`/parent/sessions?limit=10&offset=${sessionsOffset}`);
      setSessions(prev => [...prev, ...data.sessions]);
      setSessionsOffset(prev => prev + 10);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading parent dashboard...</div>;
  }

  const weekAccuracyPct = weeklyData?.weekAccuracy?.total > 0
    ? Math.round((weeklyData.weekAccuracy.correct / weeklyData.weekAccuracy.total) * 100)
    : null;

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 32 }}>👨‍👩‍👧</span> Parent Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Viewing progress for <strong>{user.name}</strong>
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--cream)', borderRadius: 12, padding: 4 }}>
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'detailed', label: '📈 Detailed Stats' },
          { id: 'log', label: '📋 Exercise Log' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              background: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? 'var(--green-dark)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Stats cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <StatCard icon="📚" value={stats?.totalWords || 0} label="Total Words" />
            <StatCard icon="✅" value={stats?.mastered || 0} label="Mastered" color="var(--green)" />
            <StatCard icon="📖" value={stats?.learning || 0} label="Learning" color="var(--orange)" />
            <StatCard icon="⚡" value={points?.total || 0} label="Total Points" color="var(--orange)" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <StatCard icon="🔥" value={streak?.days || 0} label="Day Streak" color="var(--orange)" />
            <StatCard icon="🎯" value={weekAccuracyPct !== null ? `${weekAccuracyPct}%` : '—'} label="This Week Accuracy" color={weekAccuracyPct >= 70 ? 'var(--green)' : 'var(--orange)'} />
            <StatCard icon="📅" value={stats?.practicedToday || 0} label="Practiced Today" />
            <StatCard icon="🆕" value={stats?.notStarted || 0} label="Not Started" color="var(--text-muted)" />
          </div>

          {/* Mastery progress bar */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📊 Overall Mastery</h3>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>Mastered</span>
                <span style={{ fontWeight: 700 }}>{stats?.mastered || 0} / {stats?.totalWords || 0}</span>
              </div>
              <ProgressBar value={stats?.mastered || 0} max={stats?.totalWords || 0} color="var(--green)" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>Learning</span>
                <span style={{ fontWeight: 700 }}>{stats?.learning || 0} / {stats?.totalWords || 0}</span>
              </div>
              <ProgressBar value={stats?.learning || 0} max={stats?.totalWords || 0} color="var(--orange)" />
            </div>
          </div>

          {/* Weekly chart */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📈 Weekly Activity</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)', display: 'inline-block' }}></span> Mastered
              </span>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--cream-dark)', display: 'inline-block' }}></span> Practiced
              </span>
            </div>
            <WeeklyChart data={weeklyData?.weeklyProgress} />
          </div>

          {/* Today's scheduled words */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📅 Today's Schedule</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {stats?.practicedToday || 0} word{(stats?.practicedToday || 0) !== 1 ? 's' : ''} practiced today
            </p>
          </div>
        </div>
      )}

      {/* Detailed Stats Tab */}
      {activeTab === 'detailed' && (
        <div>
          {/* Accuracy this week */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🎯 This Week's Accuracy</h3>
            {weeklyData?.weekAccuracy?.total > 0 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `conic-gradient(${weekAccuracyPct >= 70 ? 'var(--green)' : 'var(--orange)'} ${weekAccuracyPct}%, var(--cream) 0)`,
                    fontSize: 20, fontWeight: 800, color: 'var(--text)',
                  }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%', background: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {weekAccuracyPct}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14 }}><strong>{weeklyData.weekAccuracy.correct}</strong> correct out of <strong>{weeklyData.weekAccuracy.total}</strong> exercises</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      {weekAccuracyPct >= 80 ? '🌟 Excellent work!' : weekAccuracyPct >= 60 ? '👍 Good progress!' : '💪 Keep practising!'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No exercises this week yet</p>
            )}
          </div>

          {/* Weakest words */}
          {weeklyData?.wordAccuracy?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>⚠️ Words Needing Practice</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Words with lowest accuracy (2+ attempts)</p>
              {weeklyData.wordAccuracy.slice(0, 8).map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < Math.min(weeklyData.wordAccuracy.length, 8) - 1 ? '1px solid var(--cream)' : 'none',
                }}>
                  <span style={{ fontSize: 18 }}>{w.visual_emoji || '📝'}</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{w.word}</span>
                  <ProgressBar value={w.correct} max={w.attempts} color={w.accuracy_pct >= 70 ? 'var(--green)' : w.accuracy_pct >= 40 ? 'var(--orange)' : 'var(--red)'} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>
                    {w.correct}/{w.attempts} ({w.accuracy_pct}%)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Strongest words */}
          {weeklyData?.wordAccuracy?.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🌟 Strongest Words</h3>
              {weeklyData.wordAccuracy.slice(-8).reverse().map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < Math.min(weeklyData.wordAccuracy.length, 8) - 1 ? '1px solid var(--cream)' : 'none',
                }}>
                  <span style={{ fontSize: 18 }}>{w.visual_emoji || '📝'}</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{w.word}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                    {w.correct}/{w.attempts} ({w.accuracy_pct}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exercise Log Tab */}
      {activeTab === 'log' && (
        <div>
          {sessions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <h3>No exercises yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Exercise sessions will appear here once {user.name} starts practising.
              </p>
            </div>
          ) : (
            <>
              {/* Standalone freewrite attempts (not in any session) */}
              {freewriteAttempts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>✍️ Sentence Builder History</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {freewriteAttempts.length} sentence{freewriteAttempts.length !== 1 ? 's' : ''} written
                  </p>
                  {freewriteAttempts.slice(0, 10).map((fw, i) => (
                    <div key={i} className="card" style={{
                      marginBottom: 8, borderLeft: `4px solid ${fw.correct ? 'var(--green)' : 'var(--orange)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>{fw.visual_emoji || '📝'}</span>
                        <span style={{ fontWeight: 700 }}>{fw.word}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {formatDate(fw.created_at)}
                        </span>
                      </div>
                      <div style={{
                        padding: '8px 12px', background: 'var(--cream)', borderRadius: 8, fontSize: 14,
                        fontStyle: 'italic', lineHeight: 1.5, marginBottom: 6,
                      }}>
                        "{fw.sentence}"
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                        <span style={{
                          padding: '1px 8px', borderRadius: 10, fontWeight: 700, fontSize: 11,
                          background: fw.correct ? '#e8f5e9' : '#fff3e0',
                          color: fw.correct ? 'var(--green)' : 'var(--orange)',
                        }}>
                          {fw.correct ? '✓ Correct' : 'Needs work'}
                        </span>
                        <span style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12 }}>+{fw.points} pts</span>
                      </div>
                      {fw.feedback && (
                        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6, lineHeight: 1.4 }}>
                          <strong>Feedback:</strong> {fw.feedback}
                        </div>
                      )}
                      {fw.suggestion && (
                        <div style={{ fontSize: 13, color: 'var(--green-dark)', marginTop: 4, lineHeight: 1.4 }}>
                          <strong>Suggestion:</strong> {fw.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Session cards */}
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🎯 Exercise Sessions</h3>
              {sessions.map((session, i) => (
                <SessionCard key={session.session_id || i} session={session} freewriteAttempts={freewriteAttempts} />
              ))}

              {sessionsOffset < sessionsTotal && (
                <button
                  className="btn-secondary"
                  onClick={loadMoreSessions}
                  disabled={loadingMore}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  {loadingMore ? 'Loading...' : `Load more (${sessionsTotal - sessionsOffset} remaining)`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Leaderboard() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/leaderboard?period=${period}`)
      .then(data => setLeaderboard(data.leaderboard || []))
      .catch(err => console.error('Leaderboard error:', err))
      .finally(() => setLoading(false));
  }, [user, period]);

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Leaderboard</h2>
        <p>Please log in to see the leaderboard.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>🏆 Leaderboard</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            className={period === 'week' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setPeriod('week')}
            style={{ fontSize: 13 }}
          >
            This Week
          </button>
          <button
            className={period === 'month' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setPeriod('month')}
            style={{ fontSize: 13 }}
          >
            This Month
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading leaderboard...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: 32 }}>📊</p>
          <p>No activity yet this {period}. Start practising to get on the board!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {leaderboard.map((entry) => {
            const isMe = entry.userId === user.id;
            const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
            return (
              <div
                key={entry.userId}
                className="card"
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  border: isMe ? '2px solid var(--green)' : undefined,
                  background: isMe ? '#E8F5EC' : undefined,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, minWidth: 36, textAlign: 'center' }}>
                  {rankEmoji}
                </div>
                <img
                  src={entry.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.name)}&background=6B9E7A&color=fff&size=36`}
                  alt={entry.name}
                  style={{ width: 36, height: 36, borderRadius: '50%' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {entry.name} {isMe && <span style={{ fontSize: 12, color: 'var(--green)' }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {entry.tier.emoji} {entry.tier.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green-dark)' }}>
                    {entry.weeklyPoints}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

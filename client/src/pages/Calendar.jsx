import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Monday = 0, Sunday = 6
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  return { daysInMonth, startDay };
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function StatusDot({ status }) {
  const colors = {
    mastered: 'var(--green, #6b9e7a)',
    learning: 'var(--orange, #e8a54b)',
    new: 'var(--cream-dark, #d0c5b1)',
  };
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: colors[status] || colors.new,
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

export default function Calendar({ onNavigate }) {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [swapping, setSwapping] = useState(null); // { wordId, date }
  const [unscheduled, setUnscheduled] = useState([]);
  const [unscheduledLoading, setUnscheduledLoading] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/schedule?month=${month + 1}&year=${year}`);
      setSchedule(data.schedule || []);
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  async function generateSchedule() {
    setGenerating(true);
    try {
      const data = await apiFetch('/schedule/generate', { method: 'POST' });
      console.log(`Scheduled ${data.scheduled} words over ${data.days} days`);
      await fetchSchedule();
    } catch (err) {
      console.error('Failed to generate schedule:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function startSwap(wordId, date) {
    setSwapping({ wordId, date });
    setUnscheduledLoading(true);
    try {
      const data = await apiFetch('/schedule/unscheduled');
      setUnscheduled(data.words || []);
    } catch (err) {
      console.error('Failed to fetch unscheduled words:', err);
    } finally {
      setUnscheduledLoading(false);
    }
  }

  async function confirmSwap(newWordId) {
    if (!swapping) return;
    try {
      await apiFetch('/schedule/swap', {
        method: 'PUT',
        body: { oldWordId: swapping.wordId, newWordId, date: swapping.date },
      });
      setSwapping(null);
      setUnscheduled([]);
      await fetchSchedule();
    } catch (err) {
      console.error('Failed to swap word:', err);
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const { daysInMonth, startDay } = getMonthData(year, month);
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());

  // Group schedule by date (parse as local date to avoid UTC offset issues)
  const byDate = {};
  for (const item of schedule) {
    const dateObj = new Date(item.scheduled_date);
    const d = formatDate(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(item);
  }

  // Selected day's words
  const selectedDateStr = selectedDay ? formatDate(year, month, selectedDay) : null;
  const selectedWords = selectedDateStr ? (byDate[selectedDateStr] || []) : [];

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Learning Calendar</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            7 words per day, sorted from easiest to hardest
          </p>
        </div>
        {schedule.length === 0 && !loading && (
          <button
            className="btn-primary"
            onClick={generateSchedule}
            disabled={generating}
            style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700 }}
          >
            {generating ? 'Generating...' : 'Generate Schedule'}
          </button>
        )}
      </div>

      {/* Month Navigation */}
      <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', background: 'var(--green, #6b9e7a)', color: 'white',
        }}>
          <button onClick={prevMonth} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
            fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            &larr;
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
            fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            &rarr;
          </button>
        </div>

        {/* Day headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--cream-dark, #e0d5c1)',
        }}>
          {DAYS.map(d => (
            <div key={d} style={{
              textAlign: 'center', padding: '8px 4px', fontSize: 12,
              fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {/* Empty cells before first day */}
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{
              padding: '8px 4px', minHeight: 70,
              borderBottom: '1px solid var(--cream, #f5f0e8)',
              borderRight: '1px solid var(--cream, #f5f0e8)',
              background: 'var(--cream, #f5f0e8)', opacity: 0.5,
            }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = formatDate(year, month, day);
            const isToday = dateStr === todayStr;
            const isSelected = day === selectedDay;
            const dayWords = byDate[dateStr] || [];
            const mastered = dayWords.filter(w => w.progress_status === 'mastered').length;
            const learning = dayWords.filter(w => w.progress_status === 'learning').length;
            const total = dayWords.length;
            const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(day)}
                style={{
                  padding: '6px 6px 4px', minHeight: 70, cursor: 'pointer',
                  borderBottom: '1px solid var(--cream, #f5f0e8)',
                  borderRight: '1px solid var(--cream, #f5f0e8)',
                  background: isSelected ? '#E8F5EC' : isToday ? '#F0FAF3' : 'var(--white, #fff)',
                  border: isToday ? '2px solid var(--green, #6b9e7a)' : isSelected ? '2px solid var(--green-light, #a3c9ae)' : undefined,
                  borderRadius: isToday || isSelected ? 4 : 0,
                  transition: 'all 0.15s',
                  opacity: isPast && total === 0 ? 0.4 : 1,
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: isToday ? 800 : 600,
                  color: isToday ? 'var(--green-dark, #4a7c59)' : 'var(--text, #333)',
                  marginBottom: 4,
                }}>
                  {day}
                </div>

                {total > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 3 }}>
                      {dayWords.slice(0, 7).map((w, wi) => (
                        <StatusDot key={wi} status={w.progress_status || 'new'} />
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {mastered > 0 && <span style={{ color: 'var(--green, #6b9e7a)' }}>{mastered}</span>}
                      {mastered > 0 && learning > 0 && ' / '}
                      {learning > 0 && <span style={{ color: 'var(--orange, #e8a54b)' }}>{learning}</span>}
                      {(mastered > 0 || learning > 0) && ` of ${total}`}
                      {mastered === 0 && learning === 0 && `${total} words`}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: 16, padding: '10px 20px', fontSize: 12,
          color: 'var(--text-muted)', borderTop: '1px solid var(--cream, #f5f0e8)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <StatusDot status="mastered" /> Mastered
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <StatusDot status="learning" /> Learning
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <StatusDot status="new" /> Not started
          </span>
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {selectedDay} {MONTHS[month]} {year}
              {selectedDateStr === todayStr && (
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Today</span>
              )}
            </h3>
            {selectedWords.length > 0 && !swapping && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                {selectedWords.filter(w => w.progress_status === 'mastered').length}/{selectedWords.length} mastered
              </span>
            )}
          </div>

          {selectedWords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>📅</p>
              <p style={{ fontSize: 14 }}>No words scheduled for this day</p>
              {schedule.length === 0 && (
                <button
                  className="btn-primary"
                  onClick={generateSchedule}
                  disabled={generating}
                  style={{ marginTop: 12, padding: '10px 20px', fontSize: 14 }}
                >
                  {generating ? 'Generating...' : 'Generate Schedule'}
                </button>
              )}
            </div>
          ) : swapping ? (
            /* Swap word picker */
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 12, padding: '8px 12px', background: 'var(--cream)', borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Replacing: <strong>{selectedWords.find(w => w.word_id === swapping.wordId)?.word}</strong>
                </span>
                <button
                  onClick={() => { setSwapping(null); setUnscheduled([]); }}
                  className="btn-secondary"
                  style={{ padding: '4px 12px', fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>

              {unscheduledLoading ? (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div className="spinner" style={{ margin: '0 auto' }}></div>
                </div>
              ) : (
                <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {unscheduled.map(w => (
                    <div
                      key={w.id}
                      onClick={() => confirmSwap(w.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                        border: '1px solid var(--cream-dark, #e0d5c1)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--cream)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <span style={{ fontSize: 20 }}>{w.visual_emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{w.word}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                          {w.definition?.substring(0, 60)}{w.definition?.length > 60 ? '...' : ''}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: w.difficulty === 1 ? '#E8F5EC' : w.difficulty === 2 ? '#FFF8E1' : '#FFEBEE',
                        color: w.difficulty === 1 ? '#4a7c59' : w.difficulty === 2 ? '#b8860b' : '#c62828',
                        fontWeight: 600,
                      }}>
                        {'★'.repeat(w.difficulty || 1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Word list for selected day */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedWords.map((w, idx) => {
                const status = w.progress_status || 'new';
                const statusIcon = status === 'mastered' ? '✅' : status === 'learning' ? '📝' : '🆕';
                return (
                  <div
                    key={w.word_id || idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderRadius: 10, background: 'var(--cream, #f5f0e8)',
                      border: '1px solid var(--cream-dark, #e0d5c1)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{w.visual_emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <a
                          onClick={(e) => { e.stopPropagation(); onNavigate('word', w.word_id); }}
                          style={{
                            fontWeight: 700, fontSize: 15, color: 'var(--green-dark, #4a7c59)',
                            cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--green)',
                            textUnderlineOffset: 2,
                          }}
                        >
                          {w.word}
                        </a>
                        <span style={{ fontSize: 14 }} title={status}>{statusIcon}</span>
                      </div>
                      <div style={{
                        fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {w.definition}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 8,
                        background: w.difficulty === 1 ? '#E8F5EC' : w.difficulty === 2 ? '#FFF8E1' : '#FFEBEE',
                        fontWeight: 600,
                      }}>
                        {'★'.repeat(w.difficulty || 1)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); startSwap(w.word_id, selectedDateStr); }}
                        title="Swap this word"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, padding: '0 4px', color: 'var(--text-muted)',
                          opacity: 0.6,
                        }}
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick stats */}
      {schedule.length > 0 && (
        <div className="card" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green, #6b9e7a)' }}>
                {schedule.filter(s => s.progress_status === 'mastered').length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Mastered</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange, #e8a54b)' }}>
                {schedule.filter(s => s.progress_status === 'learning').length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Learning</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-muted)' }}>
                {schedule.filter(s => !s.progress_status || s.progress_status === 'new').length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Not Started</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
                {new Set(schedule.map(s => { const d = new Date(s.scheduled_date); return formatDate(d.getFullYear(), d.getMonth(), d.getDate()); })).size}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Days Planned</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

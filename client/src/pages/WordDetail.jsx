import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function WordDetail({ wordId, onNavigate }) {
  const { user } = useAuth();
  const [word, setWord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [favoriteAnchor, setFavoriteAnchor] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/words/${wordId}`)
      .then(data => setWord(data.word || data))
      .catch(() => setWord(null))
      .finally(() => setLoading(false));
  }, [wordId]);

  useEffect(() => {
    if (!user || !wordId) return;
    apiFetch('/progress')
      .then(data => {
        const items = data.progress || data;
        if (Array.isArray(items)) {
          const found = items.find(p => p.word_id === wordId);
          if (found) setProgress(found.status);
        }
      })
      .catch(() => {});
  }, [user, wordId]);

  async function updateProgress(status) {
    if (!user) return;
    try {
      await apiFetch(`/progress/${wordId}`, { method: 'PUT', body: { status } });
      setProgress(status);
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  }

  function handleSynonymClick(syn) {
    onNavigate('words', syn);
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading word...
      </div>
    );
  }

  if (!word) {
    return (
      <div className="empty-state">
        <div className="empty-icon">404</div>
        <h3>Word not found</h3>
        <button className="btn-primary" onClick={() => onNavigate('words')}>Back to Word List</button>
      </div>
    );
  }

  const anchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];

  return (
    <div className="word-detail-page">
      <button className="btn-secondary" onClick={() => onNavigate('words')} style={{ marginBottom: 20 }}>
        &larr; Back to Word List
      </button>

      {/* Header */}
      <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{word.visual_emoji}</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>{word.word}</h1>
        <span className="word-detail-category">{word.category}</span>
        {word.difficulty && (
          <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {'★'.repeat(word.difficulty)}{'☆'.repeat(3 - word.difficulty)} Difficulty
          </span>
        )}
        {progress && (
          <div style={{ marginTop: 8 }}>
            <span className={`badge badge-${progress}`}>{progress}</span>
          </div>
        )}
      </div>

      {/* Main content - 2 column on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

        {/* Left column */}
        <div>
          {/* Definition */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Definition</h3>
            <p style={{ fontSize: 18, lineHeight: 1.6 }}>{word.definition}</p>
          </div>

          {/* Example Sentence */}
          {word.example_sentence && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Example Sentence</h3>
              <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.6, color: 'var(--text-light)' }}>
                &ldquo;{word.example_sentence}&rdquo;
              </p>
            </div>
          )}

          {/* Teacher's Tip */}
          {word.teacher_tip && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--cream)', borderLeft: '4px solid var(--orange)' }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--orange)', fontWeight: 700, marginBottom: 8 }}>Teacher's Tip</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>{word.teacher_tip}</p>
            </div>
          )}

          {/* Synonyms & Antonyms */}
          {word.synonyms && word.synonyms.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Synonyms (similar words)</h3>
              <div className="tag-list">
                {word.synonyms.map((syn, idx) => (
                  <span key={idx} className="synonym-tag" onClick={() => handleSynonymClick(syn)}>
                    {syn}
                  </span>
                ))}
              </div>
            </div>
          )}

          {word.antonyms && word.antonyms.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Antonyms (opposite words)</h3>
              <div className="tag-list">
                {word.antonyms.map((ant, idx) => (
                  <span key={idx} className="antonym-tag" onClick={() => handleSynonymClick(ant)}>
                    {ant}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Visual Anchors */}
          {anchors.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>Visual Anchors</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Pick the image that helps you remember this word best!</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {anchors.map((anchor, idx) => (
                  <div
                    key={idx}
                    className={`anchor-card${favoriteAnchor === idx ? ' selected' : ''}`}
                    onClick={() => setFavoriteAnchor(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 14,
                      background: favoriteAnchor === idx ? '#E8F5EC' : 'var(--cream)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: favoriteAnchor === idx ? '2px solid var(--green)' : '2px solid transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: 36, flexShrink: 0 }}>{anchor.emoji}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.5 }}>{anchor.scene}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Controls */}
          {user && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>Your Progress</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={progress === 'new' || !progress ? 'btn-secondary' : 'btn-secondary'}
                  onClick={() => updateProgress('new')}
                  style={{ flex: 1, opacity: progress === 'new' || !progress ? 1 : 0.5 }}
                >
                  New
                </button>
                <button
                  className="btn-orange"
                  onClick={() => updateProgress('learning')}
                  style={{ flex: 1, opacity: progress === 'learning' ? 1 : 0.5 }}
                >
                  Learning
                </button>
                <button
                  className="btn-primary"
                  onClick={() => updateProgress('mastered')}
                  style={{ flex: 1, opacity: progress === 'mastered' ? 1 : 0.5 }}
                >
                  Mastered
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

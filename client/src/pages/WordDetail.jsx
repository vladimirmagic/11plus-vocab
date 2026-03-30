import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function SpeakButton({ text }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const handleEnd = () => setSpeaking(false);
    window.speechSynthesis.addEventListener('end', handleEnd);
    return () => {
      window.speechSynthesis.removeEventListener('end', handleEnd);
      window.speechSynthesis.cancel();
    };
  }, []);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.9;
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
      setSpeaking(true);
    }
  }, [text, speaking]);

  return (
    <button
      onClick={toggle}
      title={speaking ? 'Stop' : 'Listen'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 18,
        padding: '2px 6px',
        borderRadius: 6,
        color: speaking ? 'var(--red)' : 'var(--green)',
        opacity: 0.7,
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {speaking ? '⏹' : '🔊'}
    </button>
  );
}

export default function WordDetail({ wordId, onNavigate }) {
  const { user } = useAuth();
  const [word, setWord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [favoriteAnchor, setFavoriteAnchor] = useState(null);
  const [anchors, setAnchors] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState({});
  const [imageFailed, setImageFailed] = useState({});
  const [quotes, setQuotes] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Load word
  useEffect(() => {
    setLoading(true);
    setAnchors([]);
    setImageLoaded({});
    setImageFailed({});
    apiFetch(`/words/${wordId}`)
      .then(data => {
        const w = data.word || data;
        setWord(w);
        setAnchors(Array.isArray(w.visual_anchors) ? w.visual_anchors : []);
      })
      .catch(() => setWord(null))
      .finally(() => setLoading(false));
  }, [wordId]);

  // Generate images if not cached
  useEffect(() => {
    if (!word) return;
    const currentAnchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];
    if (currentAnchors.length === 0) return;
    if (currentAnchors[0].image_url) return; // Already have images

    setImagesLoading(true);
    apiFetch(`/words/${wordId}/generate-images`, { method: 'POST' })
      .then(data => {
        const updated = data.visual_anchors || [];
        if (updated.length > 0) setAnchors(updated);
      })
      .catch(err => console.error('Image generation failed:', err))
      .finally(() => setImagesLoading(false));
  }, [word, wordId]);

  // Load user progress + favorite
  useEffect(() => {
    if (!user || !wordId) return;
    apiFetch('/progress')
      .then(data => {
        const items = data.progress || data;
        if (Array.isArray(items)) {
          const found = items.find(p => p.word_id === wordId);
          if (found) {
            setProgress(found.status);
            if (found.favorite_anchor !== null && found.favorite_anchor !== undefined) {
              setFavoriteAnchor(found.favorite_anchor);
            }
          }
        }
      })
      .catch(() => {});
  }, [user, wordId]);

  // Load book quotes
  useEffect(() => {
    if (!word) return;
    setQuotesLoading(true);
    apiFetch(`/words/${wordId}/quotes`)
      .then(data => setQuotes(data.quotes || []))
      .catch(err => console.error('Quotes failed:', err))
      .finally(() => setQuotesLoading(false));
  }, [word, wordId]);

  async function updateProgress(status) {
    if (!user) return;
    try {
      await apiFetch(`/progress/${wordId}`, { method: 'PUT', body: { status } });
      setProgress(status);
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  }

  async function handleFavorite(idx) {
    setFavoriteAnchor(idx);
    if (!user) return;
    try {
      await apiFetch(`/progress/${wordId}/favorite`, { method: 'PUT', body: { anchor: idx } });
    } catch (err) {
      console.error('Failed to save favorite:', err);
    }
  }

  function handleSynonymClick(syn) {
    onNavigate('words', syn);
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading word...</div>;
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

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

        {/* Left column */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Definition</h3>
              <SpeakButton text={`${word.word}. ${word.definition}`} />
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.6 }}>{word.definition}</p>
          </div>

          {word.example_sentence && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Example Sentence</h3>
                <SpeakButton text={word.example_sentence} />
              </div>
              <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.6, color: 'var(--text-light)' }}>
                &ldquo;{word.example_sentence}&rdquo;
              </p>
            </div>
          )}

          {word.teacher_tip && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--cream)', borderLeft: '4px solid var(--orange)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--orange)', fontWeight: 700 }}>Teacher's Tip</h3>
                <SpeakButton text={word.teacher_tip} />
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>{word.teacher_tip}</p>
            </div>
          )}

          {word.synonyms && word.synonyms.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Synonyms (similar words)</h3>
              <div className="tag-list">
                {word.synonyms.map((syn, idx) => (
                  <span key={idx} className="synonym-tag" onClick={() => handleSynonymClick(syn)}>{syn}</span>
                ))}
              </div>
            </div>
          )}

          {word.antonyms && word.antonyms.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Antonyms (opposite words)</h3>
              <div className="tag-list">
                {word.antonyms.map((ant, idx) => (
                  <span key={idx} className="antonym-tag" onClick={() => handleSynonymClick(ant)}>{ant}</span>
                ))}
              </div>
            </div>
          )}

          {/* Book Quotes */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--purple)', fontWeight: 700, marginBottom: 12 }}>
              In Famous Books
            </h3>
            {quotesLoading ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                <p style={{ fontSize: 13 }}>Finding quotes from your favourite books...</p>
              </div>
            ) : quotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {quotes.map((q, idx) => (
                  <div key={idx} style={{
                    padding: '12px 16px',
                    background: 'var(--cream)',
                    borderRadius: 10,
                    borderLeft: '3px solid var(--purple)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <p style={{ fontSize: 14, lineHeight: 1.6, fontStyle: 'italic', marginBottom: 6, flex: 1 }}>
                        &ldquo;{q.quote}&rdquo;
                      </p>
                      <SpeakButton text={q.quote} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      &mdash; {q.book} by {q.author}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Visual Anchors with Images */}
          {anchors.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>Visual Anchors</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Pick the image that helps you remember this word best!</p>

              {imagesLoading && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                  <p style={{ fontSize: 13 }}>Generating illustrations...</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {anchors.map((anchor, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleFavorite(idx)}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: favoriteAnchor === idx ? '3px solid var(--green)' : '3px solid transparent',
                      background: favoriteAnchor === idx ? '#E8F5EC' : 'var(--cream)',
                      transition: 'all 0.2s',
                      boxShadow: favoriteAnchor === idx ? '0 4px 12px rgba(107, 158, 122, 0.3)' : 'none',
                    }}
                  >
                    {/* Image */}
                    {anchor.image_url && !imageFailed[idx] && (
                      <div style={{ position: 'relative', width: '100%', height: 200, background: 'var(--cream-dark)', overflow: 'hidden' }}>
                        {!imageLoaded[idx] && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, zIndex: 1 }}>
                            <span style={{ fontSize: 48, marginBottom: 8 }}>{anchor.emoji}</span>
                            <span><div className="spinner" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}></div>Loading...</span>
                          </div>
                        )}
                        <img
                          src={anchor.image_url}
                          alt={anchor.scene}
                          onLoad={() => setImageLoaded(prev => ({ ...prev, [idx]: true }))}
                          onError={() => setImageFailed(prev => ({ ...prev, [idx]: true }))}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            opacity: imageLoaded[idx] ? 1 : 0,
                            transition: 'opacity 0.3s',
                          }}
                        />
                      </div>
                    )}

                    {/* Emoji + text fallback or supplement */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                    }}>
                      <span style={{ fontSize: 28, flexShrink: 0 }}>{anchor.emoji}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}>{anchor.scene}</span>
                      {favoriteAnchor === idx && (
                        <span style={{ fontSize: 20, flexShrink: 0 }} title="Your favourite">⭐</span>
                      )}
                    </div>
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
                  className="btn-secondary"
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

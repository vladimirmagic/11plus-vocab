import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useGamification } from '../GamificationContext.jsx';

export default function SentenceBuilder() {
  const { user } = useAuth();
  const { recordExercise } = useGamification() || {};
  const [pointsFloat, setPointsFloat] = useState(null);
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [sentence, setSentence] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setTranscribing(true);
        try {
          const reader = new FileReader();
          const base64 = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const data = await apiFetch('/stt', { method: 'POST', body: { audio: base64 } });
          if (data.transcript) {
            setSentence(prev => prev ? prev + ' ' + data.transcript : data.transcript);
          }
        } catch (err) {
          console.error('Transcription failed:', err);
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  const fetchWords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/words?limit=200');
      const items = data.words || data;
      setWords(items);
      if (items.length > 0) {
        const w = items[Math.floor(Math.random() * items.length)];
        setCurrentWord(w);
        loadAttempts(w.id);
      }
    } catch (err) {
      console.error('Failed to fetch words:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchWords();
  }, [user, fetchWords]);

  async function loadAttempts(wordId) {
    try {
      const data = await apiFetch(`/freewrite/${wordId}`);
      setAttempts(data.attempts || []);
    } catch {
      setAttempts([]);
    }
  }

  function pickNextWord() {
    if (words.length === 0) return;
    const next = words[Math.floor(Math.random() * words.length)];
    setCurrentWord(next);
    setSentence('');
    setShowHint(false);
    setAttempts([]);
    loadAttempts(next.id);
  }

  async function handleSubmit() {
    if (!sentence.trim() || !currentWord || submitting) return;
    setSubmitting(true);
    try {
      const data = await apiFetch(`/freewrite/${currentWord.id}`, {
        method: 'POST',
        body: { sentence: sentence.trim() },
      });

      // Add to local attempts list
      if (data.attempt) {
        setAttempts(prev => [...prev, data.attempt]);
      }

      // Show points float
      const pts = data.points || 0;
      const label = pts >= 0 ? `+${pts}` : `${pts}`;
      setPointsFloat({ id: Date.now(), points: label, positive: pts >= 0 });
      setTimeout(() => setPointsFloat(null), 1500);

      setSentence('');
    } catch (err) {
      console.error('Failed to submit:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Free Write</h2>
        <p>Please log in to practice writing sentences.</p>
      </div>
    );
  }

  if (loading) return <p>Loading words...</p>;

  if (!currentWord) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Free Write</h2>
        <p>No words available. Please add some words first.</p>
      </div>
    );
  }

  const totalPoints = attempts.reduce((sum, a) => sum + (a.points || 0), 0);
  const correctCount = attempts.filter(a => a.correct).length;

  return (
    <div className="sentence-builder">
      {pointsFloat && (
        <span key={pointsFloat.id} className={`points-float ${pointsFloat.positive ? 'positive' : 'negative'}`}
          style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', fontSize: 28, zIndex: 999 }}>
          {pointsFloat.points}
        </span>
      )}

      {/* Word card */}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div className="word-detail-emoji">{currentWord.visual_emoji}</div>
        <h2 className="word-detail-word">{currentWord.word}</h2>
        <p>{currentWord.definition}</p>
        {currentWord.example_sentence && (
          <div style={{ marginTop: '0.5rem' }}>
            <button className="btn-secondary" onClick={() => setShowHint(!showHint)}>
              {showHint ? 'Hide Hint' : 'Show Hint'}
            </button>
            {showHint && (
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', opacity: 0.8 }}>{currentWord.example_sentence}</p>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {attempts.length > 0 && (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', padding: '0.75rem', marginBottom: '1rem', fontSize: 14 }}>
          <span>Attempts: <strong>{attempts.length}</strong></span>
          <span>Correct: <strong style={{ color: 'var(--green, #4caf50)' }}>{correctCount}</strong></span>
          <span>Points: <strong style={{ color: totalPoints >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)' }}>{totalPoints >= 0 ? '+' : ''}{totalPoints}</strong></span>
        </div>
      )}

      {/* Write area */}
      <div className="sentence-area">
        <div style={{ position: 'relative' }}>
          <textarea
            placeholder={`Write a sentence using "${currentWord.word}". Show that you understand what it means! Make sure the sentence is grammatically correct.`}
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            rows={3}
            style={{ paddingRight: 52 }}
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            title={recording ? 'Stop recording' : transcribing ? 'Transcribing...' : 'Dictate sentence'}
            style={{
              position: 'absolute', right: 8, top: 8, width: 40, height: 40,
              borderRadius: '50%', border: 'none', cursor: transcribing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              background: recording ? 'var(--red, #ef4444)' : transcribing ? '#ddd' : 'var(--green, #6b9e7a)',
              color: 'white', animation: recording ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          >
            {transcribing ? '⏳' : '🎙️'}
          </button>
        </div>
        {recording && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>🔴 Recording... tap to stop</div>}
        {transcribing && <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Converting speech to text...</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !sentence.trim()}>
            {submitting ? 'Checking...' : 'Submit'}
          </button>
          <button className="btn-secondary" onClick={pickNextWord}>Next Word</button>
        </div>
      </div>

      {/* Attempt History */}
      {attempts.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted, #888)', fontWeight: 700, marginBottom: 12 }}>
            Your Attempts ({attempts.length})
          </h3>
          {attempts.slice().reverse().map((a, idx) => (
            <div key={a.id} className="card" style={{
              marginBottom: 10, padding: '12px 16px',
              borderLeft: `4px solid ${a.correct ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted, #888)', fontWeight: 600 }}>
                  #{a.attempt_number}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: (a.points || 0) >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)',
                }}>
                  {(a.points || 0) >= 0 ? '+' : ''}{a.points || 0} pts
                </span>
              </div>
              <div style={{ fontSize: 14, marginBottom: 8, fontStyle: 'italic', color: 'var(--text, #333)' }}>
                "{a.sentence}"
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #666)' }}>
                {a.feedback}
              </div>
              {a.suggestion && (
                <div style={{ fontSize: 12, color: 'var(--purple, #8b5cf6)', marginTop: 4 }}>
                  💡 {a.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

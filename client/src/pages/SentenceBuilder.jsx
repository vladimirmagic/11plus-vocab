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
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
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
        setCurrentWord(items[Math.floor(Math.random() * items.length)]);
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

  function pickNextWord() {
    if (words.length === 0) return;
    const next = words[Math.floor(Math.random() * words.length)];
    setCurrentWord(next);
    setSentence('');
    setShowHint(false);
    setFeedback(null);
  }

  async function handleSubmit() {
    if (!sentence.trim() || !currentWord || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const data = await apiFetch('/games/validate-sentence', {
        method: 'POST',
        body: { wordId: currentWord.id, sentence: sentence.trim() },
      });
      setTotalAttempts(prev => prev + 1);
      if (data.correct) {
        setCorrectCount(prev => prev + 1);
      }
      setFeedback(data);

      // Record exercise in gamification system
      if (recordExercise) {
        const result = await recordExercise({
          wordId: currentWord.id,
          exerciseType: 'sentence',
          correct: data.correct,
          metadata: { sentence: sentence.trim(), feedback: data.feedback },
        });
        if (result) {
          const pts = data.correct ? '+20' : '-5';
          setPointsFloat({ id: Date.now(), points: pts, positive: data.correct });
          setTimeout(() => setPointsFloat(null), 1000);
        }
      }
    } catch (err) {
      console.error('Failed to validate sentence:', err);
      setFeedback({ correct: false, feedback: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Sentence Builder</h2>
        <p>Please log in to practice building sentences.</p>
      </div>
    );
  }

  if (loading) {
    return <p>Loading words...</p>;
  }

  if (!currentWord) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Sentence Builder</h2>
        <p>No words available. Please add some words first.</p>
      </div>
    );
  }

  return (
    <div className="sentence-builder">
      {pointsFloat && (
        <span key={pointsFloat.id} className={`points-float ${pointsFloat.positive ? 'positive' : 'negative'}`}
          style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', fontSize: 24 }}>
          {pointsFloat.points}
        </span>
      )}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div className="word-detail-emoji">{currentWord.visual_emoji}</div>
        <h2 className="word-detail-word">{currentWord.word}</h2>
        <p>{currentWord.definition}</p>

        {currentWord.example_sentence && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              className="btn-secondary"
              onClick={() => setShowHint(!showHint)}
            >
              {showHint ? 'Hide Hint' : 'Show Hint'}
            </button>
            {showHint && (
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', opacity: 0.8 }}>
                {currentWord.example_sentence}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="sentence-area">
        <div style={{ position: 'relative' }}>
          <textarea
            placeholder={`Write a sentence using "${currentWord.word}"...`}
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            rows={4}
            style={{ paddingRight: 52 }}
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            title={recording ? 'Stop recording' : transcribing ? 'Transcribing...' : 'Dictate sentence'}
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              cursor: transcribing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: recording ? 'var(--red, #ef4444)' : transcribing ? 'var(--cream-dark, #ddd)' : 'var(--green, #6b9e7a)',
              color: 'white',
              animation: recording ? 'pulse 1s ease-in-out infinite' : 'none',
              transition: 'background 0.2s',
            }}
          >
            {transcribing ? '⏳' : '🎙️'}
          </button>
        </div>
        {recording && (
          <div style={{ fontSize: 13, color: 'var(--red, #ef4444)', marginTop: 4, fontWeight: 600 }}>
            🔴 Recording... tap the microphone to stop
          </div>
        )}
        {transcribing && (
          <div style={{ fontSize: 13, color: 'var(--text-muted, #888)', marginTop: 4 }}>
            Converting speech to text...
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !sentence.trim()}
          >
            {submitting ? 'Checking...' : 'Submit'}
          </button>
          <button className="btn-secondary" onClick={pickNextWord}>
            Next Word
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`feedback-card ${feedback.correct ? 'correct' : 'incorrect'}`}>
          <p><strong>{feedback.correct ? 'Great job!' : 'Not quite right'}</strong></p>
          <p>{feedback.feedback}</p>
          {feedback.suggestion && <p><em>Suggestion: {feedback.suggestion}</em></p>}
        </div>
      )}

      {totalAttempts > 0 && (
        <div className="card" style={{ textAlign: 'center', marginTop: '1rem' }}>
          <p>
            Attempts: {totalAttempts} | Correct: {correctCount} |
            Accuracy: {Math.round((correctCount / totalAttempts) * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}

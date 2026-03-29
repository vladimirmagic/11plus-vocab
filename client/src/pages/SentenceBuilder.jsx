import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function SentenceBuilder() {
  const { user } = useAuth();
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [sentence, setSentence] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

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
        <textarea
          placeholder={`Write a sentence using "${currentWord.word}"...`}
          value={sentence}
          onChange={e => setSentence(e.target.value)}
          rows={4}
        />
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

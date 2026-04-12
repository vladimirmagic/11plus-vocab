import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useGamification } from '../GamificationContext.jsx';

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function MatchingGame() {
  const { user } = useAuth();
  const { recordExercise, recordBonus, newSessionId } = useGamification() || {};
  const [pointsFloat, setPointsFloat] = useState(null);
  const [words, setWords] = useState([]);
  const [shuffledDefs, setShuffledDefs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [selectedWord, setSelectedWord] = useState(null);
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [wrongPair, setWrongPair] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const [timer, setTimer] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    apiFetch('/words/categories')
      .then(data => setCategories(data.categories || data))
      .catch(err => console.error('Failed to fetch categories:', err));
  }, []);

  const startGame = useCallback(async () => {
    if (newSessionId) newSessionId();
    setLoading(true);
    setGameComplete(false);
    setMatchedIds(new Set());
    setSelectedWord(null);
    setWrongPair(null);
    setScore(0);
    setStreak(0);
    setTimer(0);
    try {
      const data = await apiFetch(`/games/matching?count=8&category=${encodeURIComponent(category)}`);
      const items = data.words || data;
      setWords(items);
      setShuffledDefs(shuffleArray(items));
      setGameActive(true);
    } catch (err) {
      console.error('Failed to fetch matching words:', err);
    } finally {
      setLoading(false);
    }
  }, [category, newSessionId]);

  useEffect(() => {
    if (gameActive && !gameComplete) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameActive, gameComplete]);

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleDefClick(defWord) {
    if (!selectedWord || matchedIds.has(defWord.id) || wrongPair) return;

    if (selectedWord.id === defWord.id) {
      const newMatched = new Set(matchedIds);
      newMatched.add(defWord.id);
      setMatchedIds(newMatched);
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
      setSelectedWord(null);

      if (recordExercise) {
        await recordExercise({
          wordId: defWord.id,
          exerciseType: 'matching',
          correct: true,
          metadata: { timeElapsed: timer },
        });
      }
      setPointsFloat({ id: Date.now(), points: '+10', positive: true });
      setTimeout(() => setPointsFloat(null), 1000);

      if (newMatched.size === words.length) {
        setGameComplete(true);
        setGameActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        // Perfect round bonus if all correct (score was never reset, so score+1 === words.length means no wrong answers)
        if (score + 1 === words.length && recordBonus) {
          recordBonus({ points: 25, reason: 'perfect_round' });
        }
      }
    } else {
      setStreak(0);
      setWrongPair({ wordId: selectedWord.id, defId: defWord.id });

      if (recordExercise) {
        await recordExercise({
          wordId: selectedWord.id,
          exerciseType: 'matching',
          correct: false,
          metadata: {},
        });
      }
      setPointsFloat({ id: Date.now(), points: '-3', positive: false });
      setTimeout(() => setPointsFloat(null), 1000);

      setTimeout(() => {
        setWrongPair(null);
        setSelectedWord(null);
      }, 500);
    }
  }

  function handleWordClick(word) {
    if (matchedIds.has(word.id) || wrongPair) return;
    setSelectedWord(prev => (prev && prev.id === word.id ? null : word));
  }

  function handlePlayAgain() {
    setRound(prev => prev + 1);
    startGame();
  }

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Matching Game</h2>
        <p>Please log in to play the matching game.</p>
      </div>
    );
  }

  if (!gameActive && !gameComplete) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Matching Game</h2>
        <p>Match words to their definitions as fast as you can!</p>
        <div className="category-pills" style={{ marginBottom: '1rem' }}>
          <button
            className={`category-pill${category === '' ? ' active' : ''}`}
            onClick={() => setCategory('')}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.category || cat}
              className={`category-pill${category === (cat.category || cat) ? ' active' : ''}`}
              onClick={() => setCategory(cat.category || cat)}
            >
              {cat.category || cat}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={startGame} disabled={loading}>
          {loading ? 'Loading...' : 'Start Game'}
        </button>
      </div>
    );
  }

  return (
    <div className="matching-game">
      <div className="game-header" style={{ position: 'relative' }}>
        <div className="game-score">
          <div className="score-item">
            <span className="score-value">{score}/{words.length}</span>
            <span className="score-label">Score</span>
          </div>
          <div className="score-item">
            <span className="score-value">{streak}</span>
            <span className="score-label">Streak</span>
          </div>
          <div className="score-item">
            <span className="score-value">{formatTime(timer)}</span>
            <span className="score-label">Time</span>
          </div>
          <div className="score-item">
            <span className="score-value">{round}</span>
            <span className="score-label">Round</span>
          </div>
        </div>
        {pointsFloat && (
          <span key={pointsFloat.id} className={`points-float ${pointsFloat.positive ? 'positive' : 'negative'}`}
            style={{ position: 'absolute', right: 16, top: 8 }}>
            {pointsFloat.points}
          </span>
        )}
      </div>

      {gameComplete ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>Congratulations!</h2>
          <p>You matched all {words.length} words in {formatTime(timer)}!</p>
          <p>Final score: {score}/{words.length}</p>
          <button className="btn-primary" onClick={handlePlayAgain}>
            Play Again
          </button>
        </div>
      ) : (
        <div className="game-board">
          <div className="game-column">
            {words.map(word => (
              <div
                key={`word-${word.id}`}
                className={
                  'game-item' +
                  (matchedIds.has(word.id) ? ' matched' : '') +
                  (selectedWord && selectedWord.id === word.id ? ' selected' : '') +
                  (wrongPair && wrongPair.wordId === word.id ? ' wrong' : '')
                }
                onClick={() => handleWordClick(word)}
              >
                {word.word}
              </div>
            ))}
          </div>
          <div className="game-column">
            {shuffledDefs.map(word => (
              <div
                key={`def-${word.id}`}
                className={
                  'game-item' +
                  (matchedIds.has(word.id) ? ' matched' : '') +
                  (wrongPair && wrongPair.defId === word.id ? ' wrong' : '')
                }
                onClick={() => handleDefClick(word)}
              >
                {word.definition}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

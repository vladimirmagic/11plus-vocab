import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { LinkedText, useWords } from '../WordsContext.jsx';
import { useGamification } from '../GamificationContext.jsx';

let currentAudio = null;
let currentProgressCleanup = null;

function AddRelatedWord({ wordId, type, onAdded }) {
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const handleAdd = async () => {
    const w = input.trim();
    if (!w) return;
    setAdding(true);
    setMsg('');
    try {
      const res = await apiFetch(`/words/${wordId}/add-related`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: w, type }),
      });
      if (res.created) {
        setMsg(`✅ "${w}" added and full word page created!`);
      } else if (res.message === 'Already exists') {
        setMsg(`"${w}" was already listed.`);
      } else {
        setMsg(`✅ "${w}" added as ${type}!`);
      }
      setInput('');
      onAdded(w);
    } catch (err) {
      setMsg('❌ Error: ' + (err.message || 'Failed'));
    } finally {
      setAdding(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        placeholder={`Add a ${type}...`}
        disabled={adding}
        style={{
          padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd',
          fontSize: 13, width: 160, outline: 'none',
        }}
      />
      <button
        onClick={handleAdd}
        disabled={adding || !input.trim()}
        className="btn-primary"
        style={{ padding: '6px 14px', fontSize: 13, opacity: adding ? 0.6 : 1 }}
      >
        {adding ? '...' : '+ Add'}
      </button>
      {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#4caf50' : msg.startsWith('❌') ? '#f44336' : '#888' }}>{msg}</span>}
    </div>
  );
}

function SpeakButton({ text, onProgress }) {
  const { user } = useAuth();
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async (e) => {
    e.stopPropagation();
    if (speaking || loading) {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      if (currentProgressCleanup) { currentProgressCleanup(); currentProgressCleanup = null; }
      setSpeaking(false);
      setLoading(false);
      if (onProgress) onProgress(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: user?.voice_preference }),
      });
      const data = await res.json();
      if (!data.audio) throw new Error('No audio');

      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      if (currentProgressCleanup) { currentProgressCleanup(); currentProgressCleanup = null; }

      const audio = new Audio('data:audio/mp3;base64,' + data.audio);
      currentAudio = audio;

      if (onProgress) {
        let rafId = null;
        const tick = () => {
          if (audio.duration && audio.duration > 0 && !audio.paused) {
            onProgress(audio.currentTime / audio.duration);
          }
          if (!audio.paused && !audio.ended) {
            rafId = requestAnimationFrame(tick);
          }
        };
        audio.onplay = () => { rafId = requestAnimationFrame(tick); };
        currentProgressCleanup = () => {
          if (rafId) cancelAnimationFrame(rafId);
          if (onProgress) onProgress(null);
        };
      }

      audio.onended = () => {
        setSpeaking(false);
        currentAudio = null;
        if (onProgress) onProgress(null);
        currentProgressCleanup = null;
      };
      audio.onerror = () => {
        setSpeaking(false);
        currentAudio = null;
        if (onProgress) onProgress(null);
        currentProgressCleanup = null;
      };
      await audio.play();
      setSpeaking(true);
    } catch {
      // Fallback to browser TTS
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.9;
      utter.onend = () => { setSpeaking(false); if (onProgress) onProgress(null); };
      window.speechSynthesis.speak(utter);
      setSpeaking(true);
    } finally {
      setLoading(false);
    }
  }, [text, speaking, loading, onProgress]);

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
        color: speaking ? 'var(--red)' : loading ? 'var(--text-muted)' : 'var(--green)',
        opacity: 0.7,
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {speaking ? '⏹' : loading ? '...' : '🔊'}
    </button>
  );
}

// ── SpeakableText: text with word highlighting + linked vocab words + optional tooltips ──
function SpeakableText({ text, skipWord, progress, spokenOffset = 0, showTooltips, onSaveWord }) {
  const ctx = useWords();
  const [tooltipWord, setTooltipWord] = useState(null);

  if (!text) return null;

  // Split text into word tokens and whitespace
  const tokens = text.match(/\S+|\s+/g) || [];
  const wordTokenIndices = [];
  tokens.forEach((t, i) => { if (/\S/.test(t)) wordTokenIndices.push(i); });
  const totalDisplayWords = wordTokenIndices.length;

  // Calculate which display word to highlight, accounting for spoken offset
  let highlightedTokenIndex = -1;
  if (progress !== null && progress !== undefined && totalDisplayWords > 0) {
    const totalSpoken = totalDisplayWords + spokenOffset;
    const spokenIdx = Math.min(Math.floor(progress * totalSpoken), totalSpoken - 1);
    const displayIdx = spokenIdx - spokenOffset;
    if (displayIdx >= 0 && displayIdx < totalDisplayWords) {
      highlightedTokenIndex = wordTokenIndices[displayIdx];
    }
  }

  const skipLower = skipWord?.toLowerCase();

  return (
    <span>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

        const isHighlighted = i === highlightedTokenIndex;

        // Check if this is a linkable vocab word
        const cleanWord = token.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        const entry = cleanWord.length > 1 ? ctx?.wordMap?.get(cleanWord) : null;
        const isLinked = entry && cleanWord !== skipLower;

        const hlStyle = isHighlighted ? {
          backgroundColor: '#FFF9C4',
          borderRadius: 3,
        } : {};

        if (isLinked) {
          const isTooltipActive = showTooltips && tooltipWord && tooltipWord.tokenIndex === i;
          return (
            <span
              key={i}
              style={{ position: 'relative', display: 'inline' }}
              onMouseEnter={() => showTooltips && setTooltipWord({ ...entry, tokenIndex: i })}
              onMouseLeave={() => showTooltips && setTooltipWord(null)}
            >
              <a
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (showTooltips) {
                    setTooltipWord(isTooltipActive ? null : { ...entry, tokenIndex: i });
                  } else {
                    ctx.onNavigate('word', entry.id);
                  }
                }}
                style={{
                  ...hlStyle,
                  textDecoration: 'underline',
                  textDecorationColor: 'var(--green, #6b9e7a)',
                  textUnderlineOffset: 2,
                  color: 'inherit',
                  cursor: 'pointer',
                  textDecorationThickness: 2,
                }}
                title={showTooltips ? undefined : `Go to "${entry.word}"`}
              >
                {token}
              </a>
              {/* Tooltip */}
              {isTooltipActive && (
                <div
                  style={{
                    position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                    background: 'white', border: '1px solid var(--cream-dark, #e0d5c1)', borderRadius: 10,
                    padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100,
                    minWidth: 220, maxWidth: 300, fontSize: 13, lineHeight: 1.5, textAlign: 'left',
                    fontStyle: 'normal',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--green-dark, #4a7c59)' }}>
                    {entry.word}
                  </div>
                  <p style={{ margin: '0 0 8px', color: 'var(--text, #333)', fontSize: 13 }}>
                    {entry.definition || 'No definition available'}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {onSaveWord && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSaveWord(entry.id); setTooltipWord(null); }}
                        style={{
                          flex: 1, padding: '5px 8px', fontSize: 12, borderRadius: 6,
                          border: 'none', background: 'var(--green, #6b9e7a)',
                          color: 'white', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                        }}
                      >
                        Save word
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); ctx.onNavigate('word', entry.id); }}
                      style={{
                        flex: 1, padding: '5px 8px', fontSize: 12, borderRadius: 6,
                        border: '1px solid var(--cream-dark, #e0d5c1)', background: 'var(--cream, #f5f0e8)',
                        color: 'var(--text, #333)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                      }}
                    >
                      Learn more
                    </button>
                  </div>
                  {/* Arrow */}
                  <div style={{
                    position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
                    width: 12, height: 12, background: 'white',
                    borderRight: '1px solid var(--cream-dark, #e0d5c1)',
                    borderBottom: '1px solid var(--cream-dark, #e0d5c1)',
                  }} />
                </div>
              )}
            </span>
          );
        }

        // Non-linked word
        if (isHighlighted) {
          return <span key={i} style={hlStyle}>{token}</span>;
        }
        return token;
      })}
    </span>
  );
}

// ── Matching Game (embedded, related words) ──
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function RelatedMatchingGame({ word }) {
  const [words, setWords] = useState([]);
  const [shuffledRight, setShuffledRight] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [wrongPair, setWrongPair] = useState(null);
  const [points, setPoints] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [matchType, setMatchType] = useState('definition');
  const timerRef = useRef(null);

  function buildPairs(items, type) {
    if (type === 'synonyms') {
      // Each word paired with its first synonym
      return items.filter(w => w.synonyms && w.synonyms.length > 0).map(w => ({
        id: w.id, left: w.word, right: w.synonyms[0],
      }));
    } else if (type === 'antonyms') {
      return items.filter(w => w.antonyms && w.antonyms.length > 0).map(w => ({
        id: w.id, left: w.word, right: w.antonyms[0],
      }));
    }
    // definition
    return items.map(w => ({ id: w.id, left: w.word, right: w.definition }));
  }

  async function startGame() {
    setLoading(true);
    setGameComplete(false);
    setMatchedIds(new Set());
    setSelectedWord(null);
    setWrongPair(null);
    setPoints(0);
    setCorrect(0);
    setWrong(0);
    setTimer(0);
    try {
      const data = await apiFetch(`/words/${word.id}/related-match`, { method: 'POST' });
      const items = data.words || [];
      const pairs = buildPairs(items, matchType);
      if (pairs.length < 2) {
        // Fallback to definitions if not enough synonyms/antonyms
        const fallback = buildPairs(items, 'definition');
        setWords(fallback);
        setShuffledRight(shuffleArray(fallback));
      } else {
        setWords(pairs);
        setShuffledRight(shuffleArray(pairs));
      }
      setGameActive(true);
    } catch (err) {
      console.error('Failed to fetch related words:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (gameActive && !gameComplete) {
      timerRef.current = setInterval(() => setTimer(prev => prev + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameActive, gameComplete]);

  function formatTime(s) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  function handleRightClick(pair) {
    if (!selectedWord || matchedIds.has(pair.id) || wrongPair) return;
    if (selectedWord.id === pair.id) {
      const newMatched = new Set(matchedIds);
      newMatched.add(pair.id);
      setMatchedIds(newMatched);
      setPoints(prev => prev + 1);
      setCorrect(prev => prev + 1);
      setSelectedWord(null);
      if (newMatched.size === words.length) {
        setGameComplete(true);
        setGameActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } else {
      setPoints(prev => prev - 1);
      setWrong(prev => prev + 1);
      setWrongPair({ wordId: selectedWord.id, defId: pair.id });
      setTimeout(() => { setWrongPair(null); setSelectedWord(null); }, 500);
    }
  }

  function handleLeftClick(pair) {
    if (matchedIds.has(pair.id) || wrongPair) return;
    setSelectedWord(prev => (prev && prev.id === pair.id ? null : pair));
  }

  const typeLabels = { definition: 'Word → Definition', synonyms: 'Word → Synonym', antonyms: 'Word → Antonym' };

  if (!gameActive && !gameComplete) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>
          Word Matching
        </h3>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          {['definition', 'synonyms', 'antonyms'].map(t => (
            <button key={t} className={matchType === t ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setMatchType(t)} style={{ fontSize: 13, padding: '6px 14px' }}>
              {typeLabels[t]}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={startGame} disabled={loading} style={{ fontSize: 15, padding: '10px 24px' }}>
          {loading ? 'Loading...' : 'Start Matching'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="game-header" style={{ marginBottom: 12 }}>
        <div className="game-score">
          <div className="score-item">
            <span className="score-value" style={{ color: points >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)' }}>
              {points >= 0 ? '+' : ''}{points}
            </span>
            <span className="score-label">Points</span>
          </div>
          <div className="score-item">
            <span className="score-value" style={{ color: 'var(--green, #4caf50)' }}>{correct}</span>
            <span className="score-label">Correct</span>
          </div>
          <div className="score-item">
            <span className="score-value" style={{ color: wrong > 0 ? 'var(--red, #ef4444)' : 'inherit' }}>{wrong}</span>
            <span className="score-label">Wrong</span>
          </div>
          <div className="score-item">
            <span className="score-value">{formatTime(timer)}</span>
            <span className="score-label">Time</span>
          </div>
        </div>
      </div>

      {gameComplete ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>{points === words.length ? '🎉 Perfect!' : 'Well done!'}</h2>
          <p>Matched {words.length} pairs in {formatTime(timer)}</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: points >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 8 }}>
            {points >= 0 ? '+' : ''}{points} points ({correct} correct, {wrong} wrong)
          </p>
          <button className="btn-primary" onClick={() => { setGameActive(false); setGameComplete(false); }} style={{ marginTop: 12 }}>
            Try Again
          </button>
        </div>
      ) : (
        <div className="game-board">
          <div className="game-column">
            {words.map(p => (
              <div key={`left-${p.id}`}
                className={'game-item' + (matchedIds.has(p.id) ? ' matched' : '') + (selectedWord && selectedWord.id === p.id ? ' selected' : '') + (wrongPair && wrongPair.wordId === p.id ? ' wrong' : '')}
                onClick={() => handleLeftClick(p)}>{p.left}</div>
            ))}
          </div>
          <div className="game-column">
            {shuffledRight.map(p => (
              <div key={`right-${p.id}`}
                className={'game-item' + (matchedIds.has(p.id) ? ' matched' : '') + (wrongPair && wrongPair.defId === p.id ? ' wrong' : '')}
                onClick={() => handleRightClick(p)}>{p.right}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared: Microphone + Textarea input ──
function DictationTextarea({ value, onChange, placeholder, recording, setRecording, transcribing, setTranscribing }) {
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
            onChange(prev => prev ? prev + ' ' + data.transcript : data.transcript);
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

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ paddingRight: 52 }}
        />
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          title={recording ? 'Stop recording' : transcribing ? 'Transcribing...' : 'Dictate'}
          style={{
            position: 'absolute', right: 8, top: 8, width: 40, height: 40, borderRadius: '50%',
            border: 'none', cursor: transcribing ? 'wait' : 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 20,
            background: recording ? 'var(--red, #ef4444)' : transcribing ? 'var(--cream-dark, #ddd)' : 'var(--green, #6b9e7a)',
            color: 'white', animation: recording ? 'pulse 1s ease-in-out infinite' : 'none', transition: 'background 0.2s',
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
    </div>
  );
}

// ── Sentence Builder Exercise (embedded) ──
function SentenceExercise({ word }) {
  const { user } = useAuth();
  const [exerciseMode, setExerciseMode] = useState('free'); // 'free' | 'text' | 'picture'
  const [sentence, setSentence] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [freeWriteAttempts, setFreeWriteAttempts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [pictureHint, setPictureHint] = useState(null);
  const [pictureLoading, setPictureLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Text prompt state
  const [textPrompt, setTextPrompt] = useState(null);
  const [textPromptLoading, setTextPromptLoading] = useState(false);

  // Picture prompt state
  const [picturePrompt, setPicturePrompt] = useState(null);
  const [picturePromptLoading, setPicturePromptLoading] = useState(false);

  async function loadTextPrompt() {
    setTextPromptLoading(true);
    try {
      const data = await apiFetch(`/words/${word.id}/text-prompt`, { method: 'POST' });
      setTextPrompt(data.scenario || '');
    } catch (err) {
      console.error('Text prompt failed:', err);
    } finally {
      setTextPromptLoading(false);
    }
  }

  async function loadPicturePrompt() {
    setPicturePromptLoading(true);
    try {
      const data = await apiFetch(`/words/${word.id}/picture-prompt`, { method: 'POST' });
      setPicturePrompt(data);
    } catch (err) {
      console.error('Picture prompt failed:', err);
    } finally {
      setPicturePromptLoading(false);
    }
  }

  function switchMode(mode) {
    setExerciseMode(mode);
    setSentence('');
    setFeedback(null);
    setShowHint(false);
    if (mode === 'text' && !textPrompt) loadTextPrompt();
    if (mode === 'picture' && !picturePrompt) loadPicturePrompt();
  }

  async function handleSubmit() {
    if (!sentence.trim() || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (exerciseMode === 'free') {
        // Free write — save to database with full history
        const data = await apiFetch(`/freewrite/${word.id}`, {
          method: 'POST',
          body: { sentence: sentence.trim() },
        });
        setFeedback(data);
        if (data.attempt) {
          setFreeWriteAttempts(prev => [...prev, data.attempt]);
        }
        setSentence('');
        if (refreshGamification) refreshGamification();
      } else {
        // Text/Picture prompt — validate only, no persistent history
        const data = await apiFetch('/games/validate-sentence', {
          method: 'POST',
          body: { wordId: word.id, sentence: sentence.trim() },
        });
        setFeedback(data);
      }
    } catch (err) {
      console.error('Failed to validate sentence:', err);
      setFeedback({ correct: false, feedback: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSentence('');
    setFeedback(null);
    setShowHint(false);
  }

  const modes = [
    { id: 'free', icon: '✍️', label: 'Free Write' },
    { id: 'text', icon: '📝', label: 'Text Prompt' },
    { id: 'picture', icon: '🖼️', label: 'Picture Prompt' },
    { id: 'match', icon: '🎯', label: 'Matching' },
  ];

  return (
    <div>
      {/* Exercise mode selector */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16,
      }}>
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => switchMode(m.id)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 10, border: '2px solid',
              borderColor: exerciseMode === m.id ? 'var(--green, #6b9e7a)' : 'var(--cream-dark, #e0d5c1)',
              background: exerciseMode === m.id ? 'var(--green, #6b9e7a)' : 'var(--white, #fff)',
              color: exerciseMode === m.id ? 'white' : 'var(--text, #333)',
              cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: 20 }}>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Free Write ── */}
      {exerciseMode === 'free' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>
            Free Write
          </h3>
          <p style={{ fontSize: 15, marginBottom: 12, lineHeight: 1.5 }}>
            Write a sentence using the word <strong style={{ color: 'var(--green-dark)' }}>"{word.word}"</strong>.
            Show that you understand what it means!
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {word.example_sentence && (
              <button className="btn-secondary" onClick={() => setShowHint(!showHint)} style={{ fontSize: 13, padding: '6px 12px' }}>
                {showHint ? 'Hide Hint' : '💡 Show Hint'}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={async () => {
                if (pictureHint) { setPictureHint(null); return; }
                setPictureLoading(true);
                try {
                  const data = await apiFetch(`/words/${word.id}/picture-hint`, { method: 'POST' });
                  if (data.image_url) setPictureHint(data.image_url);
                } catch (err) { console.error('Picture hint failed:', err); }
                finally { setPictureLoading(false); }
              }}
              disabled={pictureLoading}
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              {pictureLoading ? '🎨 Generating...' : pictureHint ? 'Hide Picture' : '🎨 Show Picture Hint'}
            </button>
          </div>

          {showHint && word.example_sentence && (
            <p style={{ marginBottom: 12, fontStyle: 'italic', fontSize: 14, opacity: 0.8, padding: '8px 12px', background: 'var(--cream)', borderRadius: 8 }}>
              {word.example_sentence}
            </p>
          )}

          {pictureHint && (
            <div style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--cream-dark)' }}>
              <img src={pictureHint} alt={`Picture hint for ${word.word}`} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          <DictationTextarea
            value={sentence} onChange={setSentence}
            placeholder={`Write a sentence using "${word.word}". Show that you understand what it means! Make sure the sentence is grammatically correct.`}
            recording={recording} setRecording={setRecording}
            transcribing={transcribing} setTranscribing={setTranscribing}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 12 }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !sentence.trim()}>
              {submitting ? 'Checking...' : 'Check My Sentence'}
            </button>
            <button className="btn-secondary" onClick={handleReset}>Clear</button>
          </div>

          {/* Free Write Attempt History */}
          {freeWriteAttempts.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--cream-dark, #e0d5c1)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: 10, fontSize: 13 }}>
                <span>Attempts: <strong>{freeWriteAttempts.length}</strong></span>
                <span>Correct: <strong style={{ color: 'var(--green, #4caf50)' }}>{freeWriteAttempts.filter(a => a.correct).length}</strong></span>
                <span>Points: <strong style={{ color: freeWriteAttempts.reduce((s, a) => s + (a.points || 0), 0) >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)' }}>
                  {freeWriteAttempts.reduce((s, a) => s + (a.points || 0), 0) >= 0 ? '+' : ''}{freeWriteAttempts.reduce((s, a) => s + (a.points || 0), 0)}
                </strong></span>
              </div>
              {freeWriteAttempts.slice().reverse().map((a) => (
                <div key={a.id} style={{
                  marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--cream, #f9f6f0)',
                  borderLeft: `4px solid ${a.correct ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>#{a.attempt_number}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: (a.points || 0) >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef4444)' }}>
                      {(a.points || 0) >= 0 ? '+' : ''}{a.points || 0} pts
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontStyle: 'italic', marginBottom: 6 }}>&ldquo;{a.sentence}&rdquo;</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.feedback}</div>
                  {a.suggestion && <div style={{ fontSize: 12, color: 'var(--purple, #8b5cf6)', marginTop: 4 }}>💡 {a.suggestion}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Text Prompt ── */}
      {exerciseMode === 'text' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>
            Text Prompt
          </h3>
          <p style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Read the situation below. Rewrite it using the word <strong style={{ color: 'var(--green-dark)' }}>"{word.word}"</strong>.
          </p>

          {textPromptLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
              <p style={{ fontSize: 13 }}>Creating a scenario for you...</p>
            </div>
          ) : textPrompt ? (
            <div style={{
              padding: '14px 18px', background: 'var(--cream)', borderRadius: 12,
              borderLeft: '4px solid var(--orange, #e8a54b)', marginBottom: 14, lineHeight: 1.7, fontSize: 15,
            }}>
              <LinkedText text={textPrompt} skipWord={word.word} />
            </div>
          ) : null}

          <DictationTextarea
            value={sentence} onChange={setSentence}
            placeholder={`Rewrite the situation using "${word.word}"...`}
            recording={recording} setRecording={setRecording}
            transcribing={transcribing} setTranscribing={setTranscribing}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 12 }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !sentence.trim()}>
              {submitting ? 'Checking...' : 'Check My Sentence'}
            </button>
            <button className="btn-secondary" onClick={() => { setTextPrompt(null); loadTextPrompt(); setSentence(''); setFeedback(null); }}>
              New Prompt
            </button>
          </div>
        </div>
      )}

      {/* ── Picture Prompt ── */}
      {exerciseMode === 'picture' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>
            Picture Prompt
          </h3>
          <p style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Look at the picture below and describe what you see using the word <strong style={{ color: 'var(--green-dark)' }}>"{word.word}"</strong>.
          </p>

          {picturePromptLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
              <p style={{ fontSize: 13 }}>Painting a scene for you...</p>
            </div>
          ) : picturePrompt ? (
            <div style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--cream-dark)' }}>
              <img
                src={picturePrompt.image_url}
                alt="Describe this scene"
                style={{ width: '100%', maxHeight: 350, objectFit: 'cover', display: 'block' }}
              />
            </div>
          ) : null}

          <DictationTextarea
            value={sentence} onChange={setSentence}
            placeholder={`Describe the picture using "${word.word}"...`}
            recording={recording} setRecording={setRecording}
            transcribing={transcribing} setTranscribing={setTranscribing}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 12 }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !sentence.trim()}>
              {submitting ? 'Checking...' : 'Check My Sentence'}
            </button>
            <button className="btn-secondary" onClick={() => { setPicturePrompt(null); loadPicturePrompt(); setSentence(''); setFeedback(null); }}>
              New Picture
            </button>
          </div>
        </div>
      )}

      {/* ── Matching Game ── */}
      {exerciseMode === 'match' && (
        <RelatedMatchingGame word={word} />
      )}

      {/* Latest feedback (for non-free-write exercises) */}
      {feedback && exerciseMode !== 'free' && (
        <div className={`feedback-card ${feedback.correct ? 'correct' : 'incorrect'}`}>
          <p><strong>{feedback.correct ? 'Great job!' : 'Not quite right'}</strong></p>
          <p><LinkedText text={feedback.feedback} skipWord={word.word} /></p>
          {feedback.suggestion && <p><em>Suggestion: <LinkedText text={feedback.suggestion} skipWord={word.word} /></em></p>}
        </div>
      )}
    </div>
  );
}

// ── Main WordDetail Component ──
export default function WordDetail({ wordId, onNavigate }) {
  const { user } = useAuth();
  const { refresh: refreshGamification } = useGamification() || {};
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
  const [activeTab, setActiveTab] = useState('learn');

  // TTS word highlighting
  const [activeSpeakKey, setActiveSpeakKey] = useState(null);
  const [speakProgress, setSpeakProgress] = useState(null);

  const handleProgress = useCallback((key) => (progress) => {
    if (progress !== null && progress !== undefined) {
      setActiveSpeakKey(key);
      setSpeakProgress(progress);
    } else {
      setActiveSpeakKey(prev => prev === key ? null : prev);
      setSpeakProgress(prev => activeSpeakKey === key ? null : prev);
    }
  }, [activeSpeakKey]);

  // Save word to user's list (from tooltip)
  const handleSaveWord = useCallback(async (saveWordId) => {
    if (!user) return;
    try {
      await apiFetch(`/progress/${saveWordId}`, { method: 'PUT', body: { status: 'learning' } });
    } catch (err) {
      console.error('Failed to save word:', err);
    }
  }, [user]);

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
    // Load free write attempts
    apiFetch(`/freewrite/${wordId}`)
      .then(data => setFreeWriteAttempts(data.attempts || []))
      .catch(() => setFreeWriteAttempts([]));
  }, [wordId]);

  // Auto-generate missing images one by one with progress
  const [imageGenProgress, setImageGenProgress] = useState(''); // '' | 'Generating image 1 of 3...' etc
  const imageGenRef = useRef(false);
  useEffect(() => {
    if (!word || imageGenRef.current) return;
    const currentAnchors = Array.isArray(word.visual_anchors) ? word.visual_anchors : [];
    if (currentAnchors.length === 0) return;
    const missing = currentAnchors.map((a, i) => ({ ...a, idx: i })).filter(a => !a.image_url);
    if (missing.length === 0) return;

    imageGenRef.current = true;
    setImagesLoading(true);

    (async () => {
      for (let mi = 0; mi < missing.length; mi++) {
        const m = missing[mi];
        setImageGenProgress(`Generating image ${mi + 1} of ${missing.length}...`);
        try {
          const data = await apiFetch(`/words/${wordId}/generate-single-anchor`, { method: 'POST', body: { anchorIndex: m.idx } });
          if (data.image_url) {
            setAnchors(prev => {
              const updated = [...prev];
              updated[m.idx] = { ...updated[m.idx], image_url: data.image_url };
              return updated;
            });
          }
        } catch (err) {
          console.log(`Anchor ${m.idx} generation failed:`, err.message);
        }
      }
      setImagesLoading(false);
      setImageGenProgress('');
    })();
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

  const [navigatingWord, setNavigatingWord] = useState(null);

  async function handleSynonymClick(syn) {
    setNavigatingWord(syn);
    try {
      // Search for the word in the database
      const data = await apiFetch('/words?search=' + encodeURIComponent(syn) + '&limit=50');
      const items = data.words || data;
      const exact = items.find(w => w.word.toLowerCase() === syn.toLowerCase());
      if (exact) {
        // Word exists — navigate to it
        setNavigatingWord(null);
        onNavigate('word', exact.id);
        return;
      }

      // Word doesn't exist — generate and create it in one call
      const result = await apiFetch('/words/find-or-create', {
        method: 'POST',
        body: { word: syn },
      });

      setNavigatingWord(null);
      if (result && result.word) {
        onNavigate('word', result.word.id);
      }
    } catch (err) {
      console.error('Failed to navigate to synonym:', err);
      setNavigatingWord(null);
      // Fallback: go to word list with search
      onNavigate('words', syn);
    }
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

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        marginBottom: 20,
        borderRadius: 'var(--radius-sm, 10px)',
        overflow: 'hidden',
        border: '2px solid var(--cream-dark, #e0d5c1)',
      }}>
        <button
          onClick={() => setActiveTab('learn')}
          style={{
            flex: 1,
            padding: '12px 20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            background: activeTab === 'learn' ? 'var(--green, #6b9e7a)' : 'var(--white, #fff)',
            color: activeTab === 'learn' ? 'white' : 'var(--text, #333)',
            transition: 'all 0.2s',
          }}
        >
          📖 Learn
        </button>
        <button
          onClick={() => setActiveTab('exercises')}
          style={{
            flex: 1,
            padding: '12px 20px',
            border: 'none',
            borderLeft: '2px solid var(--cream-dark, #e0d5c1)',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            background: activeTab === 'exercises' ? 'var(--green, #6b9e7a)' : 'var(--white, #fff)',
            color: activeTab === 'exercises' ? 'white' : 'var(--text, #333)',
            transition: 'all 0.2s',
          }}
        >
          ✍️ Exercises
        </button>
      </div>

      {/* Learn Tab */}
      {activeTab === 'learn' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

          {/* Left column */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Definition</h3>
                <SpeakButton text={`${word.word}. ${word.definition}`} onProgress={handleProgress('definition')} />
              </div>
              <p style={{ fontSize: 18, lineHeight: 1.6 }}>
                <SpeakableText text={word.definition} skipWord={word.word} progress={activeSpeakKey === 'definition' ? speakProgress : null} spokenOffset={1} />
              </p>
            </div>

            {word.example_sentence && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Example Sentence</h3>
                  <SpeakButton text={word.example_sentence} onProgress={handleProgress('example')} />
                </div>
                <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.6, color: 'var(--text-light)' }}>
                  &ldquo;<SpeakableText text={word.example_sentence} skipWord={word.word} progress={activeSpeakKey === 'example' ? speakProgress : null} />&rdquo;
                </p>
              </div>
            )}

            {word.teacher_tip && (
              <div className="card" style={{ marginBottom: 16, background: 'var(--cream)', borderLeft: '4px solid var(--orange)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--orange)', fontWeight: 700 }}>Teacher's Tip</h3>
                  <SpeakButton text={word.teacher_tip} onProgress={handleProgress('tip')} />
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.6 }}>
                  <SpeakableText text={word.teacher_tip} skipWord={word.word} progress={activeSpeakKey === 'tip' ? speakProgress : null} />
                </p>
              </div>
            )}

            {navigatingWord && (
              <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '1.5rem', background: 'var(--cream, #f9f6f0)' }}>
                <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  Loading <strong>{navigatingWord}</strong>...
                  <br/><span style={{ fontSize: 12 }}>Creating word page if it doesn't exist yet</span>
                </p>
              </div>
            )}

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Synonyms (similar words)</h3>
              <div className="tag-list">
                {(word.synonyms || []).map((syn, idx) => (
                  <span key={idx} className={`synonym-tag${navigatingWord === syn ? ' loading-tag' : ''}`} onClick={() => !navigatingWord && handleSynonymClick(syn)} style={navigatingWord ? {opacity: 0.5, cursor: 'wait'} : {}}>{syn}</span>
                ))}
              </div>
              <AddRelatedWord wordId={word.id} type="synonym" onAdded={(w) => setWord(prev => ({ ...prev, synonyms: [...(prev.synonyms || []), w] }))} />
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Antonyms (opposite words)</h3>
              <div className="tag-list">
                {(word.antonyms || []).map((ant, idx) => (
                  <span key={idx} className={`antonym-tag${navigatingWord === ant ? ' loading-tag' : ''}`} onClick={() => !navigatingWord && handleSynonymClick(ant)} style={navigatingWord ? {opacity: 0.5, cursor: 'wait'} : {}}>{ant}</span>
                ))}
              </div>
              <AddRelatedWord wordId={word.id} type="antonym" onAdded={(w) => setWord(prev => ({ ...prev, antonyms: [...(prev.antonyms || []), w] }))} />
            </div>

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
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 0, marginTop: -4 }}>
                    Hover over underlined words to see their meaning
                  </p>
                  {quotes.map((q, idx) => {
                    const quoteKey = `quote_${idx}`;
                    return (
                      <div key={idx} style={{
                        padding: '12px 16px',
                        background: 'var(--cream)',
                        borderRadius: 10,
                        borderLeft: '3px solid var(--purple)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <p style={{ fontSize: 14, lineHeight: 1.8, fontStyle: 'italic', marginBottom: 6, flex: 1 }}>
                            &ldquo;<SpeakableText
                              text={q.quote}
                              skipWord={word.word}
                              progress={activeSpeakKey === quoteKey ? speakProgress : null}
                              showTooltips={true}
                              onSaveWord={handleSaveWord}
                            />&rdquo;
                          </p>
                          <SpeakButton text={q.quote} onProgress={handleProgress(quoteKey)} />
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                          &mdash; {q.book} by {q.author}
                        </p>
                      </div>
                    );
                  })}
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
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', background: 'var(--cream)', borderRadius: 8, marginBottom: 12 }}>
                    <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                    <p style={{ fontSize: 13 }}>{imageGenProgress || 'Generating illustrations...'}</p>
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
                      {anchor.image_url && !imageFailed[idx] ? (
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
                      ) : (
                        <div
                          style={{ width: '100%', height: 160, background: 'var(--cream-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const container = e.currentTarget;
                            const statusEl = container.querySelector('.gen-status');
                            if (statusEl) { statusEl.textContent = 'Generating...'; statusEl.style.color = 'var(--text-muted)'; }
                            try {
                              const data = await apiFetch(`/words/${word.id}/generate-single-anchor`, { method: 'POST', body: { anchorIndex: idx } });
                              if (data.image_url) {
                                setAnchors(prev => {
                                  const updated = [...prev];
                                  updated[idx] = { ...updated[idx], image_url: data.image_url };
                                  return updated;
                                });
                                setImageFailed(prev => ({ ...prev, [idx]: false }));
                                setImageLoaded(prev => ({ ...prev, [idx]: false }));
                              }
                            } catch (err) {
                              if (statusEl) { statusEl.textContent = (err.message || 'Failed') + ' — tap to retry'; statusEl.style.color = 'var(--red, #ef4444)'; }
                            }
                          }}
                        >
                          <span style={{ fontSize: 36 }}>{anchor.emoji}</span>
                          <span className="gen-status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>🎨 Tap to generate image</span>
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
                        <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}><LinkedText text={anchor.scene} skipWord={word.word} /></span>
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
      )}

      {/* Exercises Tab */}
      {activeTab === 'exercises' && (
        <div style={{ maxWidth: 640 }}>
          <SentenceExercise word={word} />
        </div>
      )}
    </div>
  );
}

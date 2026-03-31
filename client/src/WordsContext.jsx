import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from './api.js';
import { useAuth } from './AuthContext.jsx';

const WordsContext = createContext(null);

export function WordsProvider({ children, onNavigate }) {
  const { user } = useAuth();
  const [wordsList, setWordsList] = useState([]);

  useEffect(() => {
    if (!user) return;
    apiFetch('/words?limit=1000')
      .then(data => setWordsList(data.words || data || []))
      .catch(() => {});
  }, [user]);

  // Build a map: lowercase word -> { id, word }
  const wordMap = useMemo(() => {
    const map = new Map();
    for (const w of wordsList) {
      map.set(w.word.toLowerCase(), { id: w.id, word: w.word, definition: w.definition });
    }
    return map;
  }, [wordsList]);

  // Build regex that matches any word (longest first to avoid partial matches)
  const wordRegex = useMemo(() => {
    if (wordMap.size === 0) return null;
    const words = Array.from(wordMap.keys()).sort((a, b) => b.length - a.length);
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }, [wordMap]);

  const value = useMemo(() => ({
    wordMap,
    wordRegex,
    onNavigate,
  }), [wordMap, wordRegex, onNavigate]);

  return (
    <WordsContext.Provider value={value}>
      {children}
    </WordsContext.Provider>
  );
}

export function useWords() {
  return useContext(WordsContext);
}

/**
 * LinkedText - renders text with vocabulary words as clickable underlined links.
 * Props:
 *   text: string to render
 *   style: optional style for wrapper span
 *   skipWord: optional word to NOT link (e.g. the current word's own page)
 */
export function LinkedText({ text, style, skipWord }) {
  const ctx = useWords();

  if (!ctx || !ctx.wordRegex || !text) {
    return <span style={style}>{text}</span>;
  }

  const { wordMap, wordRegex, onNavigate } = ctx;
  const skipLower = skipWord?.toLowerCase();

  // Split text by word matches
  const parts = [];
  let lastIndex = 0;
  const regex = new RegExp(wordRegex.source, 'gi'); // fresh regex for each render

  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchedWord = match[0];
    const lower = matchedWord.toLowerCase();

    // Skip linking the word if it's the current page's word
    if (skipLower && lower === skipLower) continue;

    const entry = wordMap.get(lower);
    if (!entry) continue;

    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add linked word
    const wordId = entry.id;
    parts.push(
      <a
        key={`${match.index}-${lower}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigate('word', wordId); }}
        style={{
          textDecoration: 'underline',
          textDecorationColor: 'var(--green, #6b9e7a)',
          textUnderlineOffset: 2,
          color: 'inherit',
          cursor: 'pointer',
          textDecorationThickness: 2,
        }}
        title={`Go to "${entry.word}"`}
      >
        {matchedWord}
      </a>
    );

    lastIndex = match.index + matchedWord.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) {
    return <span style={style}>{text}</span>;
  }

  return <span style={style}>{parts}</span>;
}

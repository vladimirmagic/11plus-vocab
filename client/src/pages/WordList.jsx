import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { LinkedText } from '../WordsContext.jsx';

export default function WordList({ onNavigate, initialSearch }) {
  const { user } = useAuth();
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState(initialSearch || '');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({});

  const fetchWords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/words?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
      setWords(data.words || data);
    } catch (err) {
      console.error('Failed to fetch words:', err);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  useEffect(() => {
    apiFetch('/words/categories')
      .then(data => setCategories(data.categories || data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setProgress({}); return; }
    apiFetch('/progress')
      .then(data => {
        const map = {};
        const items = data.progress || data;
        if (Array.isArray(items)) items.forEach(p => { map[p.word_id] = p.status; });
        setProgress(map);
      })
      .catch(() => {});
  }, [user]);

  function truncate(str, len = 80) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function getStatusBadge(wordId) {
    const status = progress[wordId];
    if (!status || status === 'new') return <span className="badge badge-new">New</span>;
    if (status === 'learning') return <span className="badge badge-learning">Learning</span>;
    if (status === 'mastered') return <span className="badge badge-mastered">Mastered</span>;
    return null;
  }

  return (
    <div className="word-list-page">
      <div className="page-header">
        <h2>Word Library</h2>
        <p>{words.length} words available</p>
      </div>

      <div className="search-bar">
        <span className="search-icon">&#128269;</span>
        <input
          type="text"
          placeholder="Search words..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="category-pills">
        <button className={`category-pill${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.category || cat}
            className={`category-pill${category === (cat.category || cat) ? ' active' : ''}`}
            onClick={() => setCategory(cat.category || cat)}
          >
            {cat.category || cat} {cat.count ? `(${cat.count})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div>Loading words...</div>
      ) : words.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No words found</h3>
          <p>Try a different search or category</p>
        </div>
      ) : (
        <div className="word-grid">
          {words.map(word => (
            <div
              key={word.id}
              className="card"
              onClick={() => onNavigate('word', word.id)}
            >
              <div className="card-emoji">{word.visual_emoji}</div>
              <div className="card-word">{word.word}</div>
              <div className="card-definition"><LinkedText text={truncate(word.definition)} skipWord={word.word} /></div>
              <div className="card-footer">
                <span className="card-category">{word.category}</span>
                {getStatusBadge(word.id)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

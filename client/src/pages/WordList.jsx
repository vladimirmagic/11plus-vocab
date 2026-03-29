import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function WordList() {
  const { user } = useAuth();
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWord, setSelectedWord] = useState(null);
  const [progress, setProgress] = useState({});
  const [favoriteAnchors, setFavoriteAnchors] = useState({});

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

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  useEffect(() => {
    apiFetch('/words/categories')
      .then(data => setCategories(data.categories || data))
      .catch(err => console.error('Failed to fetch categories:', err));
  }, []);

  useEffect(() => {
    if (!user) { setProgress({}); return; }
    apiFetch('/progress')
      .then(data => {
        const map = {};
        const items = data.progress || data;
        if (Array.isArray(items)) {
          items.forEach(p => { map[p.word_id] = p.status; });
        }
        setProgress(map);
      })
      .catch(err => console.error('Failed to fetch progress:', err));
  }, [user]);

  function truncate(str, len = 80) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function getStatusBadge(wordId) {
    const status = progress[wordId];
    if (!status || status === 'new') return <span className="badge-new">New</span>;
    if (status === 'learning') return <span className="badge-learning">Learning</span>;
    if (status === 'mastered') return <span className="badge-mastered">Mastered</span>;
    return null;
  }

  async function updateProgress(wordId, status) {
    if (!user) return;
    try {
      await apiFetch('/progress', {
        method: 'POST',
        body: { word_id: wordId, status },
      });
      setProgress(prev => ({ ...prev, [wordId]: status }));
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  }

  function navigateToWord(wordText) {
    setSelectedWord(null);
    setSearch(wordText);
    setCategory('');
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      setSelectedWord(null);
    }
  }

  return (
    <div className="word-list-page">
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
        <button
          className={`category-pill${category === '' ? ' active' : ''}`}
          onClick={() => setCategory('')}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-pill${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading words...</p>
      ) : words.length === 0 ? (
        <p>No words found.</p>
      ) : (
        <div className="word-grid">
          {words.map(word => (
            <div
              key={word.id}
              className="card"
              onClick={() => setSelectedWord(word)}
            >
              <div className="card-emoji">{word.visual_emoji}</div>
              <div className="card-word">{word.word}</div>
              <div className="card-definition">{truncate(word.definition)}</div>
              <div className="card-footer">
                <span className="card-category">{word.category}</span>
                {getStatusBadge(word.id)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWord && (
        <div className="modal-overlay" onClick={handleOverlayClick}>
          <div className="modal">
            <button className="modal-close" onClick={() => setSelectedWord(null)}>&times;</button>

            <div className="word-detail-emoji">{selectedWord.visual_emoji}</div>
            <h2 className="word-detail-word">{selectedWord.word}</h2>
            <span className="word-detail-category">{selectedWord.category}</span>

            <div className="word-detail-section">
              <h3>Definition</h3>
              <p>{selectedWord.definition}</p>
            </div>

            {selectedWord.example_sentence && (
              <div className="word-detail-section">
                <h3>Example Sentence</h3>
                <p><em>{selectedWord.example_sentence}</em></p>
              </div>
            )}

            {selectedWord.teachers_tip && (
              <div className="word-detail-section teachers-tip">
                <h3>Teacher's Tip</h3>
                <p>{selectedWord.teachers_tip}</p>
              </div>
            )}

            {selectedWord.visual_anchors && selectedWord.visual_anchors.length > 0 && (
              <div className="word-detail-section">
                <h3>Visual Anchors</h3>
                <div className="visual-anchors">
                  {selectedWord.visual_anchors.map((anchor, idx) => (
                    <div
                      key={idx}
                      className={`anchor-card${favoriteAnchors[selectedWord.id] === idx ? ' selected' : ''}`}
                      onClick={() => setFavoriteAnchors(prev => ({ ...prev, [selectedWord.id]: idx }))}
                    >
                      <span className="anchor-emoji">{anchor.emoji}</span>
                      <span className="anchor-scene">{anchor.scene}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedWord.synonyms && selectedWord.synonyms.length > 0 && (
              <div className="word-detail-section">
                <h3>Synonyms</h3>
                <div className="tag-list">
                  {selectedWord.synonyms.map((syn, idx) => (
                    <span
                      key={idx}
                      className="synonym-tag"
                      onClick={() => navigateToWord(syn)}
                    >
                      {syn}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedWord.antonyms && selectedWord.antonyms.length > 0 && (
              <div className="word-detail-section">
                <h3>Antonyms</h3>
                <div className="tag-list">
                  {selectedWord.antonyms.map((ant, idx) => (
                    <span
                      key={idx}
                      className="antonym-tag"
                      onClick={() => navigateToWord(ant)}
                    >
                      {ant}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {user && (
              <div className="word-detail-section progress-buttons">
                <h3>Progress</h3>
                <button
                  className={`btn-secondary${progress[selectedWord.id] === 'new' || !progress[selectedWord.id] ? ' active' : ''}`}
                  onClick={() => updateProgress(selectedWord.id, 'new')}
                >
                  New
                </button>
                <button
                  className={`btn-secondary${progress[selectedWord.id] === 'learning' ? ' active' : ''}`}
                  onClick={() => updateProgress(selectedWord.id, 'learning')}
                >
                  Learning
                </button>
                <button
                  className={`btn-primary${progress[selectedWord.id] === 'mastered' ? ' active' : ''}`}
                  onClick={() => updateProgress(selectedWord.id, 'mastered')}
                >
                  Mastered
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

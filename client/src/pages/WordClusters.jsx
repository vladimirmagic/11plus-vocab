import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { LinkedText } from '../WordsContext.jsx';

export default function WordClusters() {
  const [words, setWords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/words?limit=200')
      .then(data => setWords(data.words || data))
      .catch(() => {});
  }, []);

  const loadCluster = useCallback(async (id) => {
    setSelectedId(id);
    setLoading(true);
    try {
      const data = await apiFetch(`/words/${id}/clusters`);
      setCluster(data);
    } catch {
      setCluster(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNodeClick = (word) => {
    const match = words.find(w => w.word === word || w.id === word);
    if (match) {
      loadCluster(match.id);
      setSearch(match.word);
    }
  };

  const filteredWords = words.filter(w =>
    w.word.toLowerCase().includes(search.toLowerCase())
  );

  const centerX = 300;
  const centerY = 200;
  const radius = 150;

  const arrangeSemicircle = (items, above) => {
    const count = items.length;
    if (count === 0) return [];
    const startAngle = above ? Math.PI : 0;
    const endAngle = above ? 2 * Math.PI : Math.PI;
    return items.map((item, i) => {
      const angle = startAngle + ((endAngle - startAngle) * (i + 1)) / (count + 1);
      return {
        ...item,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
  };

  const synonymNodes = cluster ? arrangeSemicircle(cluster.synonyms || [], true) : [];
  const antonymNodes = cluster ? arrangeSemicircle(cluster.antonyms || [], false) : [];

  return (
    <div className="cluster-container">
      <h1>Word Clusters</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="word-search" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
          Search and select a word
        </label>
        <input
          id="word-search"
          type="text"
          placeholder="Type to search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        {search && !selectedId && (
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
            {filteredWords.map(w => (
              <button
                key={w.id}
                className="btn-primary"
                style={{ display: 'block', width: '100%', textAlign: 'left', margin: '2px 0' }}
                onClick={() => { loadCluster(w.id); setSearch(w.word); }}
              >
                {w.visual_emoji || ''} {w.word}
              </button>
            ))}
          </div>
        )}
        {selectedId && (
          <button
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => { setSelectedId(null); setCluster(null); setSearch(''); }}
          >
            Clear selection
          </button>
        )}
      </div>

      {loading && <p>Loading cluster...</p>}

      {!selectedId && !loading && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h2>Discover Word Connections</h2>
          <p>Select a word above to explore its synonyms and antonyms in a visual cluster. You will see how words relate to each other!</p>
        </div>
      )}

      {cluster && cluster.center && (
        <>
          <div className="card">
            <svg viewBox="0 0 600 400" style={{ width: '100%', height: 'auto', maxHeight: '500px' }}>
              {/* Synonym lines */}
              {synonymNodes.map((node, i) => (
                <line
                  key={`syn-line-${i}`}
                  x1={centerX}
                  y1={centerY}
                  x2={node.x}
                  y2={node.y}
                  stroke="#4caf50"
                  strokeWidth="2"
                  opacity="0.5"
                />
              ))}

              {/* Antonym lines */}
              {antonymNodes.map((node, i) => (
                <line
                  key={`ant-line-${i}`}
                  x1={centerX}
                  y1={centerY}
                  x2={node.x}
                  y2={node.y}
                  stroke="#f44336"
                  strokeWidth="2"
                  opacity="0.5"
                />
              ))}

              {/* Synonym nodes */}
              {synonymNodes.map((node, i) => (
                <g
                  key={`syn-${i}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleNodeClick(node.word)}
                >
                  <circle cx={node.x} cy={node.y} r="35" fill="#c8e6c9" stroke="#4caf50" strokeWidth="2" />
                  <text x={node.x} y={node.y - 8} textAnchor="middle" fontSize="14">
                    {node.visual_emoji || ''}
                  </text>
                  <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="11" fill="#2e7d32" fontWeight="600">
                    {node.word}
                  </text>
                </g>
              ))}

              {/* Antonym nodes */}
              {antonymNodes.map((node, i) => (
                <g
                  key={`ant-${i}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleNodeClick(node.word)}
                >
                  <circle cx={node.x} cy={node.y} r="35" fill="#ffcdd2" stroke="#f44336" strokeWidth="2" />
                  <text x={node.x} y={node.y - 8} textAnchor="middle" fontSize="14">
                    {node.visual_emoji || ''}
                  </text>
                  <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="11" fill="#c62828" fontWeight="600">
                    {node.word}
                  </text>
                </g>
              ))}

              {/* Center node */}
              <g>
                <circle cx={centerX} cy={centerY} r="45" fill="#4caf50" stroke="#2e7d32" strokeWidth="3" />
                <text x={centerX} y={centerY - 10} textAnchor="middle" fontSize="16" fill="white">
                  {cluster.center.visual_emoji || ''}
                </text>
                <text x={centerX} y={centerY + 12} textAnchor="middle" fontSize="13" fill="white" fontWeight="700">
                  {cluster.center.word}
                </text>
              </g>
            </svg>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', margin: '1rem 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
              Synonyms
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#f44336', display: 'inline-block' }} />
              Antonyms
            </span>
          </div>

          {/* Definition */}
          {cluster.center.definition && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>{cluster.center.visual_emoji} {cluster.center.word}</h3>
              <p><LinkedText text={cluster.center.definition} skipWord={cluster.center.word} /></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

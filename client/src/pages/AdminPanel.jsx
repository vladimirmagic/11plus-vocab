import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const CATEGORIES = ['adjectives', 'verbs', 'nouns', 'adverbs', 'emotions', 'character', 'academic', 'nature', 'relationships'];

const emptyForm = {
  word: '',
  definition: '',
  example_sentence: '',
  teacher_tip: '',
  category: 'adjective',
  difficulty: 1,
  visual_emoji: '',
  synonyms: '',
  antonyms: '',
};

export default function AdminPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extractedWords, setExtractedWords] = useState([]);
  const fileInputRef = useRef(null);

  // Pending state
  const [pendingWords, setPendingWords] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Add word state
  const [form, setForm] = useState({ ...emptyForm });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user || user.role !== 'admin') {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔒</div>
        <h2>Admin access required</h2>
        <p>You need administrator privileges to access this panel.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'upload', label: 'Upload Document' },
    { key: 'pending', label: 'Pending Words' },
    { key: 'add', label: 'Add Word' },
  ];

  // Upload handlers
  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file && (file.name.endsWith('.pdf') || file.name.endsWith('.txt'))) {
      setUploadFile(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const data = await apiFetch('/admin/upload', { method: 'POST', body: formData });
      setExtractedWords(data.words || []);
      setUploadFile(null);
    } catch {
      // error handled silently
    } finally {
      setUploading(false);
    }
  };

  const approveExtracted = (word) => {
    setExtractedWords(prev => prev.filter(w => w !== word));
  };

  const rejectExtracted = (word) => {
    setExtractedWords(prev => prev.filter(w => w !== word));
  };

  // Pending handlers
  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const data = await apiFetch('/admin/pending');
      setPendingWords(data.words || data || []);
    } catch {
      setPendingWords([]);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'pending') loadPending();
  }, [activeTab]);

  const approveWord = async (id) => {
    try {
      await apiFetch(`/admin/approve/${id}`, { method: 'POST' });
      setPendingWords(prev => prev.filter(w => w.id !== id));
    } catch {
      // error handled silently
    }
  };

  const deleteWord = async (id) => {
    try {
      await apiFetch(`/admin/words/${id}`, { method: 'DELETE' });
      setPendingWords(prev => prev.filter(w => w.id !== id));
    } catch {
      // error handled silently
    }
  };

  // Add word handlers
  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const generateWithAI = async () => {
    if (!form.word.trim()) return;
    setGenerating(true);
    try {
      const data = await apiFetch('/admin/generate', {
        method: 'POST',
        body: { word: form.word.trim() },
      });
      setForm({
        word: data.word || form.word,
        definition: data.definition || '',
        example_sentence: data.example_sentence || '',
        teacher_tip: data.teacher_tip || '',
        category: data.category || 'adjective',
        difficulty: data.difficulty || 1,
        visual_emoji: data.visual_emoji || '',
        synonyms: Array.isArray(data.synonyms) ? data.synonyms.join(', ') : (data.synonyms || ''),
        antonyms: Array.isArray(data.antonyms) ? data.antonyms.join(', ') : (data.antonyms || ''),
      });
    } catch {
      // error handled silently
    } finally {
      setGenerating(false);
    }
  };

  const saveWord = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        difficulty: Number(form.difficulty),
        synonyms: form.synonyms.split(',').map(s => s.trim()).filter(Boolean),
        antonyms: form.antonyms.split(',').map(s => s.trim()).filter(Boolean),
      };
      await apiFetch('/admin/words', { method: 'POST', body: payload });
      setForm({ ...emptyForm });
    } catch {
      // error handled silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cluster-container">
      <h1>Admin Panel</h1>

      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="card">
          <h2>Upload Document</h2>
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <div className="upload-icon">📄</div>
            <p>{uploadFile ? uploadFile.name : 'Click or drop a .pdf or .txt file here'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              style={{ display: 'none' }}
              onChange={handleFileDrop}
            />
          </div>
          {uploadFile && (
            <button className="btn-primary" onClick={handleUpload} disabled={uploading} style={{ marginTop: '1rem' }}>
              {uploading ? 'Extracting words...' : 'Upload & Extract'}
            </button>
          )}
          {uploading && (
            <div className="loading">
              <div className="spinner" />
              <p>AI is extracting vocabulary from your document...</p>
            </div>
          )}
          {extractedWords.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Extracted Words</h3>
              {extractedWords.map((w, i) => (
                <div key={i} className="pending-word">
                  <div className="word-info">
                    <span className="word-title">{typeof w === 'string' ? w : w.word}</span>
                  </div>
                  <div className="actions">
                    <button className="btn-primary" onClick={() => approveExtracted(w)}>Approve</button>
                    <button className="btn-danger" onClick={() => rejectExtracted(w)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div className="card">
          <h2>Pending Words</h2>
          {pendingLoading && (
            <div className="loading">
              <div className="spinner" />
            </div>
          )}
          {!pendingLoading && pendingWords.length === 0 && (
            <p>No pending words to review.</p>
          )}
          {pendingWords.map(w => (
            <div key={w.id} className="pending-word">
              <div className="word-info">
                <span className="word-title">{w.visual_emoji} {w.word}</span>
                <span className="word-def">{w.definition}</span>
              </div>
              <div className="actions">
                <button className="btn-primary" onClick={() => approveWord(w.id)}>Approve</button>
                <button className="btn-danger" onClick={() => deleteWord(w.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Word Tab */}
      {activeTab === 'add' && (
        <div className="card">
          <h2>Add New Word</h2>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Enter a word"
              value={form.word}
              onChange={e => updateForm('word', e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
            />
            <button className="btn-orange" onClick={generateWithAI} disabled={generating || !form.word.trim()}>
              {generating ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          {generating && (
            <div className="loading">
              <div className="spinner" />
              <p>AI is generating word details...</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label>
              Definition
              <textarea
                value={form.definition}
                onChange={e => updateForm('definition', e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>

            <label>
              Example Sentence
              <textarea
                value={form.example_sentence}
                onChange={e => updateForm('example_sentence', e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>

            <label>
              Teacher Tip
              <textarea
                value={form.teacher_tip}
                onChange={e => updateForm('teacher_tip', e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ flex: 1 }}>
                Category
                <select
                  value={form.category}
                  onChange={e => updateForm('category', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label style={{ flex: 1 }}>
                Difficulty (1-3)
                <select
                  value={form.difficulty}
                  onChange={e => updateForm('difficulty', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  <option value={1}>1 - Easy</option>
                  <option value={2}>2 - Medium</option>
                  <option value={3}>3 - Hard</option>
                </select>
              </label>

              <label style={{ flex: 1 }}>
                Emoji
                <input
                  type="text"
                  value={form.visual_emoji}
                  onChange={e => updateForm('visual_emoji', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </label>
            </div>

            <label>
              Synonyms (comma-separated)
              <input
                type="text"
                value={form.synonyms}
                onChange={e => updateForm('synonyms', e.target.value)}
                placeholder="e.g. happy, joyful, cheerful"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>

            <label>
              Antonyms (comma-separated)
              <input
                type="text"
                value={form.antonyms}
                onChange={e => updateForm('antonyms', e.target.value)}
                placeholder="e.g. sad, gloomy, miserable"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>
          </div>

          <button
            className="btn-primary"
            onClick={saveWord}
            disabled={saving || !form.word.trim() || !form.definition.trim()}
            style={{ marginTop: '1rem' }}
          >
            {saving ? 'Saving...' : 'Save Word'}
          </button>
        </div>
      )}
    </div>
  );
}

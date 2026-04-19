import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Calendar from './Calendar.jsx';

const PROMPT_LABELS = {
  freewrite_evaluate: 'Free Write — Sentence Evaluation',
  validate_sentence: 'Text/Picture Prompt — Sentence Validation',
  text_prompt: 'Text Prompt — Scenario Generation',
  generate_word: 'Word Generation — New Word Content',
};

function PromptsEditor() {
  const [prompts, setPrompts] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editKey, setEditKey] = useState(null);

  useEffect(() => {
    apiFetch('/prompts').then(setPrompts).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/prompts', { method: 'PUT', body: prompts });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  async function handleReset() {
    if (!confirm('Reset all prompts to defaults?')) return;
    try {
      const data = await apiFetch('/prompts/reset', { method: 'POST' });
      setPrompts(data);
    } catch {}
  }

  if (!prompts) return <div className="loading"><div className="spinner"></div>Loading prompts...</div>;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Edit the AI prompts used throughout the app. Use <code style={{ background: 'var(--cream-dark)', padding: '1px 4px', borderRadius: 3 }}>{'{{word}}'}</code>, <code style={{ background: 'var(--cream-dark)', padding: '1px 4px', borderRadius: 3 }}>{'{{definition}}'}</code>, <code style={{ background: 'var(--cream-dark)', padding: '1px 4px', borderRadius: 3 }}>{'{{sentence}}'}</code> as placeholders.
      </p>
      {Object.entries(PROMPT_LABELS).map(([key, label]) => (
        <div key={key} style={{ marginBottom: 16, border: '1px solid var(--cream-dark)', borderRadius: 10, overflow: 'hidden' }}>
          <div
            onClick={() => setEditKey(editKey === key ? null : key)}
            style={{ padding: '10px 16px', background: 'var(--cream)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <strong style={{ fontSize: 14 }}>{label}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{editKey === key ? '▲ collapse' : '▼ expand'}</span>
          </div>
          {editKey === key && (
            <div style={{ padding: 12 }}>
              <textarea
                value={prompts[key] || ''}
                onChange={e => setPrompts({ ...prompts, [key]: e.target.value })}
                rows={12}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid var(--cream-dark)', borderRadius: 6, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Prompts'}
        </button>
        <button className="btn-secondary" onClick={handleReset}>Reset to Defaults</button>
      </div>
    </div>
  );
}

const PREVIEW_PHRASES = [
  "The curious cat explored the mysterious garden.",
  "Brilliant sunshine poured through the classroom window.",
  "She persevered through the challenging vocabulary test.",
  "The magnificent castle stood on top of the hill.",
  "His eloquent speech inspired everyone in the room.",
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(user?.voice_preference || 'en-GB-Wavenet-B');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState('all');
  const audioRef = useRef(null);

  useEffect(() => {
    apiFetch('/tts/voices')
      .then(data => setVoices(data.voices || []))
      .catch(err => console.error('Failed to fetch voices:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.voice_preference) setSelectedVoice(user.voice_preference);
  }, [user]);

  async function playPreview(voiceName) {
    if (playingVoice === voiceName) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingVoice(voiceName);

    try {
      const phrase = PREVIEW_PHRASES[Math.floor(Math.random() * PREVIEW_PHRASES.length)];
      const res = await apiFetch('/tts', { method: 'POST', body: { text: phrase, voice: voiceName } });
      if (!res.audio) throw new Error('No audio');

      const audio = new Audio('data:audio/mp3;base64,' + res.audio);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingVoice(null); audioRef.current = null; };
      await audio.play();
    } catch {
      setPlayingVoice(null);
    }
  }

  async function saveVoice(voiceName) {
    setSelectedVoice(voiceName);
    setSaved(false);
    try {
      await apiFetch('/auth/voice', { method: 'PUT', body: { voice: voiceName } });
      // Update user context so all components get the new voice immediately
      updateUser({ voice_preference: voiceName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save voice:', err);
    }
  }

  const qualities = ['all', ...new Set(voices.map(v => v.quality))];
  const filtered = filter === 'all' ? voices : voices.filter(v => v.quality === filter);

  const genderIcon = (g) => g === 'MALE' ? '👨' : '👩';

  const [settingsTab, setSettingsTab] = useState('voice');

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading settings...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="category-pills" style={{ marginBottom: 20 }}>
        <button className={`category-pill${settingsTab === 'voice' ? ' active' : ''}`} onClick={() => setSettingsTab('voice')}>🔊 Voice</button>
        <button className={`category-pill${settingsTab === 'calendar' ? ' active' : ''}`} onClick={() => setSettingsTab('calendar')}>📅 Calendar</button>
        <button className={`category-pill${settingsTab === 'prompts' ? ' active' : ''}`} onClick={() => setSettingsTab('prompts')}>💬 Prompts</button>
      </div>

      {settingsTab === 'calendar' && <Calendar />}

      {settingsTab === 'prompts' && <PromptsEditor />}

      {settingsTab === 'voice' && (<div>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Voice Selection</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose the British English voice for reading words and sentences</p>
      </div>

      {saved && (
        <div style={{ background: '#E8F5EC', color: 'var(--green-dark)', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
          Voice saved!
        </div>
      )}

      <div className="category-pills" style={{ marginBottom: 16 }}>
        {qualities.map(q => (
          <button
            key={q}
            className={`category-pill${filter === q ? ' active' : ''}`}
            onClick={() => setFilter(q)}
          >
            {q === 'all' ? `All (${voices.length})` : `${q} (${voices.filter(v => v.quality === q).length})`}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {filtered.map(v => (
          <div
            key={v.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              borderRadius: 12,
              border: selectedVoice === v.name ? '2px solid var(--green)' : '2px solid var(--cream-dark)',
              background: selectedVoice === v.name ? '#E8F5EC' : 'var(--white)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedVoice === v.name ? '0 2px 8px rgba(107,158,122,0.2)' : 'var(--shadow)',
            }}
            onClick={() => saveVoice(v.name)}
          >
            {/* Avatar */}
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'var(--cream-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}>
              <img
                src={v.avatarUrl}
                alt={v.displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = genderIcon(v.gender); }}
              />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {v.displayName}
                {selectedVoice === v.name && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--green)' }}>✓ Selected</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {v.gender === 'MALE' ? 'Male' : 'Female'} · {v.quality}
              </div>
            </div>

            {/* Play button */}
            <button
              onClick={(e) => { e.stopPropagation(); playPreview(v.name); }}
              style={{
                background: playingVoice === v.name ? 'var(--red)' : 'var(--green)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                fontSize: 16,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {playingVoice === v.name ? '⏹' : '▶'}
            </button>
          </div>
        ))}
      </div>
      </div>)}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const PREVIEW_PHRASES = [
  "The curious cat explored the mysterious garden.",
  "Brilliant sunshine poured through the classroom window.",
  "She persevered through the challenging vocabulary test.",
  "The magnificent castle stood on top of the hill.",
  "His eloquent speech inspired everyone in the room.",
];

export default function Settings() {
  const { user } = useAuth();
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(user?.voice_preference || 'en-GB-Wavenet-B');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/auth/voice', { method: 'PUT', body: { voice: voiceName } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save voice:', err);
    } finally {
      setSaving(false);
    }
  }

  const types = ['all', ...new Set(voices.map(v => v.type))];
  const filtered = filter === 'all' ? voices : voices.filter(v => v.type === filter);

  const genderLabel = (g) => g === 'MALE' ? 'Male' : g === 'FEMALE' ? 'Female' : g;
  const langLabel = (l) => {
    const map = { 'en-GB': 'British', 'en-US': 'American', 'en-AU': 'Australian', 'en-IN': 'Indian' };
    return map[l] || l;
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading voices...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Choose the voice that reads words and sentences aloud</p>
      </div>

      {saved && (
        <div style={{ background: '#E8F5EC', color: 'var(--green-dark)', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
          Voice saved successfully!
        </div>
      )}

      <div className="category-pills" style={{ marginBottom: 16 }}>
        {types.map(t => (
          <button
            key={t}
            className={`category-pill${filter === t ? ' active' : ''}`}
            onClick={() => setFilter(t)}
          >
            {t === 'all' ? 'All voices' : t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map(v => (
          <div
            key={v.name}
            className="card"
            style={{
              padding: '14px 16px',
              border: selectedVoice === v.name ? '2px solid var(--green)' : '2px solid transparent',
              background: selectedVoice === v.name ? '#E8F5EC' : 'var(--white)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => saveVoice(v.name)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {langLabel(v.language)} {genderLabel(v.gender)}
                  {selectedVoice === v.name && <span style={{ marginLeft: 8, color: 'var(--green)' }}>Selected</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {v.name} &middot; {v.type}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); playPreview(v.name); }}
                style={{
                  background: playingVoice === v.name ? 'var(--red)' : 'var(--green)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 70,
                }}
              >
                {playingVoice === v.name ? 'Stop' : 'Play'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>No voices found</h3>
          <p>Try a different filter</p>
        </div>
      )}
    </div>
  );
}

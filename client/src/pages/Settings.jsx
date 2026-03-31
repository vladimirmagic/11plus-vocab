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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save voice:', err);
    }
  }

  const qualities = ['all', ...new Set(voices.map(v => v.quality))];
  const filtered = filter === 'all' ? voices : voices.filter(v => v.quality === filter);

  const genderIcon = (g) => g === 'MALE' ? '👨' : '👩';

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading voices...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Voice Settings</h2>
        <p>Choose the British English voice for reading words and sentences</p>
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
    </div>
  );
}

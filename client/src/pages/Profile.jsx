import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('');

  function handleKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const val = input.trim().replace(/,$/, '');
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
      }
      setInput('');
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function remove(idx) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px',
      border: '2px solid var(--cream-dark, #e0d5c1)', borderRadius: 10,
      background: 'var(--white, #fff)', minHeight: 44, alignItems: 'center',
    }}>
      {tags.map((tag, idx) => (
        <span key={idx} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
          background: 'var(--green, #6b9e7a)', color: 'white', borderRadius: 20,
          fontSize: 13, fontWeight: 600,
        }}>
          {tag}
          <button onClick={() => remove(idx)} style={{
            background: 'none', border: 'none', color: 'white', cursor: 'pointer',
            fontSize: 14, padding: 0, lineHeight: 1, opacity: 0.8,
          }}>x</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{
          border: 'none', outline: 'none', flex: 1, minWidth: 120,
          fontSize: 14, fontFamily: 'inherit', background: 'transparent',
        }}
      />
    </div>
  );
}

function ItemCards({ items, onChange, placeholder, label }) {
  const [input, setInput] = useState('');

  function addItem() {
    const val = input.trim();
    if (!val) return;
    if (!items.find(i => i.title.toLowerCase() === val.toLowerCase())) {
      onChange([...items, { title: val, favourite: false }]);
    }
    setInput('');
  }

  function toggleFavourite(idx) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], favourite: !updated[idx].favourite };
    onChange(updated);
  }

  function removeItem(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '10px 14px', border: '2px solid var(--cream-dark, #e0d5c1)',
            borderRadius: 10, fontSize: 14, fontFamily: 'inherit',
          }}
        />
        <button onClick={addItem} className="btn-primary" style={{ padding: '10px 16px', fontSize: 13 }}>
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              background: item.favourite ? '#FFF8E1' : 'var(--cream, #f5f0e8)',
              border: item.favourite ? '2px solid var(--orange, #e8a54b)' : '2px solid var(--cream-dark, #e0d5c1)',
              borderRadius: 10, fontSize: 14,
            }}>
              <button
                onClick={() => toggleFavourite(idx)}
                title={item.favourite ? 'Remove from favourites' : 'Mark as favourite'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0 }}
              >
                {item.favourite ? '⭐' : '☆'}
              </button>
              <span style={{ fontWeight: item.favourite ? 700 : 400 }}>{item.title}</span>
              <button
                onClick={() => removeItem(idx)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                  color: 'var(--text-muted)', padding: 0, lineHeight: 1,
                }}
              >x</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [yearOfBirth, setYearOfBirth] = useState(null);
  const [gender, setGender] = useState('');
  const [countries, setCountries] = useState([]);
  const [placesPeople, setPlacesPeople] = useState([]);
  const [aboutMe, setAboutMe] = useState('');
  const [books, setBooks] = useState([]);
  const [tvShows, setTvShows] = useState([]);
  const [youtubeInterests, setYoutubeInterests] = useState([]);

  useEffect(() => {
    apiFetch('/profile')
      .then(data => {
        if (data.profile) {
          const p = data.profile;
          if (p.year_of_birth) setYearOfBirth(p.year_of_birth);
          if (p.gender) setGender(p.gender);
          if (p.countries) setCountries(p.countries);
          if (p.places_people) setPlacesPeople(p.places_people);
          if (p.about_me) setAboutMe(p.about_me);
          if (p.books && Array.isArray(p.books)) setBooks(p.books);
          if (p.tv_shows && Array.isArray(p.tv_shows)) setTvShows(p.tv_shows);
          if (p.youtube_interests) setYoutubeInterests(p.youtube_interests);
        }
      })
      .catch(err => console.error('Failed to load profile:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: {
          year_of_birth: yearOfBirth,
          gender: gender || null,
          countries,
          places_people: placesPeople,
          about_me: aboutMe || null,
          books,
          tv_shows: tvShows,
          youtube_interests: youtubeInterests,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [yearOfBirth, gender, countries, placesPeople, aboutMe, books, tvShows, youtubeInterests]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div>Loading profile...</div>;
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear - 6; y >= currentYear - 14; y--) {
    yearOptions.push(y);
  }

  const sectionStyle = {
    marginBottom: 24,
  };
  const labelStyle = {
    display: 'block', fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
    color: 'var(--text-muted, #888)', marginBottom: 8, letterSpacing: 0.5,
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>My Profile</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Tell us about yourself so we can personalise your learning experience!
      </p>

      {/* About Me Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>🧒</span> About Me
        </h2>

        <div style={sectionStyle}>
          <label style={labelStyle}>Year of Birth</label>
          <select
            value={yearOfBirth || ''}
            onChange={e => setYearOfBirth(e.target.value ? parseInt(e.target.value) : null)}
            style={{
              padding: '10px 14px', border: '2px solid var(--cream-dark, #e0d5c1)',
              borderRadius: 10, fontSize: 14, fontFamily: 'inherit', width: '100%',
              background: 'var(--white, #fff)',
            }}
          >
            <option value="">Select year...</option>
            {yearOptions.map(y => (
              <option key={y} value={y}>{y} (age {currentYear - y})</option>
            ))}
          </select>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Gender</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Boy', 'Girl', 'Prefer not to say'].map(g => (
              <button
                key={g}
                onClick={() => setGender(g)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
                  border: '2px solid',
                  borderColor: gender === g ? 'var(--green, #6b9e7a)' : 'var(--cream-dark, #e0d5c1)',
                  background: gender === g ? 'var(--green, #6b9e7a)' : 'var(--white, #fff)',
                  color: gender === g ? 'white' : 'var(--text, #333)',
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Countries (where you live, where you're from, places you love)</label>
          <TagInput tags={countries} onChange={setCountries} placeholder="Type a country and press Enter..." />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Places & People You Love</label>
          <TagInput tags={placesPeople} onChange={setPlacesPeople} placeholder="e.g. London, Grandma, David Attenborough..." />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Tell us more about yourself</label>
          <textarea
            value={aboutMe}
            onChange={e => setAboutMe(e.target.value)}
            placeholder="What do you enjoy? What are your hobbies? What makes you excited to learn?"
            rows={3}
            style={{
              width: '100%', padding: '10px 14px', border: '2px solid var(--cream-dark, #e0d5c1)',
              borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </div>
      </div>

      {/* Books Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>📚</span> Books & Reading
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: 13 }}>
          Add books you've read or are reading. Star your favourites!
        </p>
        <ItemCards
          items={books}
          onChange={setBooks}
          placeholder="e.g. Harry Potter, Diary of a Wimpy Kid..."
          label="book"
        />
      </div>

      {/* TV & Film Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>📺</span> TV & Film
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: 13 }}>
          Add shows and films you watch. Star your favourites!
        </p>
        <ItemCards
          items={tvShows}
          onChange={setTvShows}
          placeholder="e.g. Horrible Histories, Bluey..."
          label="show"
        />
      </div>

      {/* YouTube Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>🎬</span> YouTube
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: 13 }}>
          What kind of YouTube videos do you enjoy? Add your favourite channels or topics.
        </p>
        <TagInput
          tags={youtubeInterests}
          onChange={setYoutubeInterests}
          placeholder="e.g. Minecraft, science experiments, art tutorials..."
        />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
          YouTube history connection coming soon!
        </p>
      </div>

      {/* Save Button */}
      <div style={{ position: 'sticky', bottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '14px 32px', fontSize: 16, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
        {saved && (
          <span style={{ color: 'var(--green, #6b9e7a)', fontWeight: 700, fontSize: 14 }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { WordsProvider } from './WordsContext.jsx';
import { useGamification } from './GamificationContext.jsx';
import CelebrationOverlay from './CelebrationOverlay.jsx';
import GrowthTree from './GrowthTree.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WordList from './pages/WordList.jsx';
import WordDetail from './pages/WordDetail.jsx';
import WordClusters from './pages/WordClusters.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import Settings from './pages/Settings.jsx';
import Calendar from './pages/Calendar.jsx';
import Profile from './pages/Profile.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import MatchingGame from './pages/MatchingGame.jsx';
import SentenceBuilder from './pages/SentenceBuilder.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'words', label: 'Word List', icon: '📚' },
  { id: 'clusters', label: 'Word Clusters', icon: '🕸️' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '🔧' },
];

const ADMIN_NAV = { id: 'admin', label: 'Admin Panel', icon: '⚙️' };

const isProduction = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);

function GoogleLoginButton({ clientId, onError }) {
  const { loginWithGoogle } = useAuth();
  const divRef = React.useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (document.getElementById('google-gsi-script')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => onError('Failed to load Google Sign-In');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !window.google || !divRef.current || !clientId) return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            await loginWithGoogle(response.credential);
          } catch (err) {
            onError(err.message);
          }
        },
      });
      window.google.accounts.id.renderButton(divRef.current, {
        theme: 'outline',
        size: 'large',
        width: 350,
        text: 'signin_with',
        shape: 'rectangular',
      });
    } catch (err) {
      onError('Failed to initialize Google Sign-In');
    }
  }, [scriptLoaded, clientId, loginWithGoogle, onError]);

  return <div ref={divRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}

function LoginScreen() {
  const { loginWithName } = useAuth();
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [googleClientId, setGoogleClientId] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(!isProduction);

  useEffect(() => {
    if (!isProduction) return;
    fetch('/api/auth/config')
      .then(r => r.json())
      .then(data => {
        if (data.googleClientId) setGoogleClientId(data.googleClientId);
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Please enter your name'); return; }
    setSending(true);
    setError('');
    try {
      await loginWithName(name.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const showGoogle = isProduction && googleClientId;

  return (
    <div className="login-screen">
      <h1>📝 11 Plus Vocab</h1>
      <p className="tagline">Master vocabulary for your 11 Plus exam with fun, interactive learning</p>
      <div className="features">
        <div className="feature-card">
          <div className="feature-icon">📚</div>
          <h3>Word Library</h3>
          <p>Explore hundreds of important vocabulary words with clear definitions</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎯</div>
          <h3>Matching Game</h3>
          <p>Test your knowledge by matching words to their meanings</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">✍️</div>
          <h3>Sentence Builder</h3>
          <p>Practice using words in sentences with AI feedback</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 400, width: '100%', marginTop: 8 }}>
        {!configLoaded ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        ) : showGoogle ? (
          <>
            <h3 style={{ marginBottom: 16, textAlign: 'center' }}>Sign in to start learning</h3>
            <GoogleLoginButton clientId={googleClientId} onError={setError} />
          </>
        ) : (
          <form onSubmit={handleLogin}>
            <h3 style={{ marginBottom: 12, textAlign: 'center' }}>What's your name?</h3>
            <input
              type="text"
              placeholder="Enter your first name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ marginBottom: 12 }}
              autoFocus
            />
            <button className="btn-primary" type="submit" disabled={sending} style={{ width: '100%' }}>
              {sending ? 'Signing in...' : 'Start Learning'}
            </button>
          </form>
        )}
        {error && <p style={{ color: 'var(--red)', marginTop: 8, textAlign: 'center', fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const { treeData, streak } = useGamification() || {};
  const [tab, setTab] = useState('dashboard');
  const [tabParam, setTabParam] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = useCallback((newTab, param) => {
    setTab(newTab);
    setTabParam(param || null);
    setSidebarOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const navItems = user.role === 'admin' ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;

  const renderPage = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'words': return <WordList onNavigate={handleNavigate} initialSearch={tabParam || ''} />;
      case 'word': return <WordDetail wordId={tabParam} onNavigate={handleNavigate} />;
      case 'calendar': return <Calendar onNavigate={handleNavigate} />;
      case 'leaderboard': return <Leaderboard />;
      case 'matching': return <MatchingGame />;
      case 'sentence': return <SentenceBuilder />;
      case 'clusters': return <WordClusters />;
      case 'profile': return <Profile />;
      case 'settings': return <Settings />;
      case 'admin': return user.role === 'admin' ? <AdminPanel /> : <Dashboard onNavigate={handleNavigate} />;
      default: return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <WordsProvider onNavigate={handleNavigate}>
    <div className="app-layout">
      {/* Mobile header */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <span style={{ fontWeight: 800, color: 'var(--green-dark)', fontSize: 16 }}>📝 11+ Vocab</span>
        <img
          className="user-avatar"
          src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6B9E7A&color=fff`}
          alt={user.name}
        />
      </div>

      {/* Overlay for mobile */}
      <div className={`overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      {/* Sidebar */}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>📝 11 Plus Vocab</h1>
          <div className="subtitle">Vocabulary Trainer</div>
        </div>

        <div className="nav-items">
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${tab === item.id || (item.id === 'words' && tab === 'word') ? 'active' : ''}`}
              onClick={() => handleNavigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

        {/* Gamification widgets */}
        {user && treeData && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--cream-dark, #e0d5c1)' }}>
            {streak && (
              <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 14, fontWeight: 700, color: 'var(--orange, #f39c12)' }}>
                🔥 {streak.days} day streak{!streak.todayActive && streak.days > 0 ? ' — keep it going!' : ''}
              </div>
            )}
            <GrowthTree stage={treeData.stage} healthPercent={treeData.healthPercent} />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
              ⚡ {treeData.todayEarned} / {treeData.dailyTarget} pts today
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="user-info">
            <img
              className="user-avatar"
              src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6B9E7A&color=fff`}
              alt={user.name}
            />
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <button className="btn-secondary" onClick={logout} style={{ width: '100%' }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
    <CelebrationOverlay />
    </WordsProvider>
  );
}

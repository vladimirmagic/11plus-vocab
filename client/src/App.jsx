import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WordList from './pages/WordList.jsx';
import WordClusters from './pages/WordClusters.jsx';
import MatchingGame from './pages/MatchingGame.jsx';
import SentenceBuilder from './pages/SentenceBuilder.jsx';
import AdminPanel from './pages/AdminPanel.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\ud83c\udfe0' },
  { id: 'words', label: 'Word List', icon: '\ud83d\udcda' },
  { id: 'clusters', label: 'Word Clusters', icon: '\ud83d\udd78\ufe0f' },
  { id: 'matching', label: 'Matching Game', icon: '\ud83c\udfaf' },
  { id: 'sentences', label: 'Sentence Builder', icon: '\u270d\ufe0f' },
];

const ADMIN_NAV = { id: 'admin', label: 'Admin Panel', icon: '\u2699\ufe0f' };

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const googleBtnRef = useRef(null);

  const handleNavigate = useCallback((newTab) => {
    setTab(newTab);
    setSidebarOpen(false);
  }, []);

  // Google Sign-In
  useEffect(() => {
    if (user || loading) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return false;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            await login(response.credential);
          } catch (err) {
            console.error('Login failed:', err.message);
          }
        },
      });

      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          shape: 'pill',
          size: 'large',
          text: 'signin_with',
          theme: 'outline',
        });
      }
      return true;
    };

    if (initGoogle()) return;

    const timer = setInterval(() => {
      if (initGoogle()) clearInterval(timer);
    }, 200);

    return () => clearInterval(timer);
  }, [user, loading, login]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-screen">
        <h1>\ud83d\udcdd 11 Plus Vocab</h1>
        <p className="tagline">Master vocabulary for your 11 Plus exam with fun, interactive learning</p>
        <div className="features">
          <div className="feature-card">
            <div className="feature-icon">\ud83d\udcda</div>
            <h3>Word Library</h3>
            <p>Explore hundreds of important vocabulary words with clear definitions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">\ud83c\udfaf</div>
            <h3>Matching Game</h3>
            <p>Test your knowledge by matching words to their meanings</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">\u270d\ufe0f</div>
            <h3>Sentence Builder</h3>
            <p>Practice using words in sentences with AI feedback</p>
          </div>
        </div>
        <div ref={googleBtnRef} style={{ minHeight: 44 }}></div>
      </div>
    );
  }

  const navItems = user.role === 'admin' ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;

  const renderPage = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'words': return <WordList />;
      case 'clusters': return <WordClusters />;
      case 'matching': return <MatchingGame />;
      case 'sentences': return <SentenceBuilder />;
      case 'admin': return user.role === 'admin' ? <AdminPanel /> : <Dashboard onNavigate={handleNavigate} />;
      default: return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-layout">
      {/* Mobile header */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '\u2715' : '\u2630'}
        </button>
        <span style={{ fontWeight: 800, color: 'var(--green-dark)', fontSize: 16 }}>\ud83d\udcdd 11+ Vocab</span>
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
          <h1>\ud83d\udcdd 11 Plus Vocab</h1>
          <div className="subtitle">Vocabulary Trainer</div>
        </div>

        <div className="nav-items">
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => handleNavigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

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
  );
}

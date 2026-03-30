import React, { useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WordList from './pages/WordList.jsx';
import WordClusters from './pages/WordClusters.jsx';
import MatchingGame from './pages/MatchingGame.jsx';
import SentenceBuilder from './pages/SentenceBuilder.jsx';
import AdminPanel from './pages/AdminPanel.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'words', label: 'Word List', icon: '📚' },
  { id: 'clusters', label: 'Word Clusters', icon: '🕸️' },
  { id: 'matching', label: 'Matching Game', icon: '🎯' },
  { id: 'sentences', label: 'Sentence Builder', icon: '✍️' },
];

const ADMIN_NAV = { id: 'admin', label: 'Admin Panel', icon: '⚙️' };

function LoginScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'otp'
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Please enter a valid email'); return; }
    setSending(true);
    setError('');
    try {
      await sendOtp(email);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Please enter the 6-digit code'); return; }
    setSending(true);
    setError('');
    try {
      await verifyOtp(email, otp);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

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
        {step === 'email' ? (
          <form onSubmit={handleSendOtp}>
            <h3 style={{ marginBottom: 12, textAlign: 'center' }}>Sign in with your email</h3>
            <input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ marginBottom: 12 }}
            />
            <button className="btn-primary" type="submit" disabled={sending} style={{ width: '100%' }}>
              {sending ? 'Sending code...' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <h3 style={{ marginBottom: 8, textAlign: 'center' }}>Check your email</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12 }}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              style={{ marginBottom: 12, textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
              autoFocus
            />
            <button className="btn-primary" type="submit" disabled={sending} style={{ width: '100%' }}>
              {sending ? 'Verifying...' : 'Verify Code'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setStep('email'); setOtp(''); setError(''); }}
              style={{ width: '100%', marginTop: 8 }}
            >
              Use a different email
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
  const [tab, setTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = useCallback((newTab) => {
    setTab(newTab);
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

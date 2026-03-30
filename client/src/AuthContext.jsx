import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, clearToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => getToken());
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('invalid'); return r.json(); })
      .then(data => setUser(data.user))
      .catch(() => { clearToken(); setTokenState(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const loginWithName = useCallback(async (name) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Server error - please try again'); }
    if (!r.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, loginWithName, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

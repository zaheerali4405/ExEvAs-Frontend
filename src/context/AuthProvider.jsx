import { useState, useEffect, useCallback } from 'react';
import { getMe } from '../api/authApi';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('exevas_token'));
  const [user, setUser] = useState(null);
  // Only a stored token has a user still to fetch. Signing in sets it again
  // (saveToken); signing out clears it along with the user.
  const [loading, setLoading] = useState(!!localStorage.getItem('exevas_token'));

  const logout = useCallback(() => {
    localStorage.removeItem('exevas_token');
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    getMe()
      .then(({ data }) => { if (!ignore) setUser(data); })
      .catch(() => { if (!ignore) logout(); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [token, logout]);

  const saveToken = (accessToken) => {
    localStorage.setItem('exevas_token', accessToken);
    setLoading(true);
    setToken(accessToken);
    window.dispatchEvent(new Event('exevas_login'));
  };

  const updateUser = (patch) => setUser((prev) => prev ? { ...prev, ...patch } : prev);

  // Accepts a single permission key, or an array of keys (any one matching grants access).
  const can = useCallback(
    (permissionKey) => {
      if (Array.isArray(permissionKey)) return permissionKey.some((k) => user?.permissions?.includes(k));
      return !!user?.permissions?.includes(permissionKey);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ token, user, saveToken, logout, updateUser, can, loading, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

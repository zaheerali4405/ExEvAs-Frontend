import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('exevas_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('exevas_token'));

  useEffect(() => {
    if (token) {
      setLoading(true);
      getMe()
        .then(({ data }) => setUser(data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const saveToken = (accessToken) => {
    localStorage.setItem('exevas_token', accessToken);
    setToken(accessToken);
    window.dispatchEvent(new Event('exevas_login'));
  };

  const logout = () => {
    localStorage.removeItem('exevas_token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (patch) => setUser((prev) => prev ? { ...prev, ...patch } : prev);

  const can = useCallback(
    (permissionKey) => !!user?.permissions?.includes(permissionKey),
    [user]
  );

  return (
    <AuthContext.Provider value={{ token, user, saveToken, logout, updateUser, can, loading, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

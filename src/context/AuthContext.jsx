import { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('exevas_token'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      getMe()
        .then(({ data }) => setUser(data))
        .catch(() => {});
    } else {
      setUser(null);
    }
  }, [token]);

  const saveToken = (accessToken) => {
    localStorage.setItem('exevas_token', accessToken);
    setToken(accessToken);
  };

  const logout = () => {
    localStorage.removeItem('exevas_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, saveToken, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('exevas_token'));

  const saveToken = (accessToken) => {
    localStorage.setItem('exevas_token', accessToken);
    setToken(accessToken);
  };

  const logout = () => {
    localStorage.removeItem('exevas_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, saveToken, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
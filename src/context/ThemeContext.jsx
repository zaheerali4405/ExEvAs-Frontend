import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axiosClient from '../api/axiosClient';

const ThemeContext = createContext(null);

const CSS_DEFAULTS = {
  brandColor:       '#1AB394',
  lightPrimaryBg:   '#ffffff',
  lightSecondaryBg: '#f5f5f5',
  darkPrimaryBg:    '#1f1f1f',
  darkSecondaryBg:  '#141414',
};

function applyColorVars(colors, isDark) {
  const root = document.documentElement;
  root.style.setProperty('--brand-color',   colors.brandColor);
  root.style.setProperty('--page-primary',   isDark ? colors.darkPrimaryBg  : colors.lightPrimaryBg);
  root.style.setProperty('--page-secondary', isDark ? colors.darkSecondaryBg : colors.lightSecondaryBg);
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem('exevas_theme') === 'dark'
  );
  const [colors, setColors] = useState(CSS_DEFAULTS);

  const loadSettings = useCallback(() => {
    const token = localStorage.getItem('exevas_token');
    if (!token) {
      applyColorVars(CSS_DEFAULTS, isDark);
      return;
    }
    axiosClient.get('/system-settings').then(({ data }) => {
      const loaded = {
        brandColor:       data.brandColor       ?? CSS_DEFAULTS.brandColor,
        lightPrimaryBg:   data.lightPrimaryBg   ?? CSS_DEFAULTS.lightPrimaryBg,
        lightSecondaryBg: data.lightSecondaryBg ?? CSS_DEFAULTS.lightSecondaryBg,
        darkPrimaryBg:    data.darkPrimaryBg    ?? CSS_DEFAULTS.darkPrimaryBg,
        darkSecondaryBg:  data.darkSecondaryBg  ?? CSS_DEFAULTS.darkSecondaryBg,
      };
      setColors(loaded);
      applyColorVars(loaded, isDark);
    }).catch(() => {
      applyColorVars(CSS_DEFAULTS, isDark);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load on startup if already authenticated
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Reload after login (fired by AuthContext.saveToken)
  useEffect(() => {
    window.addEventListener('exevas_login', loadSettings);
    return () => window.removeEventListener('exevas_login', loadSettings);
  }, [loadSettings]);

  // Re-apply whenever dark mode changes
  useEffect(() => {
    applyColorVars(colors, isDark);
  }, [isDark, colors]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('exevas_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const updateColors = useCallback((newColors) => {
    setColors((prev) => ({ ...prev, ...newColors }));
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors, updateColors, loadSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

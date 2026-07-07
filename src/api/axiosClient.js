import axios from 'axios';

const axiosClient = axios.create({
  baseURL: 'http://localhost:3000', // ExEvAs backend
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('exevas_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Public auth endpoints that return 401 legitimately (wrong credentials etc.)
// — do NOT redirect to login from these, just let the error propagate.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/send-2fa-code', '/auth/verify-2fa'];

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';

    if (status === 401 && !PUBLIC_AUTH_PATHS.some((p) => url.includes(p))) {
      localStorage.removeItem('exevas_token');
      sessionStorage.setItem('exevas_session_expired', '1');
      window.location.href = '/';
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { verify2fa } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';

export default function TwoFaCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { saveToken } = useAuth();
  const { email, password, channel, userId } = location.state || {};

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!email || !password || !userId) {
    return <Navigate to="/" replace />;
  }

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await verify2fa(userId, code);
      saveToken(data.accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl text-gray-700 mb-1">Enter Code</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--page-text)' }}>
        Enter the 6-digit code sent via {channel}. It is valid for 5 minutes.
      </p>

      {error && <div className="alert-danger mb-4">{error}</div>}

      <form onSubmit={handleVerify} className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="input-field text-center tracking-widest"
        />
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Verifying...' : 'Verify & Login'}
        </button>
      </form>
    </AuthLayout>
  );
}
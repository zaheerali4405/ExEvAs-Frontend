import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { verifyResetCode } from '../../api/authApi';

export default function VerifyResetCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = location.state || {};

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!email) {
    return <Navigate to="/forgot-password" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await verifyResetCode(email, code);
      navigate('/reset-password', { state: { resetToken: data.resetToken } });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl text-gray-700 mb-1">Enter Reset Code</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--page-text)' }}>
        Enter the 6-digit code sent to you. It is valid for 5 minutes.
      </p>

      {error && <div className="alert-danger mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
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
          {loading ? 'Verifying...' : 'Verify Code'}
        </button>
      </form>
    </AuthLayout>
  );
}
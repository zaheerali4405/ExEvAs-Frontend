import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { send2faCode } from '../../api/authApi';

export default function TwoFaChannel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, password, userId } = location.state || {};
  const [channel, setChannel] = useState('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!email || !password) {
    return <Navigate to="/" replace />;
  }

  const handleSendCode = async () => {
    setError('');
    setLoading(true);
    try {
      await send2faCode(email, password, channel);
      navigate('/2FA-Code', { state: { email, password, channel, userId } });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl text-gray-700 mb-1">Two-Factor Authentication</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--page-text)' }}>
        Your account has two-factor authentication enabled. Choose where to receive the verification code.
      </p>

      {error && <div className="alert-danger mb-4">{error}</div>}
    
      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-2 border border-gray-300 rounded-md px-3 py-2 cursor-pointer">
          <input
            type="radio"
            name="channel"
            value="email"
            checked={channel === 'email'}
            onChange={() => setChannel('email')}
          />
          <span className="text-sm">Email</span>
        </label>
        <label className="flex items-center gap-2 border border-gray-300 rounded-md px-3 py-2 cursor-pointer">
          <input
            type="radio"
            name="channel"
            value="phone"
            checked={channel === 'phone'}
            onChange={() => setChannel('phone')}
          />
          <span className="text-sm">Phone</span>
        </label>
      </div>

      <button onClick={handleSendCode} disabled={loading} className="btn-primary w-full">
        {loading ? 'Sending...' : 'Send Code'}
      </button>
    </AuthLayout>
  );
}
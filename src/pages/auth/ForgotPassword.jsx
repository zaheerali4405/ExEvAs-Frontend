import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout';
import { forgotPassword } from '../../api/authApi';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email, channel);
      navigate('/verify-reset-code', { state: { email } });
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl text-gray-700 mb-1">Forgot Password</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--page-text)' }}>
        Enter your email and choose where to receive your reset code.
      </p>

      {error && <div className="alert-danger mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-field pl-10"
          />
        </div>

        <div className="space-y-2">
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

        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? 'Sending...' : 'Send Reset Code'}
        </button>
      </form>

      <div className="text-center mt-4">
        <a href="/" className="text-sm">
          Back to Login
        </a>
      </div>
    </AuthLayout>
  );
}
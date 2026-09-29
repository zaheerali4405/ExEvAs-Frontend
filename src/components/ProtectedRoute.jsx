import { Spin } from 'antd';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import Forbidden from '../pages/Forbidden';

export default function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, can, loading } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (permission && !can(permission)) {
    return <Forbidden />;
  }

  return children;
}
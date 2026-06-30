import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { decodeToken } from '../utils/jwt';

export default function Dashboard() {
  const { token } = useAuth();
  const user = decodeToken(token);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-gray-700">
        Welcome, {user?.email ?? 'User'} to ExEvAs
      </h1>
    </DashboardLayout>
  );
}
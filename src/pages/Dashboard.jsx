import { Typography } from 'antd';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <Title level={4}>
        Welcome, {user ? (user.firstName ?? user.email) : '—'} 👋
      </Title>
      <Text type="secondary">You are logged into ExEvAs Scheduling Engine.</Text>
    </DashboardLayout>
  );
}

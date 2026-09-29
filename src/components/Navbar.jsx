import { Layout, Avatar, Dropdown } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  KeyOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import NotificationBell from './NotificationBell';

const { Header } = Layout;

const PRIMARY = '#1AB394';

export default function Navbar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'View Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: 'Change Password',
      onClick: () => navigate('/change-password'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const initials = user
    ? (user.username || user.email)[0]?.toUpperCase() || null
    : null;

  return (
    <Header
      style={{
        background: PRIMARY,
        padding: '0 16px',
        height: 56,
        lineHeight: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: hamburger toggle */}
      <button
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#ffffff',
          fontSize: 20,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
        }}
      >
        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </button>

      {/* Right: notifications + user dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <NotificationBell />
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar
            style={{ background: '#ffffff', color: PRIMARY, fontWeight: 600 }}
            icon={!initials ? <UserOutlined /> : undefined}
          >
            {initials}
          </Avatar>
          {user && (
            <span style={{ color: '#ffffff', fontSize: 14 }}>
              {user.username ?? user.email}
            </span>
          )}
        </div>
      </Dropdown>
      </div>
    </Header>
  );
}

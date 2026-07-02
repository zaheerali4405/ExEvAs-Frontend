import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  IdcardOutlined,
  SafetyOutlined,
  LockOutlined,
  EnvironmentOutlined,
  ToolOutlined,
  AppstoreOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Sider } = Layout;

const navItems = [
  { key: '/dashboard',       icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/users',           icon: <UserOutlined />,      label: 'Users' },
  { key: '/designations',    icon: <IdcardOutlined />,    label: 'Designations' },
  { key: '/roles',           icon: <SafetyOutlined />,    label: 'Roles' },
  { key: '/permissions',     icon: <LockOutlined />,      label: 'Permissions' },
  { key: '/venues',          icon: <EnvironmentOutlined />, label: 'Venues' },
  { key: '/equipment',       icon: <ToolOutlined />,      label: 'Equipment' },
  { key: '/event-categories',icon: <AppstoreOutlined />,  label: 'Event Categories' },
  { key: '/events',          icon: <CalendarOutlined />,  label: 'Events' },
];

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = navItems
    .map((i) => i.key)
    .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <Sider
      collapsed={collapsed}
      width={220}
      collapsedWidth={56}
      style={{
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflow: 'auto',
        background: '#ffffff',
        borderRight: '1px solid #f0f0f0',
      }}
    >
      {/* Logo area */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          padding: collapsed ? 0 : '0 16px',
          borderBottom: '1px solid #f0f0f0',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <img src="../../../CMHLMC_Icon.png" alt="CMH LMC" style={{ width: 32, height: 32, flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1AB394', lineHeight: 1.2 }}>
            ExEvAs Scheduling Engine
          </span>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        inlineCollapsed={collapsed}
        items={navItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 'none', marginTop: 8 }}
      />
    </Sider>
  );
}

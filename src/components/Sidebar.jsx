import { useMemo } from 'react';
import { Layout, Menu, theme } from 'antd';
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
  ApartmentOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Sider } = Layout;

const navItems = [
  { key: '/dashboard',          icon: <DashboardOutlined />,   label: 'Dashboard' },
  { key: '/users',              icon: <UserOutlined />,        label: 'Users',              permission: 'user.read-all' },
  { key: '/designations',       icon: <IdcardOutlined />,      label: 'Designations',       permission: 'designation.read-all' },
  { key: '/roles',              icon: <SafetyOutlined />,      label: 'Roles',              permission: 'role.read-all' },
  { key: '/permissions',        icon: <LockOutlined />,        label: 'Permissions',        permission: 'permission.read-all' },
  {
    key: 'assignments',
    icon: <ApartmentOutlined />,
    label: 'Assignments',
    children: [
      { key: '/role-permissions',   icon: <SafetyOutlined />,  label: 'Role Permissions',   permission: 'role-permission.read-all' },
      { key: '/designation-roles',  icon: <IdcardOutlined />,  label: 'Designation Roles',  permission: 'designation-role.read-all' },
      { key: '/user-roles',         icon: <UserOutlined />,    label: 'User Roles',         permission: 'user-role.read-all' },
      { key: '/user-designations',  icon: <UserOutlined />,    label: 'User Designations',  permission: 'user-designation.read-all' },
    ],
  },
  { key: '/venue-categories',   icon: <AppstoreOutlined />,    label: 'Venue Categories',   permission: 'venue-category.read-all' },
  { key: '/venues',             icon: <EnvironmentOutlined />, label: 'Venues',              permission: 'venue.read-all' },
  { key: '/equipment',          icon: <ToolOutlined />,        label: 'Equipment',          permission: 'equipment.read-all' },
  { key: '/event-categories',   icon: <AppstoreOutlined />,    label: 'Event Categories',   permission: 'event-category.read-all' },
  { key: '/events',             icon: <CalendarOutlined />,    label: 'Events',             permission: 'event.read-all' },
  { key: '/system-settings',   icon: <SettingOutlined />,     label: 'System Settings',     permission: 'system-settings.read' },
];

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const { can } = useAuth();

  const visibleNavItems = useMemo(() => {
    const stripPermission = (item) => {
      const rest = { ...item };
      delete rest.permission;
      return rest;
    };
    return navItems
      .map((item) => {
        if (item.children) {
          const children = item.children.filter((c) => !c.permission || can(c.permission)).map(stripPermission);
          return children.length ? { ...stripPermission(item), children } : null;
        }
        return !item.permission || can(item.permission) ? stripPermission(item) : null;
      })
      .filter(Boolean);
  }, [can]);

  const selectedKey = visibleNavItems
    .flatMap((i) => (i.children ? i.children : [i]))
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
        background: token.colorBgContainer,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
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
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
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
        items={visibleNavItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 'none', marginTop: 8 }}
      />
    </Sider>
  );
}

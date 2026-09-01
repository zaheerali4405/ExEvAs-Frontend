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
  CalendarOutlined,
  ScheduleOutlined,
  ApartmentOutlined,
  SettingOutlined,
  BankOutlined,
  ClusterOutlined,
  ReadOutlined,
  SolutionOutlined,
  HistoryOutlined,
  RiseOutlined,
  TeamOutlined,
  FileTextOutlined,
  BookOutlined,
  ContactsOutlined,
  BellOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Sider } = Layout;

const navItems = [
  { key: '/dashboard',          icon: <DashboardOutlined />,   label: 'Dashboard' },
  {
    key: 'Users & RBAC',
    icon: <ApartmentOutlined />,
    label: 'Users & RBAC',
    children: [
      { key: '/users',              icon: <UserOutlined />,        label: 'Users',              permission: 'user.read-all' },
      { key: '/designations',       icon: <IdcardOutlined />,      label: 'Designations',       permission: 'designation.read-all' },
      { key: '/roles',              icon: <SafetyOutlined />,      label: 'Roles',              permission: 'role.read-all' },
      { key: '/permissions',        icon: <LockOutlined />,        label: 'Permissions',        permission: 'permission.read-all' },
      { key: '/user-designations',  icon: <UserOutlined />,    label: 'User Designations',  permission: 'user-designation.read-all' },
      { key: '/designation-roles',  icon: <IdcardOutlined />,  label: 'Designation Roles',  permission: 'designation-role.read-all' },
      { key: '/user-roles',         icon: <UserOutlined />,    label: 'User Roles',         permission: 'user-role.read-all' },
      { key: '/role-permissions',   icon: <SafetyOutlined />,  label: 'Role Permissions',   permission: 'role-permission.read-all' },
    ],
  },
  {
    key: 'Settings',
    icon: <SettingOutlined />,
    label: 'Settings',
    children: [
      { key: '/sessions',           icon: <HistoryOutlined />,     label: 'Sessions',           permission: 'session.read-all' },
      { key: '/institutes',         icon: <BankOutlined />,        label: 'Institutes',         permission: 'institute.read-all' },
      { key: '/programs',           icon: <SolutionOutlined />,    label: 'Programs',           permission: 'program.read-all' },
      { key: '/degree-levels',      icon: <RiseOutlined />,        label: 'Degree Levels',      permission: 'degree-level.read-all' },
      { key: '/exam-types',         icon: <FileTextOutlined />,    label: 'Exam Types',         permission: 'exam-type.read-all' },
      { key: '/classes',            icon: <TeamOutlined />,        label: 'Classes',            permission: 'class.read-all' },
      { key: '/course-papers',      icon: <BookOutlined />,        label: 'Course/Papers',      permission: 'course-paper.read-all' },
      { key: '/subjects',           icon: <ReadOutlined />,        label: 'Subjects',           permission: 'subject.read-all' },  
      { key: '/departments',        icon: <ClusterOutlined />,     label: 'Departments',        permission: 'department.read-all' },
      { key: '/employees',          icon: <ContactsOutlined />,    label: 'Employees',          permission: 'employee.read-all' },
      { key: '/students',           icon: <UserOutlined />,        label: 'Students',           permission: 'student.read-all' },
      { key: '/notification-templates', icon: <NotificationOutlined />, label: 'Notification Templates', permission: 'notification-template.read-all' },
    ],
  },
    {
    key: 'Setup Settings',
    icon: <SettingOutlined />,
    label: 'Setup Settings',
    children: [
            { key: '/venues',             icon: <EnvironmentOutlined />, label: 'Venues',              permission: 'venue.read-all' },
      { key: '/equipment',          icon: <ToolOutlined />,        label: 'Equipment',          permission: 'equipment.read-all' },
      { key: '/events',             icon: <CalendarOutlined />,    label: 'Events',             permission: ['event.read-all', 'event.read-departmental'] },
      { key: '/moderation-meetings', icon: <TeamOutlined />,       label: 'Moderation Meetings', permission: ['moderation-meeting.read-all', 'moderation-meeting.read-departmental'] },
      { key: '/notifications',     icon: <NotificationOutlined />, label: 'Notifications',       permission: 'notification.read-all' },
    ],
  },
  { key: '/datesheet',          icon: <ScheduleOutlined />,    label: 'Exam Datesheet',          permission: ['event.read-all', 'event.read-departmental'] },
  { key: '/moderation-meetings-calendar', icon: <ScheduleOutlined />, label: 'Moderation Calendar', permission: ['moderation-meeting.read-all', 'moderation-meeting.read-departmental'] },
  { key: '/my-notifications',  icon: <BellOutlined />,        label: 'My Notifications' },
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

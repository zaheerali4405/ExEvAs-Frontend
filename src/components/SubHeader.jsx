import { Breadcrumb, Button, Typography, theme } from 'antd';
import { PlusOutlined, HomeOutlined } from '@ant-design/icons';
import { useLocation, Link } from 'react-router-dom';

const { Title } = Typography;

const routeConfig = {
  '/dashboard':        { title: 'Dashboard',        addPath: null },
  '/users':            { title: 'Users',             addPath: '/users/add' },
  '/designations':     { title: 'Designations',      addPath: '/designations/add' },
  '/roles':            { title: 'Roles',             addPath: '/roles/add' },
  '/permissions':      { title: 'Permissions',       addPath: '/permissions/add' },
  '/venue-categories': { title: 'Venue Categories',   addPath: '/venue-categories/add' },
  '/venues':           { title: 'Venues',            addPath: '/venues/add' },
  '/equipment':        { title: 'Equipment',         addPath: '/equipment/add' },
  '/event-categories': { title: 'Event Categories',  addPath: '/event-categories/add' },
  '/events':           { title: 'Events',            addPath: '/events/add' },
  '/role-permissions':  { title: 'Role Permissions',  addPath: null },
  '/designation-roles': { title: 'Designation Roles', addPath: null },
  '/user-roles':         { title: 'User Roles',         addPath: null },
  '/user-designations':  { title: 'User Designations',  addPath: null },
  '/profile':          { title: 'My Profile',        addPath: null },
  '/change-password':  { title: 'Change Password',   addPath: null },
  '/settings':         { title: 'Settings',          addPath: null },
  '/system-settings':  { title: 'System Settings',   addPath: null },
};

const segmentLabels = {
  dashboard:          'Dashboard',
  users:              'Users',
  designations:       'Designations',
  roles:              'Roles',
  permissions:        'Permissions',
  'venue-categories': 'Venue Categories',
  venues:             'Venues',
  equipment:          'Equipment',
  'event-categories': 'Event Categories',
  events:             'Events',
  profile:            'My Profile',
  'change-password':  'Change Password',
  settings:           'Settings',
  'system-settings':  'System Settings',
  'role-permissions':  'Role Permissions',
  'designation-roles': 'Designation Roles',
  'user-roles':         'User Roles',
  'user-designations':  'User Designations',
  add:                 'Add New',
  edit:               'Edit',
  resources:           'Manage Resources',
};

export default function SubHeader({ onAdd, headerAction }) {
  const location = useLocation();
  const { token } = theme.useToken();

  // Find the best matching route config (longest prefix match)
  const configKey = Object.keys(routeConfig)
    .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const config = routeConfig[configKey] ?? { title: 'Page', addPath: null };

  // Build breadcrumb items from path segments — numeric segments (record
  // IDs embedded in the URL, e.g. /events/5/resources) are skipped since
  // they aren't meaningful breadcrumb labels.
  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbItems = [
    {
      title: <Link to="/dashboard"><HomeOutlined /> Home</Link>,
    },
    ...segments
      .map((seg, index) => {
        if (/^\d+$/.test(seg)) return null;
        const path = '/' + segments.slice(0, index + 1).join('/');
        const label = segmentLabels[seg] ?? seg;
        const isLast = index === segments.length - 1;
        return {
          title: isLast ? label : <Link to={path}>{label}</Link>,
        };
      })
      .filter(Boolean),
  ];

  // Only show Add button on exact resource list pages
  const isListPage = Object.keys(routeConfig).includes(location.pathname);
  const showAdd = isListPage && config.addPath && !!onAdd;

  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <Title level={5} style={{ margin: 0, lineHeight: 1.3 }}>
          {config.title}
        </Title>
        <Breadcrumb items={breadcrumbItems} style={{ fontSize: 12 }} />
      </div>

      {headerAction ? headerAction : showAdd && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAdd}
        >
          Add {config.title.replace(/s$/i, '')}
        </Button>
      )}
    </div>
  );
}

import { Breadcrumb, Button, Typography } from 'antd';
import { PlusOutlined, HomeOutlined } from '@ant-design/icons';
import { useLocation, Link } from 'react-router-dom';

const { Title } = Typography;

const routeConfig = {
  '/dashboard':        { title: 'Dashboard',        addPath: null },
  '/users':            { title: 'Users',             addPath: '/users/add' },
  '/designations':     { title: 'Designations',      addPath: '/designations/add' },
  '/roles':            { title: 'Roles',             addPath: '/roles/add' },
  '/permissions':      { title: 'Permissions',       addPath: '/permissions/add' },
  '/venues':           { title: 'Venues',            addPath: '/venues/add' },
  '/equipment':        { title: 'Equipment',         addPath: '/equipment/add' },
  '/event-categories': { title: 'Event Categories',  addPath: '/event-categories/add' },
  '/events':           { title: 'Events',            addPath: '/events/add' },
  '/profile':          { title: 'My Profile',        addPath: null },
  '/change-password':  { title: 'Change Password',   addPath: null },
  '/settings':         { title: 'Settings',          addPath: null },
};

const segmentLabels = {
  dashboard:          'Dashboard',
  users:              'Users',
  designations:       'Designations',
  roles:              'Roles',
  permissions:        'Permissions',
  venues:             'Venues',
  equipment:          'Equipment',
  'event-categories': 'Event Categories',
  events:             'Events',
  profile:            'My Profile',
  'change-password':  'Change Password',
  settings:           'Settings',
  add:                'Add New',
  edit:               'Edit',
};

export default function SubHeader({ onAdd }) {
  const location = useLocation();

  // Find the best matching route config (longest prefix match)
  const configKey = Object.keys(routeConfig)
    .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const config = routeConfig[configKey] ?? { title: 'Page', addPath: null };

  // Build breadcrumb items from path segments
  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbItems = [
    {
      title: <Link to="/dashboard"><HomeOutlined /> Home</Link>,
    },
    ...segments.map((seg, index) => {
      const path = '/' + segments.slice(0, index + 1).join('/');
      const label = segmentLabels[seg] ?? seg;
      const isLast = index === segments.length - 1;
      return {
        title: isLast ? label : <Link to={path}>{label}</Link>,
      };
    }),
  ];

  // Only show Add button on exact resource list pages
  const isListPage = Object.keys(routeConfig).includes(location.pathname);
  const showAdd = isListPage && config.addPath;

  return (
    <div
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
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

      {showAdd && (
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

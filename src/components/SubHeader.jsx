import { Breadcrumb, Button, Typography, theme } from 'antd';
import { PlusOutlined, HomeOutlined } from '@ant-design/icons';
import { useLocation, Link } from 'react-router-dom';

const { Title } = Typography;

// Naive plural -> singular for the "Add {Thing}" button label. Handles
// "-ies" -> "-y" (e.g. "Categories" -> "Category"), "-sses"/"-xes"/"-ches"/
// "-shes"/"-zes" (e.g. "Classes" -> "Class"), and the regular "-s" case.
const singularize = (title) =>
  title
    .replace(/([^aeiou])ies$/i, '$1y')
    .replace(/(ss|x|ch|sh|z)es$/i, '$1')
    .replace(/([^s])s$/i, '$1');

const routeConfig = {
  '/dashboard':        { title: 'Dashboard',        addPath: null },
  '/users':            { title: 'Users',             addPath: '/users/add' },
  '/designations':     { title: 'Designations',      addPath: '/designations/add' },
  '/roles':            { title: 'Roles',             addPath: '/roles/add' },
  '/permissions':      { title: 'Permissions',       addPath: '/permissions/add' },
  '/institutes':       { title: 'Institutes',         addPath: '/institutes/add' },
  '/departments':      { title: 'Departments',        addPath: '/departments/add' },
  '/employees':        { title: 'Employees',          addPath: '/employees/add' },
  '/students':         { title: 'Students',           addPath: '/students/add' },
  '/subjects':         { title: 'Subjects',           addPath: '/subjects/add' },
  '/programs':         { title: 'Programs',           addPath: '/programs/add' },
  '/sessions':         { title: 'Sessions',           addPath: '/sessions/add' },
  '/degree-levels':    { title: 'Degree Levels',      addPath: '/degree-levels/add' },
  '/classes':          { title: 'Classes',            addPath: '/classes/add' },
  '/exam-types':       { title: 'Exam Types',         addPath: '/exam-types/add' },
  '/exam-scopes':      { title: 'Exam Scopes',        addPath: '/exam-scopes/add' },
  '/exam-categories': { title: 'Exam Categories',   addPath: '/exam-categories/add' },
  '/exam-category-colors': { title: 'Exam Category Colors', addPath: null },
  '/exam-category-rules': { title: 'Exam Category Rules', addPath: null },
  '/course-papers':    { title: 'Course/Papers',      addPath: '/course-papers/add' },
  '/venues':           { title: 'Venues',            addPath: '/venues/add' },
  '/equipment':        { title: 'Equipment',         addPath: '/equipment/add' },
  '/events':           { title: 'Events',            addPath: '/events/add' },
  '/datesheet':        { title: 'Datesheet',          addPath: null },
  '/moderation-meetings': { title: 'Moderation Meetings', addPath: '/moderation-meetings/add' },
  '/moderation-meetings-calendar': { title: 'Moderation Meeting Calendar', addPath: null },
  '/role-permissions':  { title: 'Role Permissions',  addPath: null },
  '/designation-roles': { title: 'Designation Roles', addPath: null },
  '/user-roles':         { title: 'User Roles',         addPath: null },
  '/user-designations':  { title: 'User Designations',  addPath: null },
  '/profile':          { title: 'My Profile',        addPath: null },
  '/change-password':  { title: 'Change Password',   addPath: null },
  '/settings':         { title: 'Settings',          addPath: null },
  '/system-settings':  { title: 'System Settings',   addPath: null },
  '/notification-templates': { title: 'Notification Templates', addPath: '/notification-templates/add' },
  '/workflows':        { title: 'Workflows',         addPath: '/workflows/add' },
  '/activities':       { title: 'Activities',        addPath: '/activities/add' },
  '/task-templates':   { title: 'Task Templates',    addPath: '/task-templates/add' },
  '/task-notifications': { title: 'Task Notifications', addPath: '/task-notifications/add' },
  '/notifications':    { title: 'Notifications',     addPath: '/notifications/add' },
  '/my-notifications': { title: 'My Notifications',  addPath: null },
  '/my-tasks':         { title: 'My Tasks',          addPath: null },
  '/tasks':            { title: 'Tasks',             addPath: '/tasks/add' },
};

const segmentLabels = {
  dashboard:          'Dashboard',
  users:              'Users',
  designations:       'Designations',
  roles:              'Roles',
  permissions:        'Permissions',
  institutes:         'Institutes',
  departments:        'Departments',
  employees:          'Employees',
  students:           'Students',
  subjects:           'Subjects',
  programs:           'Programs',
  sessions:           'Sessions',
  'degree-levels':    'Degree Levels',
  classes:            'Classes',
  'exam-types':       'Exam Types',
  'exam-scopes':      'Exam Scopes',
  'exam-categories': 'Exam Categories',
  'exam-category-colors': 'Exam Category Colors',
  'exam-category-rules': 'Exam Category Rules',
  'course-papers':    'Course/Papers',
  venues:             'Venues',
  equipment:          'Equipment',
  events:             'Events',
  datesheet:          'Datesheet',
  'moderation-meetings': 'Moderation Meetings',
  'moderation-meetings-calendar': 'Moderation Meeting Calendar',
  profile:            'My Profile',
  'change-password':  'Change Password',
  settings:           'Settings',
  'system-settings':  'System Settings',
  'notification-templates': 'Notification Templates',
  workflows:          'Workflows',
  activities:         'Activities',
  'task-templates':   'Task Templates',
  'task-notifications': 'Task Notifications',
  notifications:      'Notifications',
  'my-notifications': 'My Notifications',
  'my-tasks':         'My Tasks',
  tasks:              'Tasks',
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
          Add {singularize(config.title)}
        </Button>
      )}
    </div>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const labelMap = {
  dashboard: 'Dashboard',
  users: 'Users',
  designations: 'Designations',
  roles: 'Roles',
  events: 'Events',
  profile: 'Profile',
  'change-password': 'Change Password',
  settings: 'Settings',
};

export default function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <nav className="flex items-center text-xs" style={{ color: 'var(--page-text)' }}>
      <Link to="/dashboard" className="hover:underline">Home</Link>
      {segments.map((segment, index) => {
        const path = '/' + segments.slice(0, index + 1).join('/');
        const label = labelMap[segment] || segment;
        const isLast = index === segments.length - 1;
        return (
          <span key={path} className="flex items-center">
            <ChevronRight size={12} className="mx-1" />
            {isLast ? (
              <span className="font-medium">{label}</span>
            ) : (
              <Link to={path} className="hover:underline">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldCheck, KeyRound, Calendar, LogOut, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Users', path: '/users', icon: Users },
  { label: 'Designations', path: '/designations', icon: ShieldCheck },
  { label: 'Roles', path: '/roles', icon: KeyRound },
  { label: 'Permissions', path: '/permissions', icon: Lock },
  { label: 'Events', path: '/events', icon: Calendar },
];

export default function Sidebar({ isOpen }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <aside
      className={`h-full bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 overflow-hidden
        ${isOpen ? 'w-64' : 'w-16'}`}
    >
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            title={!isOpen ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                isActive ? 'bg-teal-50 font-medium' : 'hover:bg-gray-100'
              } ${isOpen ? '' : 'justify-center'}`
            }
            style={({ isActive }) =>
              isActive ? { color: '#1AB394' } : { color: 'var(--page-text)' }
            }
          >
            <Icon size={18} className="shrink-0" />
            {isOpen && label}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          title={!isOpen ? 'Logout' : undefined}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap hover:bg-red-50 group ${
            isOpen ? '' : 'justify-center'
          }`}
          style={{ color: 'var(--page-text)' }}
        >
          <LogOut size={18} className="shrink-0 group-hover:text-[#A94442]" />
          {isOpen && <span className="group-hover:text-[#A94442]">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
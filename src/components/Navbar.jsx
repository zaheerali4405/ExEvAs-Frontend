import { Menu } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import UserMenu from './UserMenu';

const SIDEBAR_WIDTH = 'w-64'; // must match Sidebar's width

export default function Navbar({ sidebarOpen, onToggleSidebar }) {
  return (
    <header className="w-full flex bg-white border-b border-gray-200">
      {/* Section 1: fixed width matching sidebar, right border, always visible */}
      <div className={`${SIDEBAR_WIDTH} shrink-0 flex items-center justify-between px-6 border-r border-gray-200`}>
        <img src="../../../CMHLMC_Icon.png" alt="CMH LMC & IOD" className="w-12 h-12" />
        <button onClick={onToggleSidebar} className="p-1 rounded-sm border border-gray-200 bg-gray-100 text-gray-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-600 cursor-pointer">
          <Menu size={22} />
        </button>
      </div>

      {/* Section 2: title + breadcrumb on left, user menu on right */}
      <div className="flex-1 flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-base font-bold">ExEvAs Scheduling Engine</h1>
          <Breadcrumb />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
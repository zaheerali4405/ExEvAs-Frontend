import { useState } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

const TABLET_BREAKPOINT = 768;

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= TABLET_BREAKPOINT);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Navbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((s) => !s)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main
          className="flex-1 overflow-y-auto p-5"
          style={{ backgroundColor: 'var(--page-bg-secondary)' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
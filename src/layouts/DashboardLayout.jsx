import { useState, useEffect } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import SubHeader from '../components/SubHeader';

const { Content } = Layout;

export default function DashboardLayout({ children, onAdd, headerAction, collapseSidebar = false }) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('exevas_sidebar_collapsed');
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 768;
  });

  // A page can ask for the sidebar out of the way (the Datesheet's month
  // grid wants the width) without clobbering the user's own saved
  // preference — nothing is written to localStorage here, and they can
  // still expand it by hand while on that page.
  useEffect(() => {
    if (collapseSidebar) setCollapsed(true);
  }, [collapseSidebar]);

  const handleToggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('exevas_sidebar_collapsed', String(next));
      return next;
    });
  };
  const { token } = theme.useToken();

  return (
    <Layout style={{ height: '100vh' }}>
      <Sidebar collapsed={collapsed} />

      <Layout>
        <Navbar collapsed={collapsed} onToggle={handleToggle} />
        <SubHeader onAdd={onAdd} headerAction={headerAction} />
        <Content
          style={{
            overflow: 'auto',
            padding: 24,
            background: token.colorBgLayout,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

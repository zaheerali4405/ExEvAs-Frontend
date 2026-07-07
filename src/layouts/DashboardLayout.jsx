import { useState } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import SubHeader from '../components/SubHeader';

const { Content } = Layout;

export default function DashboardLayout({ children, onAdd }) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('exevas_sidebar_collapsed');
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 768;
  });

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
        <SubHeader onAdd={onAdd} />
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

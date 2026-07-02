import { useState } from 'react';
import { Layout } from 'antd';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import SubHeader from '../components/SubHeader';

const { Content } = Layout;

export default function DashboardLayout({ children, onAdd }) {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sidebar collapsed={collapsed} />

      <Layout>
        <Navbar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <SubHeader onAdd={onAdd} />
        <Content
          style={{
            overflow: 'auto',
            padding: 24,
            background: '#f5f5f5',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

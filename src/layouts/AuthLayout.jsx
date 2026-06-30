import { Typography } from 'antd';

const { Title } = Typography;

export default function AuthLayout({ children }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      {/* Left panel — image */}
      <div style={{ flex: '0 0 70%', height: '100%', display: 'none' }} className="auth-image-panel">
        <img
          src="../../../CMHLMC_Image.jpg"
          alt="CMH Lahore Medical College"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Right panel — form */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 40px',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Logo + app name */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              src="../../../CMHLMC_Icon.png"
              alt="CMH LMC & IOD"
              style={{ width: 88, height: 88, marginBottom: 12 }}
            />
            <Title level={4} style={{ margin: 0 }}>
              ExEvAs Scheduling Engine
            </Title>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

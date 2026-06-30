import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import './index.css';
import App from './App.jsx';

const theme = {
  token: {
    colorPrimary: '#1AB394',
    colorLink: '#337AB7',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  components: {
    Button: {
      colorPrimary: '#1AB394',
      algorithm: true,
    },
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider theme={theme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);

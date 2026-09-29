import { ConfigProvider, App as AntApp, theme as antTheme } from 'antd';
import App from './App.jsx';
import { useTheme } from './context/useTheme';

export default function Root() {
  const { isDark, colors } = useTheme();

  const theme = {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary:     colors.brandColor,
      colorLink:        '#337AB7',
      colorBgContainer: isDark ? colors.darkPrimaryBg  : colors.lightPrimaryBg,
      colorBgLayout:    isDark ? colors.darkSecondaryBg : colors.lightSecondaryBg,
      borderRadius: 6,
      fontFamily: 'inherit',
    },
    components: {
      Button: {
        colorPrimary: colors.brandColor,
        algorithm: true,
      },
    },
  };

  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

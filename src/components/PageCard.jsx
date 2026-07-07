import { theme } from 'antd';

export default function PageCard({ children, style }) {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderRadius: token.borderRadius,
        border: `1px solid ${token.colorBorderSecondary}`,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

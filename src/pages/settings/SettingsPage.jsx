import { useState } from "react";
import { Switch, Alert, Typography, Divider } from "antd";
import { SafetyOutlined, BgColorsOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { toggleTwoFa } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaSuccess, setTwoFaSuccess] = useState("");

  const handleTwoFaToggle = async (checked) => {
    setTwoFaLoading(true);
    setTwoFaError("");
    setTwoFaSuccess("");
    try {
      const { data } = await toggleTwoFa(checked);
      updateUser({ twoFaEnabled: data.twoFaEnabled });
      setTwoFaSuccess(data.message);
    } catch (err) {
      setTwoFaError(err.response?.data?.message || "Could not update 2FA setting.");
    } finally {
      setTwoFaLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageCard style={{ padding: 24, maxWidth: 560 }}>
        <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          Settings
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Manage your account preferences.
        </Text>

        <Divider />

        {/* Appearance section */}
        <Title level={5} style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
          <BgColorsOutlined style={{ marginRight: 8, color: "#1AB394" }} />
          Appearance
        </Title>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            border: "1px solid #f0f0f0",
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <div>
            <Text strong style={{ display: "block" }}>
              Dark Mode
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {isDark ? "Dark mode is on." : "Dark mode is off."}
            </Text>
          </div>
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            style={{ flexShrink: 0, marginLeft: 16 }}
          />
        </div>

        <Divider />

        {/* Security section */}
        <Title level={5} style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
          <SafetyOutlined style={{ marginRight: 8, color: "#1AB394" }} />
          Security
        </Title>

        {twoFaSuccess && (
          <Alert
            message={twoFaSuccess}
            type="success"
            showIcon
            closable
            onClose={() => setTwoFaSuccess("")}
            style={{ marginBottom: 16 }}
          />
        )}
        {twoFaError && (
          <Alert
            message={twoFaError}
            type="error"
            showIcon
            closable
            onClose={() => setTwoFaError("")}
            style={{ marginBottom: 16 }}
          />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            border: "1px solid #f0f0f0",
            borderRadius: 6,
          }}
        >
          <div>
            <Text strong style={{ display: "block" }}>
              Two-Factor Authentication (2FA)
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {user?.twoFaEnabled
                ? "2FA is enabled. You will be asked for a verification code on login."
                : "2FA is disabled. Enable it for an extra layer of security."}
            </Text>
          </div>
          <Switch
            checked={user?.twoFaEnabled ?? false}
            loading={twoFaLoading}
            onChange={handleTwoFaToggle}
            style={{ flexShrink: 0, marginLeft: 16 }}
          />
        </div>
      </PageCard>
    </DashboardLayout>
  );
}

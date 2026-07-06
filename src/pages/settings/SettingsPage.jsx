import { useState } from "react";
import { Switch, Alert, Typography, Divider } from "antd";
import { SafetyOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import { toggleTwoFa } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
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
      <div
        style={{
          background: "#ffffff",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          padding: 24,
          maxWidth: 560,
        }}
      >
        <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          Settings
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Manage your account preferences.
        </Text>

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
      </div>
    </DashboardLayout>
  );
}

import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import AuthLayout from "../../layouts/AuthLayout";
import { resetPassword } from "../../api/authApi";

const { Title, Text } = Typography;

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetToken } = location.state || {};

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!resetToken) {
    return <Navigate to="/forgot-password" replace />;
  }

  const handleFinish = async ({ newPassword }) => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { data } = await resetPassword(resetToken, newPassword);
      setMessage(data.message);
      setTimeout(() => navigate("/"), 3000);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not reset password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Reset Password
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Enter your new password below.
      </Text>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 20 }}
        />
      )}
      {message && (
        <Alert
          message={message}
          type="success"
          showIcon
          style={{ marginBottom: 20 }}
        />
      )}

      {!message && (
        <Form
          layout="vertical"
          onFinish={handleFinish}
          requiredMark={false}
          size="large"
        >
          <Form.Item
            name="newPassword"
            rules={[
              { required: true, message: "Please enter a new password." },
              { min: 8, message: "Password must be at least 8 characters." },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="New Password"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Reset Password
            </Button>
          </Form.Item>
        </Form>
      )}
    </AuthLayout>
  );
}

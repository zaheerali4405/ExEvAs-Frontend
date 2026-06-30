import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import AuthLayout from "../../layouts/AuthLayout";
import { verify2fa } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;

export default function TwoFaCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { saveToken } = useAuth();
  const { email, password, channel, userId } = location.state || {};

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!email || !password || !userId) {
    return <Navigate to="/" replace />;
  }

  const handleFinish = async ({ code }) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await verify2fa(userId, code);
      saveToken(data.accessToken);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Enter Code
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Enter the 6-digit code sent via {channel}. It is valid for 5 minutes.
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

      <Form
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        size="large"
      >
        <Form.Item
          name="code"
          rules={[
            { required: true, message: "Please enter the code." },
            { len: 6, message: "Code must be 6 digits." },
          ]}
        >
          <Input.OTP length={6} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Verify & Login
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

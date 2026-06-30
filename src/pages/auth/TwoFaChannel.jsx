import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Form, Radio, Button, Alert, Typography } from "antd";
import AuthLayout from "../../layouts/AuthLayout";
import { send2faCode } from "../../api/authApi";

const { Title, Text } = Typography;

export default function TwoFaChannel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, password, userId } = location.state || {};
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!email || !password) {
    return <Navigate to="/" replace />;
  }

  const handleFinish = async ({ channel }) => {
    setError("");
    setLoading(true);
    try {
      await send2faCode(email, password, channel);
      navigate("/2FA-Code", { state: { email, password, channel, userId } });
    } catch (err) {
      setError(err.response?.data?.message || "Could not send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Two-Factor Authentication
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Your account has two-factor authentication enabled. Choose where to receive the verification code.
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
        initialValues={{ channel: "email" }}
      >
        <Form.Item name="channel">
          <Radio.Group style={{ width: "100%" }}>
            <Radio.Button value="email" style={{ width: "50%", textAlign: "center" }}>
              Email
            </Radio.Button>
            <Radio.Button value="phone" style={{ width: "50%", textAlign: "center" }}>
              Phone
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Send Code
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

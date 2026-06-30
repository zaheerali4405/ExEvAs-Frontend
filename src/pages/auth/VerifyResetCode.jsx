import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import AuthLayout from "../../layouts/AuthLayout";
import { verifyResetCode } from "../../api/authApi";

const { Title, Text } = Typography;

export default function VerifyResetCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = location.state || {};

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!email) {
    return <Navigate to="/forgot-password" replace />;
  }

  const handleFinish = async ({ code }) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await verifyResetCode(email, code);
      navigate("/reset-password", { state: { resetToken: data.resetToken } });
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Enter Reset Code
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Enter the 6-digit code sent to you. It is valid for 5 minutes.
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
            Verify Code
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

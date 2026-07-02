import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Form, Input, Button, Checkbox, Alert, Typography } from "antd";
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import AuthLayout from "../../layouts/AuthLayout";
import { login } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
const { Title, Text } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const { saveToken } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async ({ email, password }) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await login(email, password);
      if (data.requiresTwoFa) {
        navigate("/2FA-Channel", {
          state: { email, password, userId: data.userId },
        });
      } else {
        saveToken(data.accessToken);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Login
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Enter your credentials below to sign in.
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
          name="email"
          rules={[
            { required: true, message: "Please enter your email." },
            { type: "email", message: "Please enter a valid email." },
          ]}
        >
          <Input
            prefix={<MailOutlined style={{ color: "#bfbfbf" }} />}
            placeholder="Enter Email"
            autoComplete="email"
          />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[{ required: true, message: "Please enter your password." }]}
          style={{ marginBottom: 0 }}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
            placeholder="Enter Password"
            autoComplete="current-password"
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 15 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <Form.Item name="rememberMe" valuePropName="checked" noStyle>
              <Checkbox>Remember me</Checkbox>
            </Form.Item>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Login
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

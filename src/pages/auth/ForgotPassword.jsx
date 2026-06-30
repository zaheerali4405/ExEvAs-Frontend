import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Form, Input, Button, Radio, Alert, Typography } from "antd";
import { MailOutlined } from "@ant-design/icons";
import AuthLayout from "../../layouts/AuthLayout";
import { forgotPassword } from "../../api/authApi";

const { Title, Text } = Typography;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async ({ email, channel }) => {
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email, channel);
      navigate("/verify-reset-code", { state: { email } });
    } catch (err) {
      setError(
        err.response?.data?.message || "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Title level={3} style={{ marginBottom: 4 }}>
        Forgot Password
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
        Enter your email and choose where to receive your reset code.
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
            Send Reset Code
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: "center" }}>
        <Link to="/">Back to Login</Link>
      </div>
    </AuthLayout>
  );
}

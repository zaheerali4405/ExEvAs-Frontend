import { useEffect, useState } from "react";
import {
  Form, InputNumber, Switch, Checkbox, ColorPicker, TimePicker,
  Button, Alert, Typography, Divider, Row, Col, Spin,
} from "antd";
import {
  SafetyOutlined, LockOutlined, ClockCircleOutlined, BgColorsOutlined,
  ScheduleOutlined, TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getSystemSettings, updateSystemSettings } from "../../api/systemSettingsApi";
import { useTheme } from "../../context/ThemeContext";

const { Title, Text } = Typography;

function Section({ icon, title, children }) {
  return (
    <>
      <Title level={5} style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        {icon} {title}
      </Title>
      {children}
      <Divider />
    </>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <Row align="middle" style={{ marginBottom: 16 }}>
      <Col flex="1">
        <Text strong style={{ display: "block" }}>{label}</Text>
        {description && (
          <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
        )}
      </Col>
      <Col style={{ marginLeft: 16 }}>{children}</Col>
    </Row>
  );
}

const toHex = (v) => (typeof v === "string" ? v : v?.toHexString?.() ?? v);

// Window-time fields are stored/sent as "HH:mm" strings (see
// system-settings.service.ts's timeStringToDate/dateToTimeString), but the
// TimePicker needs dayjs objects — converted at the load/submit boundary
// only, same pattern as EventFormModal's startTime/endTime.
const toTimeValue = (hhmm) => (hhmm ? dayjs(hhmm, "HH:mm") : null);
const toTimeString = (v) => (v ? v.format("HH:mm") : null);

export default function SystemSettingsPage() {
  const { updateColors } = useTheme();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSystemSettings();
        form.setFieldsValue({
          maxFailedAttempts:    data.maxFailedAttempts,
          twoFaOnCreation:      data.twoFaOnCreation,
          passwordMinLength:    data.passwordMinLength,
          requireUppercase:     data.requireUppercase,
          requireNumbers:       data.requireNumbers,
          requireSpecialChars:  data.requireSpecialChars,
          tokenExpiryHours:     data.tokenExpiryHours,
          resetTokenExpiryMins: data.resetTokenExpiryMins,
          twoFaTokenExpiryMins: data.twoFaTokenExpiryMins,
          brandColor:           data.brandColor,
          lightPrimaryBg:       data.lightPrimaryBg,
          lightSecondaryBg:     data.lightSecondaryBg,
          darkPrimaryBg:        data.darkPrimaryBg,
          darkSecondaryBg:      data.darkSecondaryBg,
          examMaxEventsPerDay:           data.examMaxEventsPerDay,
          examMinDurationMinutes:        data.examMinDurationMinutes,
          examMaxDurationMinutes:        data.examMaxDurationMinutes,
          examMinGapMinutes:             data.examMinGapMinutes,
          examWindowStartTime:           toTimeValue(data.examWindowStartTime),
          examWindowEndTime:             toTimeValue(data.examWindowEndTime),
          moderationMeetingMaxEventsPerDay:   data.moderationMeetingMaxEventsPerDay,
          moderationMeetingMinDurationMinutes: data.moderationMeetingMinDurationMinutes,
          moderationMeetingMaxDurationMinutes: data.moderationMeetingMaxDurationMinutes,
          moderationMeetingMinGapMinutes:     data.moderationMeetingMinGapMinutes,
          moderationMeetingWindowStartTime:   toTimeValue(data.moderationMeetingWindowStartTime),
          moderationMeetingWindowEndTime:     toTimeValue(data.moderationMeetingWindowEndTime),
        });
      } catch (err) {
        setError(err.response?.data?.message || "Could not load system settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const handleFinish = async (values) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      // ColorPicker returns a Color object — convert to hex string.
      // TimePicker returns a dayjs object — convert to "HH:mm".
      const payload = {
        ...values,
        brandColor:       toHex(values.brandColor),
        lightPrimaryBg:   toHex(values.lightPrimaryBg),
        lightSecondaryBg: toHex(values.lightSecondaryBg),
        darkPrimaryBg:    toHex(values.darkPrimaryBg),
        darkSecondaryBg:  toHex(values.darkSecondaryBg),
        examWindowStartTime: toTimeString(values.examWindowStartTime),
        examWindowEndTime: toTimeString(values.examWindowEndTime),
        moderationMeetingWindowStartTime: toTimeString(values.moderationMeetingWindowStartTime),
        moderationMeetingWindowEndTime: toTimeString(values.moderationMeetingWindowEndTime),
      };
      const { data } = await updateSystemSettings(payload);
      // Propagate color changes to ThemeContext immediately
      updateColors({
        brandColor:       data.brandColor,
        lightPrimaryBg:   data.lightPrimaryBg,
        lightSecondaryBg: data.lightSecondaryBg,
        darkPrimaryBg:    data.darkPrimaryBg,
        darkSecondaryBg:  data.darkSecondaryBg,
      });
      setSuccess("System settings saved successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save system settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}
      {success && (
        <Alert message={success} type="success" showIcon closable onClose={() => setSuccess("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard style={{ maxWidth: 680, padding: 24 }}>
        <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>System Settings</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          These settings affect the entire application and all users.
        </Text>
        <Divider />

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>

            {/* ── Security ── */}
            <Section icon={<SafetyOutlined style={{ color: "#1AB394" }} />} title="Security">
              <SettingRow
                label="Max Failed Login Attempts"
                description="Account is locked after this many consecutive failed logins."
              >
                <Form.Item name="maxFailedAttempts" noStyle rules={[{ required: true }]}>
                  <InputNumber min={1} max={20} style={{ width: 80 }} />
                </Form.Item>
              </SettingRow>

              <SettingRow
                label="Require 2FA on Account Creation"
                description="New accounts will have two-factor authentication enabled by default."
              >
                <Form.Item name="twoFaOnCreation" noStyle valuePropName="checked">
                  <Switch />
                </Form.Item>
              </SettingRow>
            </Section>

            {/* ── Password Complexity ── */}
            <Section icon={<LockOutlined style={{ color: "#1AB394" }} />} title="Password Complexity">
              <SettingRow label="Minimum Password Length">
                <Form.Item name="passwordMinLength" noStyle rules={[{ required: true }]}>
                  <InputNumber min={6} max={64} style={{ width: 80 }} addonAfter="chars" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Require Uppercase Letter">
                <Form.Item name="requireUppercase" noStyle valuePropName="checked">
                  <Checkbox />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Require Number">
                <Form.Item name="requireNumbers" noStyle valuePropName="checked">
                  <Checkbox />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Require Special Character">
                <Form.Item name="requireSpecialChars" noStyle valuePropName="checked">
                  <Checkbox />
                </Form.Item>
              </SettingRow>
            </Section>

            {/* ── Token Expiry ── */}
            <Section icon={<ClockCircleOutlined style={{ color: "#1AB394" }} />} title="Token Expiry">
              <SettingRow
                label="Auth Token Expiry"
                description="How long a session JWT stays valid before the user must re-login."
              >
                <Form.Item name="tokenExpiryHours" noStyle rules={[{ required: true }]}>
                  <InputNumber min={1} max={168} style={{ width: 80 }} addonAfter="hours" />
                </Form.Item>
              </SettingRow>

              <SettingRow
                label="Password Reset Token Expiry"
                description="How long a password-reset link stays valid."
              >
                <Form.Item name="resetTokenExpiryMins" noStyle rules={[{ required: true }]}>
                  <InputNumber min={1} max={1440} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow
                label="2FA Code Expiry"
                description="How long a two-factor authentication code stays valid."
              >
                <Form.Item name="twoFaTokenExpiryMins" noStyle rules={[{ required: true }]}>
                  <InputNumber min={1} max={60} style={{ width: 80 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>
            </Section>

            {/* ── Appearance ── */}
            <Section icon={<BgColorsOutlined style={{ color: "#1AB394" }} />} title="Appearance">
              <SettingRow label="Brand / Primary Color" description="Used for buttons, links, and accents.">
                <Form.Item name="brandColor" noStyle>
                  <ColorPicker showText format="hex" />
                </Form.Item>
              </SettingRow>

              <Divider dashed style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Light Mode</Text>
              </Divider>

              <SettingRow label="Page Primary Background" description="Main card / container background.">
                <Form.Item name="lightPrimaryBg" noStyle>
                  <ColorPicker showText format="hex" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Page Secondary Background" description="Layout / outer area background.">
                <Form.Item name="lightSecondaryBg" noStyle>
                  <ColorPicker showText format="hex" />
                </Form.Item>
              </SettingRow>

              <Divider dashed style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Dark Mode</Text>
              </Divider>

              <SettingRow label="Page Primary Background">
                <Form.Item name="darkPrimaryBg" noStyle>
                  <ColorPicker showText format="hex" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Page Secondary Background">
                <Form.Item name="darkSecondaryBg" noStyle>
                  <ColorPicker showText format="hex" />
                </Form.Item>
              </SettingRow>
            </Section>

            {/* ── Exam Rules ── */}
            <Section icon={<ScheduleOutlined style={{ color: "#1AB394" }} />} title="Exam Rules">
              <SettingRow label="Max Events Per Day" description="Leave blank for no limit.">
                <Form.Item name="examMaxEventsPerDay" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Min Duration" description="Leave blank for no minimum.">
                <Form.Item name="examMinDurationMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Max Duration" description="Leave blank for no maximum.">
                <Form.Item name="examMaxDurationMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Min Gap Between Events" description="Leave blank for no minimum gap.">
                <Form.Item name="examMinGapMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Daily Window Start" description="Leave blank for no restriction.">
                <Form.Item name="examWindowStartTime" noStyle>
                  <TimePicker format="HH:mm" style={{ width: 110 }} />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Daily Window End" description="Leave blank for no restriction.">
                <Form.Item name="examWindowEndTime" noStyle>
                  <TimePicker format="HH:mm" style={{ width: 110 }} />
                </Form.Item>
              </SettingRow>
            </Section>

            {/* ── Moderation Meeting Rules ── */}
            <Section icon={<TeamOutlined style={{ color: "#1AB394" }} />} title="Moderation Meeting Rules">
              <SettingRow label="Max Events Per Day" description="Leave blank for no limit.">
                <Form.Item name="moderationMeetingMaxEventsPerDay" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Min Duration" description="Leave blank for no minimum.">
                <Form.Item name="moderationMeetingMinDurationMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Max Duration" description="Leave blank for no maximum.">
                <Form.Item name="moderationMeetingMaxDurationMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Min Gap Between Events" description="Leave blank for no minimum gap.">
                <Form.Item name="moderationMeetingMinGapMinutes" noStyle>
                  <InputNumber min={1} style={{ width: 90 }} addonAfter="mins" />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Daily Window Start" description="Leave blank for no restriction.">
                <Form.Item name="moderationMeetingWindowStartTime" noStyle>
                  <TimePicker format="HH:mm" style={{ width: 110 }} />
                </Form.Item>
              </SettingRow>

              <SettingRow label="Daily Window End" description="Leave blank for no restriction.">
                <Form.Item name="moderationMeetingWindowEndTime" noStyle>
                  <TimePicker format="HH:mm" style={{ width: 110 }} />
                </Form.Item>
              </SettingRow>
            </Section>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save Settings
              </Button>
            </div>
          </Form>
        )}
      </PageCard>
    </DashboardLayout>
  );
}

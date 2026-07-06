import { Avatar, Descriptions, Tag, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;
const PRIMARY = "#1AB394";

const fmt = (val) => val || "—";
const fmtDate = (val) => (val ? dayjs(val).format("DD MMM YYYY") : "—");
const fmtDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—");

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || null;

  const items = [
    { label: "First Name",      children: fmt(user.firstName) },
    { label: "Last Name",       children: fmt(user.lastName) },
    { label: "Username",        children: fmt(user.username) },
    { label: "Email",           children: fmt(user.email) },
    { label: "Phone",           children: fmt(user.phoneNo) },
    { label: "CNIC",            children: fmt(user.cnic) },
    { label: "Gender",          children: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : "—" },
    { label: "Date of Birth",   children: fmtDate(user.dateOfBirth) },
    { label: "Postal Address",  children: fmt(user.postalAddress), span: 2 },
    {
      label: "Two-Factor Auth",
      children: (
        <Tag color={user.twoFaEnabled ? "success" : "default"}>
          {user.twoFaEnabled ? "Enabled" : "Disabled"}
        </Tag>
      ),
    },
    {
      label: "Account Status",
      children: (
        <Tag color={user.isActive ? "success" : "default"}>
          {user.isActive ? "Active" : "Inactive"}
        </Tag>
      ),
    },
    {
      label: "Account Locked",
      children: (
        <Tag color={user.isLocked ? "error" : "success"}>
          {user.isLocked ? "Locked" : "Unlocked"}
        </Tag>
      ),
    },
    { label: "Member Since",    children: fmtDateTime(user.createdAt) },
    { label: "Last Updated",    children: fmtDateTime(user.updatedAt) },
  ];

  return (
    <DashboardLayout>
      <div
        style={{
          background: "#ffffff",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          overflow: "hidden",
        }}
      >
        {/* Header band */}
        <div
          style={{
            background: PRIMARY,
            padding: "32px 24px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <Avatar
            size={72}
            style={{ background: "#ffffff", color: PRIMARY, fontSize: 28, fontWeight: 700, flexShrink: 0 }}
            icon={!initials ? <UserOutlined /> : undefined}
          >
            {initials}
          </Avatar>
          <div>
            <Title level={4} style={{ margin: 0, color: "#ffffff" }}>
              {`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
              @{user.username || user.email}
            </Text>
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: 24 }}>
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 2, lg: 2 }}
            items={items}
            labelStyle={{ fontWeight: 600, width: 160 }}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

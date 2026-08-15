import { Avatar, Descriptions, Tag, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;
const PRIMARY = "#1AB394";

const fmt = (val) => val || "—";
const fmtDate = (val) => (val ? dayjs(val).format("DD MMM YYYY") : "—");
const fmtDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—");
const capitalize = (val) => (val ? val.charAt(0).toUpperCase() + val.slice(1) : "—");

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const employee = user.employee;
  const initials = (user.username || user.email)[0]?.toUpperCase() || null;

  const items = [
    { label: "Username",        children: fmt(user.username) },
    { label: "Email",           children: fmt(user.email) },
    { label: "User Type",       children: capitalize(user.userType) },
    ...(employee
      ? [
          { label: "First Name",     children: fmt(employee.firstName) },
          { label: "Last Name",      children: fmt(employee.lastName) },
          { label: "Gender",         children: capitalize(employee.gender) },
          { label: "Date of Birth",  children: fmtDate(employee.dateOfBirth) },
          { label: "CNIC",           children: fmt(employee.cnic) },
          { label: "Phone",          children: fmt(employee.phoneNo) },
          { label: "Department",     children: fmt(employee.department?.name) },
          { label: "Postal Address", children: fmt(employee.postalAddress), span: 2 },
        ]
      : []),
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
      <PageCard style={{ overflow: "hidden", padding: 0 }}>
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
              {user.username || "—"}
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
              {user.email}
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
      </PageCard>
    </DashboardLayout>
  );
}

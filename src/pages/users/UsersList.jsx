import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, Row, Col, Descriptions,
} from "antd";
import { EditOutlined, DownloadOutlined, EyeOutlined, ApartmentOutlined, IdcardOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getUsers, createUser, updateUser, setUserStatus } from "../../api/usersApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const USER_TYPE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "student",  label: "Student" },
];

const USER_TYPE_LABELS = {
  employee: "Employee",
  student:  "Student",
};

const searchableColumns = [
  { value: "email",    label: "Email" },
  { value: "username", label: "Username" },
  { value: "userType", label: "User Type" },
  { value: "status",   label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status")   return item.isActive ? "Active" : "Inactive";
  if (key === "userType") return USER_TYPE_LABELS[item.userType] ?? "";
  return item[key] ?? "";
};

const formatDateTime = (val) =>
  val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—";

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function UsersList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [users, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const displayName = (user) => user.username || user.email;

  const handleToggleStatus = (user) => {
    const activate = !user.isActive;
    Modal.confirm({
      title: activate ? "Activate User" : "Deactivate User",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${displayName(user)}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setUserStatus(user.id, activate);
          setUsers((prev) =>
            prev.map((u) => (u.id === user.id ? { ...u, isActive: activate } : u))
          );
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      email:    record.email,
      username: record.username,
      userType: record.userType,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateUser(editingRecord.id, values);
        setUsers((prev) => prev.map((u) =>
          u.id === editingRecord.id ? { ...data, isLocked: u.isLocked } : u
        ));
      } else {
        const { data } = await createUser(values);
        setUsers((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} user.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",     accessor: (_, i) => i + 1 },
        { label: "Username",  accessor: (r) => r.username || "" },
        { label: "Email",     accessor: (r) => r.email },
        { label: "User Type", accessor: (r) => USER_TYPE_LABELS[r.userType] ?? "" },
        { label: "Status",    accessor: (r) => (r.isActive ? "Active" : "Inactive") },
        { label: "Locked",    accessor: (r) => (r.isLocked ? "Yes" : "No") },
      ],
      "users"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    {
      title: "S.No.",
      width: 65,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "Username",
      dataIndex: "username",
      render: (val) => val || "—",
      sorter: (a, b) => (a.username ?? "").localeCompare(b.username ?? ""),
    },
    {
      title: "Email",
      dataIndex: "email",
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: "User Type",
      dataIndex: "userType",
      width: 120,
      render: (val) => USER_TYPE_LABELS[val] ?? val,
      sorter: (a, b) => a.userType.localeCompare(b.userType),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("user.activate") ? (
          <Tag
            color={isActive ? "success" : "default"}
            style={{ cursor: "pointer" }}
            onClick={() => handleToggleStatus(record)}
          >
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ),
    },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setViewRecord(record)}
            />
          </Tooltip>
          {can("user.update") && (
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
          )}
          {can("user-role.read-all") && (
            <Tooltip title="Manage Roles">
              <Button
                size="small"
                icon={<ApartmentOutlined />}
                onClick={() => navigate(`/user-roles?userId=${record.id}`)}
              />
            </Tooltip>
          )}
          {can("user-designation.read-all") && (
            <Tooltip title="Manage Designations">
              <Button
                size="small"
                icon={<IdcardOutlined />}
                onClick={() => navigate(`/user-designations?userId=${record.id}`)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("user.create") ? openAddModal : undefined}>
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      )}

      <PageCard>
        <div className="list-toolbar">
          <Select
            placeholder="Search by"
            allowClear
            options={searchableColumns}
            value={searchBy}
            onChange={(val) => setSearchBy(val ?? null)}
            style={{ width: "100%" }}
          />
          <Input
            placeholder="Search..."
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "auto" }}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ width: "100%" }}>
            Export Excel
          </Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns}
            loading={loading}
            size="small"
            pagination={false}
          />

          <div className="list-footer">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: "#595959" }}>Show</span>
                <Select
                  value={pageSize}
                  options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: `${n}` }))}
                  onChange={(val) => setPageSize(val)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: "#595959" }}>Entries</span>
              </div>
              <span style={{ fontSize: 13, color: "#8c8c8c" }}>
                Showing {startEntry}–{endEntry} of {filtered.length} Entries
              </span>
            </div>

            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filtered.length}
              onChange={(page) => setCurrentPage(page)}
              simple={isMobile}
              showQuickJumper={!isMobile}
              showSizeChanger={false}
            />
          </div>
        </div>
      </PageCard>

      {/* Add / Edit Modal */}
      <Modal
        title={editingRecord ? "Edit User" : "Add User"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnClose
        centered
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleModalFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ required: true, message: "Required." }, { type: "email", message: "Invalid email." }]}>
                <Input placeholder="Email address" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="username" label="Username">
                <Input placeholder="Username (optional)" />
              </Form.Item>
            </Col>
          </Row>

          {!editingRecord && (
            <Form.Item name="password" label="Password" rules={[{ required: true, message: "Required." }, { min: 8, message: "Min 8 characters." }]}>
              <Input.Password placeholder="Password" />
            </Form.Item>
          )}

          <Form.Item name="userType" label="User Type" rules={[{ required: true, message: "Required." }]}>
            <Select placeholder="Select user type" options={USER_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        title="User Details"
        open={!!viewRecord}
        onCancel={() => setViewRecord(null)}
        footer={null}
        centered
        width={600}
      >
        {viewRecord && (
          <Descriptions
            bordered
            column={1}
            size="small"
            style={{ marginTop: 16 }}
            labelStyle={{ fontWeight: 600, width: 160 }}
          >
            <Descriptions.Item label="Username">{viewRecord.username || "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{viewRecord.email}</Descriptions.Item>
            <Descriptions.Item label="User Type">{USER_TYPE_LABELS[viewRecord.userType] ?? viewRecord.userType}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={viewRecord.isActive ? "success" : "default"}>
                {viewRecord.isActive ? "Active" : "Inactive"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Account Locked">
              <Tag color={viewRecord.isLocked ? "error" : "success"}>
                {viewRecord.isLocked ? "Locked" : "Unlocked"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="2FA Enabled">
              <Tag color={viewRecord.twoFaEnabled ? "processing" : "default"}>
                {viewRecord.twoFaEnabled ? "Enabled" : "Disabled"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Created At">{formatDateTime(viewRecord.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Created By">
              {viewRecord.createdByUser?.username ?? viewRecord.createdBy ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Updated At">{formatDateTime(viewRecord.updatedAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </DashboardLayout>
  );
}

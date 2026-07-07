import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, DatePicker, Row, Col, Descriptions,
} from "antd";
import { EditOutlined, DownloadOutlined, EyeOutlined, ApartmentOutlined, IdcardOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getUsers, createUser, updateUser, setUserStatus, setUserLockStatus } from "../../api/usersApi";
import { exportToExcel } from "../../utils/exportExcel";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const GENDER_OPTIONS = [
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
  { value: "other",  label: "Other" },
];

const searchableColumns = [
  { value: "firstName", label: "First Name" },
  { value: "lastName",  label: "Last Name" },
  { value: "email",     label: "Email" },
  { value: "username",  label: "Username" },
  { value: "phoneNo",   label: "Phone" },
  { value: "status",    label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
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

  const handleToggleStatus = (user) => {
    const activate = !user.isActive;
    Modal.confirm({
      title: activate ? "Activate User" : "Deactivate User",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${user.firstName} ${user.lastName ?? ""}"?`,
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

  const handleToggleLock = (user) => {
    const lock = !user.isLocked;
    Modal.confirm({
      title: lock ? "Lock User" : "Unlock User",
      content: `Are you sure you want to ${lock ? "lock" : "unlock"} "${user.firstName} ${user.lastName ?? ""}"?`,
      okText: lock ? "Lock" : "Unlock",
      okButtonProps: {
        danger: lock,
        style: !lock ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setUserLockStatus(user.id, lock);
          setUsers((prev) =>
            prev.map((u) => (u.id === user.id ? { ...u, isLocked: lock } : u))
          );
        } catch (err) {
          setError(err.response?.data?.message || "Could not update lock status.");
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
      firstName:     record.firstName,
      lastName:      record.lastName,
      email:         record.email,
      username:      record.username,
      gender:        record.gender,
      dateOfBirth:   record.dateOfBirth ? dayjs(record.dateOfBirth) : null,
      cnic:          record.cnic,
      phoneNo:       record.phoneNo,
      postalAddress: record.postalAddress,
      isLocked:      record.isLocked ?? false,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = {
        ...values,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format("YYYY-MM-DD") : undefined,
      };
      if (editingRecord) {
        const { data } = await updateUser(editingRecord.id, payload);
        setUsers((prev) => prev.map((u) =>
          u.id === editingRecord.id ? { ...data, isLocked: u.isLocked } : u
        ));
      } else {
        const { data } = await createUser(payload);
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
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "First Name", accessor: (r) => r.firstName },
        { label: "Last Name",  accessor: (r) => r.lastName || "" },
        { label: "Username",   accessor: (r) => r.username || "" },
        { label: "Email",      accessor: (r) => r.email },
        { label: "Phone",      accessor: (r) => r.phoneNo },
        { label: "Gender",     accessor: (r) => r.gender },
        { label: "CNIC",       accessor: (r) => r.cnic },
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
        { label: "Locked",     accessor: (r) => (r.isLocked ? "Yes" : "No") },
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
      title: "Name",
      render: (_, r) => `${r.firstName}${r.lastName ? " " + r.lastName : ""}`,
      sorter: (a, b) => a.firstName.localeCompare(b.firstName),
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
      title: "Phone",
      dataIndex: "phoneNo",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) => (
        <Tag
          color={isActive ? "success" : "default"}
          style={{ cursor: "pointer" }}
          onClick={() => handleToggleStatus(record)}
        >
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
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Tooltip title="Manage Roles">
            <Button
              size="small"
              icon={<ApartmentOutlined />}
              onClick={() => navigate(`/user-roles?userId=${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Manage Designations">
            <Button
              size="small"
              icon={<IdcardOutlined />}
              onClick={() => navigate(`/user-designations?userId=${record.id}`)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={openAddModal}>
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
        width={640}
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
              <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: "Required." }, { max: 100 }]}>
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last name (optional)" />
              </Form.Item>
            </Col>
          </Row>

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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gender" label="Gender" rules={[{ required: true, message: "Required." }]}>
                <Select placeholder="Select gender" options={GENDER_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dateOfBirth" label="Date of Birth" rules={[{ required: true, message: "Required." }]}>
                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="cnic"
                label="CNIC"
                rules={[
                  { required: true, message: "Required." },
                  { pattern: /^\d{5}-\d{7}-\d{1}$/, message: "Format: XXXXX-XXXXXXX-X" },
                ]}
              >
                <Input placeholder="XXXXX-XXXXXXX-X" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phoneNo" label="Phone No." rules={[{ required: true, message: "Required." }]}>
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="postalAddress" label="Postal Address" rules={[{ required: true, message: "Required." }]}>
            <Input placeholder="Postal address" />
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
            <Descriptions.Item label="First Name">{viewRecord.firstName}</Descriptions.Item>
            <Descriptions.Item label="Last Name">{viewRecord.lastName || "—"}</Descriptions.Item>
            <Descriptions.Item label="Username">{viewRecord.username || "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{viewRecord.email}</Descriptions.Item>
            <Descriptions.Item label="Gender">{viewRecord.gender}</Descriptions.Item>
            <Descriptions.Item label="Date of Birth">
              {viewRecord.dateOfBirth ? dayjs(viewRecord.dateOfBirth).format("DD MMM YYYY") : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="CNIC">{viewRecord.cnic}</Descriptions.Item>
            <Descriptions.Item label="Phone">{viewRecord.phoneNo}</Descriptions.Item>
            <Descriptions.Item label="Postal Address">{viewRecord.postalAddress}</Descriptions.Item>
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

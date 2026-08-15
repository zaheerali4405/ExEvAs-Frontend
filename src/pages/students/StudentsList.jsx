import { useState, useEffect, useMemo } from "react";
import {
  Table,
  Input,
  Select,
  Button,
  Tag,
  Alert,
  Space,
  Tooltip,
  Pagination,
  Modal,
  Form,
  DatePicker,
  Row,
  Col,
  Typography,
  Divider,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getStudents,
  createStudent,
  updateStudent,
  setStudentStatus,
} from "../../api/studentsApi";
import { getClasses } from "../../api/classesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const searchableColumns = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "rollNo", label: "Roll No." },
  { value: "registrationNo", label: "Registration No." },
  { value: "cnic", label: "CNIC" },
  { value: "phoneNo", label: "Phone" },
  { value: "class", label: "Class" },
  { value: "status", label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "class") return item.class?.fullName ?? "";
  return item[key] ?? "";
};

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function StudentsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getStudents();
        setStudents(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load students.");
      } finally {
        setLoading(false);
      }

      if (can("class.read-all")) {
        try {
          const { data } = await getClasses();
          setClasses(data);
        } catch {
          // Non-fatal: the class dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term),
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [students, searchBy, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Student" : "Deactivate Student",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${record.firstName} ${record.lastName ?? ""}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate
          ? { background: "#1AB394", borderColor: "#1AB394" }
          : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setStudentStatus(record.id, activate);
          setStudents((prev) =>
            prev.map((s) =>
              s.id === record.id ? { ...s, isActive: activate } : s,
            ),
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
      classId: record.classId,
      firstName: record.firstName,
      lastName: record.lastName,
      rollNo: record.rollNo,
      registrationNo: record.registrationNo,
      gender: record.gender,
      dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : null,
      cnic: record.cnic,
      phoneNo: record.phoneNo,
      postalAddress: record.postalAddress,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = {
        ...values,
        dateOfBirth: values.dateOfBirth
          ? values.dateOfBirth.format("YYYY-MM-DD")
          : undefined,
      };
      if (editingRecord) {
        const { data } = await updateStudent(editingRecord.id, payload);
        setStudents((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      } else {
        const { data } = await createStudent(payload);
        setStudents((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Could not ${editingRecord ? "update" : "create"} student.`,
      );
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.", accessor: (_, i) => i + 1 },
        { label: "First Name", accessor: (r) => r.firstName },
        { label: "Last Name", accessor: (r) => r.lastName || "" },
        { label: "Username", accessor: (r) => r.user?.username || "" },
        { label: "Email", accessor: (r) => r.user?.email || "" },
        { label: "Roll No.", accessor: (r) => r.rollNo },
        { label: "Registration No.", accessor: (r) => r.registrationNo },
        { label: "Gender", accessor: (r) => r.gender },
        { label: "CNIC", accessor: (r) => r.cnic },
        { label: "Phone", accessor: (r) => r.phoneNo },
        { label: "Class", accessor: (r) => r.class?.fullName || "" },
        {
          label: "Status",
          accessor: (r) => (r.isActive ? "Active" : "Inactive"),
        },
      ],
      "students",
    );
  };

  const startEntry =
    filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
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
      title: "Roll No.",
      dataIndex: "rollNo",
      width: 120,
    },
    {
      title: "Registration No.",
      dataIndex: "registrationNo",
      width: 150,
    },
    {
      title: "Class",
      width: 180,
      render: (_, r) => r.class?.fullName ?? "—",
      sorter: (a, b) =>
        (a.class?.fullName ?? "").localeCompare(b.class?.fullName ?? ""),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("student.activate") ? (
          <Tag
            color={isActive ? "success" : "default"}
            style={{ cursor: "pointer" }}
            onClick={() => handleToggle(record)}
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
      width: 90,
      align: "center",
      render: (_, record) => (
        <Space>
          {can("student.update") && (
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const classOptions = useMemo(
    () =>
      classes
        .filter((c) => c.isActive)
        .map((c) => ({ value: c.id, label: c.fullName })),
    [classes],
  );

  return (
    <DashboardLayout onAdd={can("student.create") ? openAddModal : undefined}>
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
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            style={{ width: "100%" }}
          >
            Export Excel
          </Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={filtered.slice(
              (currentPage - 1) * pageSize,
              currentPage * pageSize,
            )}
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
                  options={PAGE_SIZE_OPTIONS.map((n) => ({
                    value: n,
                    label: `${n}`,
                  }))}
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

      <Modal
        title={editingRecord ? "Edit Student" : "Add Student"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
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
          {editingRecord && (
            <Form.Item label="Linked Account">
              <Text type="secondary">
                {editingRecord.user?.username
                  ? `${editingRecord.user.username} (${editingRecord.user.email})`
                  : editingRecord.user?.email}
              </Text>
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="firstName"
                label="First Name"
                rules={[{ required: true, message: "Required." }, { max: 100 }]}
              >
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
              <Form.Item
                name="rollNo"
                label="Roll No."
                rules={[{ required: true, message: "Required." }, { max: 50 }]}
              >
                <Input placeholder="Roll number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="registrationNo"
                label="Registration No."
                rules={[{ required: true, message: "Required." }, { max: 50 }]}
              >
                <Input placeholder="Registration number" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="gender"
                label="Gender"
                rules={[{ required: true, message: "Required." }]}
              >
                <Select placeholder="Select gender" options={GENDER_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="dateOfBirth"
                label="Date of Birth"
                rules={[{ required: true, message: "Required." }]}
              >
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
                  {
                    pattern: /^\d{5}-\d{7}-\d{1}$/,
                    message: "Format: XXXXX-XXXXXXX-X",
                  },
                ]}
              >
                <Input placeholder="XXXXX-XXXXXXX-X" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phoneNo"
                label="Phone No."
                rules={[{ required: true, message: "Required." }]}
              >
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="postalAddress"
                label="Postal Address"
                rules={[{ required: true, message: "Required." }]}
              >
                <Input placeholder="Postal address" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="classId"
                label="Class"
                rules={[{ required: true, message: "Please select a class." }]}
              >
                <Select
                  placeholder="Select class"
                  options={classOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          {!editingRecord && (
            <>
              <Divider>Login Account</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: "Required." },
                      { type: "email", message: "Invalid email." },
                    ]}
                  >
                    <Input placeholder="Email address" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="password"
                    label="Password"
                    rules={[
                      { required: true, message: "Required." },
                      { min: 8, message: "Min 8 characters." },
                    ]}
                  >
                    <Input.Password placeholder="Password" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

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
  Descriptions,
} from "antd";
import { EditOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
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
import { getSessions } from "../../api/sessionsApi";
import { getPrograms } from "../../api/programsApi";
import { getDegreeLevels } from "../../api/degreeLevelsApi";
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

// The Roll No. field's locked prefix, taken from the selected class's
// program short name (e.g. program shortName "M" -> prefix "M-").
const classPrefix = (cls) =>
  cls?.program ? `${cls.program.shortName || cls.program.fullName}-` : "";

const classLabel = (cls) => (cls ? cls.shortName || cls.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "class") return classLabel(item.class);
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
  const [sessions, setSessions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [degreeLevels, setDegreeLevels] = useState([]);
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
  const selectedSessionId = Form.useWatch("sessionId", form);
  const selectedProgramId = Form.useWatch("programId", form);
  const selectedDegreeLevelId = Form.useWatch("degreeLevelId", form);
  const selectedClassId = Form.useWatch("classId", form);

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
          // Non-fatal: classId just can't be auto-resolved.
        }
      }

      if (can("session.read-all")) {
        try {
          const { data } = await getSessions();
          setSessions(data);
        } catch {
          // Non-fatal: the session dropdown just stays empty.
        }
      }

      if (can("program.read-all")) {
        try {
          const { data } = await getPrograms();
          setPrograms(data);
        } catch {
          // Non-fatal: the program dropdown just stays empty.
        }
      }

      if (can("degree-level.read-all")) {
        try {
          const { data } = await getDegreeLevels();
          setDegreeLevels(data);
        } catch {
          // Non-fatal: the degree level dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Class is fully determined by Session + Program + Degree Level (Class has
  // a unique constraint on that triple) — no separate Class dropdown, it's
  // resolved silently and stored in a hidden form field.
  const matchedClass = useMemo(() => {
    if (!selectedSessionId || !selectedProgramId || !selectedDegreeLevelId) return null;
    return (
      classes.find(
        (c) =>
          c.isActive &&
          c.sessionId === selectedSessionId &&
          c.programId === selectedProgramId &&
          c.degreeLevelId === selectedDegreeLevelId
      ) ?? null
    );
  }, [classes, selectedSessionId, selectedProgramId, selectedDegreeLevelId]);

  useEffect(() => {
    form.setFieldValue("classId", matchedClass?.id);
  }, [matchedClass, form]);

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

  const openViewModal = (record) => {
    setViewRecord(record);
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    const prefix = classPrefix(record.class);
    form.setFieldsValue({
      // Student no longer carries its own sessionId — the Session field
      // here is purely a UI cascade helper to (re-)resolve classId, so it's
      // seeded from the linked class's own session instead.
      sessionId: record.class?.session?.id,
      programId: record.class?.program?.id,
      degreeLevelId: record.class?.degreeLevel?.id,
      classId: record.classId,
      firstName: record.firstName,
      lastName: record.lastName,
      rollNoSuffix: record.rollNo.startsWith(prefix)
        ? record.rollNo.slice(prefix.length)
        : record.rollNo,
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
    if (!values.classId) {
      setError(
        "No class exists for the selected Session, Program and Degree Level combination. Create it in the Classes module first."
      );
      return;
    }
    setModalLoading(true);
    try {
      // sessionId/programId/degreeLevelId only exist to resolve classId in
      // this form's own cascade — Student itself has no sessionId of its
      // own, and programId/degreeLevelId are reached through classId.
      const { rollNoSuffix, sessionId, programId, degreeLevelId, ...rest } = values;
      const selectedClass = classes.find((c) => c.id === values.classId);
      // registrationNo/gender/cnic/phoneNo/postalAddress are optional now —
      // a field the user focused then left blank comes through as "" (not
      // undefined), which would otherwise still trip e.g. the CNIC format
      // check server-side. Blank out to undefined so "left empty" really
      // means "not provided".
      ["registrationNo", "gender", "cnic", "phoneNo", "postalAddress"].forEach((key) => {
        if (rest[key] === "") rest[key] = undefined;
      });
      const payload = {
        ...rest,
        rollNo: `${classPrefix(selectedClass)}${rollNoSuffix || ""}`,
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
        { label: "Registration No.", accessor: (r) => r.registrationNo || "" },
        { label: "Gender", accessor: (r) => r.gender || "" },
        { label: "CNIC", accessor: (r) => r.cnic || "" },
        { label: "Phone", accessor: (r) => r.phoneNo || "" },
        { label: "Class", accessor: (r) => classLabel(r.class) },
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
      width: 170,
    },
    {
      title: "Class",
      width: 180,
      render: (_, r) => classLabel(r.class) || "—",
      sorter: (a, b) => classLabel(a.class).localeCompare(classLabel(b.class)),
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
      width: 120,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="View">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openViewModal(record)}
            />
          </Tooltip>
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

  const sessionOptions = useMemo(
    () => sessions.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })),
    [sessions],
  );

  const programOptions = useMemo(
    () => programs.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.fullName })),
    [programs],
  );

  const degreeLevelOptions = useMemo(
    () => degreeLevels.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.fullName })),
    [degreeLevels],
  );

  const rollNoPrefix = useMemo(
    () => classPrefix(classes.find((c) => c.id === selectedClassId)),
    [classes, selectedClassId],
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
        destroyOnHidden
        centered
        width={900}
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

          {/* classId is resolved silently from Session + Program + Degree Level
              (Class is uniquely determined by that triple) — no visible Class field. */}
          <Form.Item name="classId" hidden>
            <Input />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="sessionId"
                label="Session"
                rules={[{ required: true, message: "Please select a session." }]}
              >
                <Select
                  placeholder="Select session"
                  options={sessionOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="programId"
                label="Program"
                rules={[{ required: true, message: "Please select a program." }]}
              >
                <Select
                  placeholder="Select program"
                  options={programOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="degreeLevelId"
                label="Degree Level"
                rules={[{ required: true, message: "Please select a degree level." }]}
              >
                <Select
                  placeholder="Select degree level"
                  options={degreeLevelOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          {selectedSessionId && selectedProgramId && selectedDegreeLevelId && !matchedClass && (
            <Alert
              type="error"
              showIcon
              message="No class exists for this Session, Program and Degree Level combination. Create it in the Classes module first."
              style={{ marginBottom: 16 }}
            />
          )}

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="rollNoSuffix"
                label="Roll No."
                rules={[{ required: true, message: "Required." }, { max: 50 }]}
              >
                <Input addonBefore={rollNoPrefix || "—"} placeholder="e.g. 25-001" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="registrationNo"
                label="Registration No."
                rules={[{ max: 50 }]}
              >
                <Input placeholder="Registration number (optional for now)" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="firstName"
                label="First Name"
                rules={[{ required: true, message: "Required." }, { max: 100 }]}
              >
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last name (optional)" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="gender" label="Gender (optional for now)">
                <Select placeholder="Select gender" options={GENDER_OPTIONS} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dateOfBirth" label="Date of Birth (optional for now)">
                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="cnic"
                label="CNIC (optional for now)"
                rules={[
                  {
                    pattern: /^\d{5}-\d{7}-\d{1}$/,
                    message: "Format: XXXXX-XXXXXXX-X",
                  },
                ]}
              >
                <Input placeholder="XXXXX-XXXXXXX-X" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="phoneNo" label="Phone No. (optional for now)">
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="postalAddress" label="Postal Address (optional for now)">
                <Input placeholder="Postal address" />
              </Form.Item>
            </Col>
          </Row>

          {!editingRecord && (
            <>
              <Divider>Login Account</Divider>
              <Row gutter={16}>
                <Col span={8}>
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
                <Col span={8}>
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

      {/* View Details Modal */}
      <Modal
        title="Student Details"
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
            <Descriptions.Item label="Full Name">
              {viewRecord.firstName}{viewRecord.lastName ? ` ${viewRecord.lastName}` : ""}
            </Descriptions.Item>
            <Descriptions.Item label="Username">{viewRecord.user?.username || "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{viewRecord.user?.email || "—"}</Descriptions.Item>
            <Descriptions.Item label="Roll No.">{viewRecord.rollNo}</Descriptions.Item>
            <Descriptions.Item label="Registration No.">{viewRecord.registrationNo || "—"}</Descriptions.Item>
            <Descriptions.Item label="Class">{classLabel(viewRecord.class) || "—"}</Descriptions.Item>
            <Descriptions.Item label="Gender">
              {GENDER_OPTIONS.find((g) => g.value === viewRecord.gender)?.label || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Date of Birth">
              {viewRecord.dateOfBirth ? dayjs(viewRecord.dateOfBirth).format("DD MMM YYYY") : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="CNIC">{viewRecord.cnic || "—"}</Descriptions.Item>
            <Descriptions.Item label="Phone No.">{viewRecord.phoneNo || "—"}</Descriptions.Item>
            <Descriptions.Item label="Postal Address">{viewRecord.postalAddress || "—"}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={viewRecord.isActive ? "success" : "default"}>
                {viewRecord.isActive ? "Active" : "Inactive"}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </DashboardLayout>
  );
}

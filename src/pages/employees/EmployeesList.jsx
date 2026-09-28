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
  getEmployees,
  createEmployee,
  updateEmployee,
  setEmployeeStatus,
} from "../../api/employeesApi";
import { getDepartments } from "../../api/departmentsApi";
import { getDesignations } from "../../api/designationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const EMPLOYEE_CATEGORY_OPTIONS = [
  { value: "faculty", label: "Faculty" },
  { value: "administrative", label: "Administrative Staff" },
];

const searchableColumns = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "cnic", label: "CNIC" },
  { value: "phoneNo", label: "Phone" },
  { value: "department", label: "Department" },
  { value: "status", label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "department") return item.department?.name ?? "";
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

export default function EmployeesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
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
        const { data } = await getEmployees();
        setEmployees(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load employees.");
      } finally {
        setLoading(false);
      }

      if (can("department.read-all")) {
        try {
          const { data } = await getDepartments();
          setDepartments(data);
        } catch {
          // Non-fatal: the department dropdown just stays empty.
        }
      }

      if (can("designation.read-all")) {
        try {
          const { data } = await getDesignations();
          setDesignations(data);
        } catch {
          // Non-fatal: the designation dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term),
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [employees, searchBy, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Employee" : "Deactivate Employee",
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
          await setEmployeeStatus(record.id, activate);
          setEmployees((prev) =>
            prev.map((e) =>
              e.id === record.id ? { ...e, isActive: activate } : e,
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
      firstName: record.firstName,
      lastName: record.lastName,
      gender: record.gender,
      dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : null,
      cnic: record.cnic,
      phoneNo: record.phoneNo,
      postalAddress: record.postalAddress,
      departmentId: record.departmentId,
      employeeCategory: record.employeeCategory,
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
        const { data } = await updateEmployee(editingRecord.id, payload);
        setEmployees((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      } else {
        const { data } = await createEmployee(payload);
        setEmployees((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Could not ${editingRecord ? "update" : "create"} employee.`,
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
        { label: "Gender", accessor: (r) => r.gender },
        { label: "CNIC", accessor: (r) => r.cnic },
        { label: "Phone", accessor: (r) => r.phoneNo },
        { label: "Department", accessor: (r) => r.department?.name || "" },
        {
          label: "Category",
          accessor: (r) => EMPLOYEE_CATEGORY_OPTIONS.find((o) => o.value === r.employeeCategory)?.label || "",
        },
        {
          label: "Status",
          accessor: (r) => (r.isActive ? "Active" : "Inactive"),
        },
      ],
      "employees",
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
      title: "Username",
      render: (_, r) => r.user?.username || r.user?.email || "—",
    },
    {
      title: "CNIC",
      dataIndex: "cnic",
    },
    {
      title: "Phone",
      dataIndex: "phoneNo",
    },
    {
      title: "Department",
      width: 180,
      render: (_, r) => r.department?.name ?? "—",
      sorter: (a, b) =>
        (a.department?.name ?? "").localeCompare(b.department?.name ?? ""),
    },
    {
      title: "Category",
      width: 150,
      render: (_, r) => EMPLOYEE_CATEGORY_OPTIONS.find((o) => o.value === r.employeeCategory)?.label ?? "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("employee.activate") ? (
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
          {can("employee.update") && (
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

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive)
        .map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const designationOptions = useMemo(
    () =>
      designations
        .filter((d) => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    [designations],
  );

  return (
    <DashboardLayout onAdd={can("employee.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Employee" : "Add Employee"}
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
                name="departmentId"
                label="Department"
                rules={[
                  { required: true, message: "Please select a department." },
                ]}
              >
                <Select
                  placeholder="Select department"
                  options={departmentOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="employeeCategory"
                label="Employee Category"
                rules={[
                  { required: true, message: "Please select an employee category." },
                ]}
              >
                <Select placeholder="Select category" options={EMPLOYEE_CATEGORY_OPTIONS} />
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
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item
                    name="designationIds"
                    label="Designations"
                    tooltip={infoTip(
                      "The posts this employee holds. The first one becomes their main designation, and each one gives them the roles mapped to it on the Designation Roles page. Can be left empty and assigned later on the User Designations page."
                    )}
                  >
                    <Select
                      mode="multiple"
                      placeholder="Select designations (optional)"
                      options={designationOptions}
                      showSearch
                      optionFilterProp="label"
                      maxTagCount="responsive"
                    />
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

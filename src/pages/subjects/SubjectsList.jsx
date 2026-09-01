import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getSubjects, createSubject, updateSubject, setSubjectStatus } from "../../api/subjectsApi";
import { getDepartments } from "../../api/departmentsApi";
import { getInstitutes } from "../../api/institutesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "fullName",   label: "Full Name" },
  { value: "shortName",  label: "Short Name" },
  { value: "department", label: "Department" },
  { value: "institute",  label: "Institute" },
  { value: "status",     label: "Status" },
];

const instituteLabel = (institute) => (institute ? institute.shortName || institute.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status")     return item.isActive ? "Active" : "Inactive";
  if (key === "department") return item.department?.name ?? "";
  if (key === "institute")  return instituteLabel(item.institute);
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

export default function SubjectsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterInstituteId, setFilterInstituteId] = useState(null);
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const selectedInstituteId = Form.useWatch("instituteId", form);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getSubjects();
        setSubjects(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load subjects.");
      } finally {
        setLoading(false);
      }

      if (can("institute.read-all")) {
        try {
          const { data } = await getInstitutes();
          setInstitutes(data);
        } catch {
          // Non-fatal: the institute dropdown just stays empty.
        }
      }

      if (can("department.read-all")) {
        try {
          const { data } = await getDepartments();
          setDepartments(data);
        } catch {
          // Non-fatal: the department dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const scoped = filterInstituteId
      ? subjects.filter((item) => item.instituteId === filterInstituteId)
      : subjects;
    if (!searchTerm.trim()) return scoped;
    const term = searchTerm.toLowerCase();
    return scoped.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [subjects, filterInstituteId, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [filterInstituteId, searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Subject" : "Deactivate Subject",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${record.fullName}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setSubjectStatus(record.id, activate);
          setSubjects((prev) =>
            prev.map((s) => (s.id === record.id ? { ...s, isActive: activate } : s))
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
      fullName:     record.fullName,
      shortName:    record.shortName,
      instituteId:  record.instituteId,
      departmentId: record.departmentId,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateSubject(editingRecord.id, values);
        setSubjects((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      } else {
        const { data } = await createSubject(values);
        setSubjects((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} subject.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Full Name",  accessor: (r) => r.fullName },
        { label: "Short Name", accessor: (r) => r.shortName || "" },
        { label: "Department", accessor: (r) => r.department?.name || "" },
        { label: "Institute",  accessor: (r) => instituteLabel(r.institute) },
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "subjects"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    {
      title: "S.No.",
      width: 70,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "Full Name",
      dataIndex: "fullName",
      sorter: (a, b) => a.fullName.localeCompare(b.fullName),
    },
    {
      title: "Short Name",
      dataIndex: "shortName",
      width: 130,
      render: (val) => val || "—",
    },
    {
      title: "Department",
      width: 200,
      render: (_, r) => r.department?.name ?? "—",
      sorter: (a, b) => (a.department?.name ?? "").localeCompare(b.department?.name ?? ""),
    },
    {
      title: "Institute",
      width: 200,
      render: (_, r) => instituteLabel(r.institute) || "—",
      sorter: (a, b) => instituteLabel(a.institute).localeCompare(instituteLabel(b.institute)),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("subject.activate") ? (
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
          {can("subject.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const instituteOptions = useMemo(
    () => institutes.filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.fullName })),
    [institutes]
  );

  const instituteFilterOptions = useMemo(
    () => institutes.filter((i) => i.isActive).map((i) => ({ value: i.id, label: instituteLabel(i) })),
    [institutes]
  );

  // Departments belonging to the currently selected institute — either a
  // top-level department (operates college-wide, no sub-department split)
  // or a sub-department specialized for this institute.
  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive && d.instituteId === selectedInstituteId)
        .map((d) => ({ value: d.id, label: d.name })),
    [departments, selectedInstituteId]
  );

  return (
    <DashboardLayout onAdd={can("subject.create") ? openAddModal : undefined}>
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
            placeholder="Filter by institute"
            allowClear
            options={instituteFilterOptions}
            value={filterInstituteId}
            onChange={(val) => setFilterInstituteId(val ?? null)}
            showSearch
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            style={{ width: "100%" }}
          />
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

      <Modal
        title={editingRecord ? "Edit Subject" : "Add Subject"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnClose
        centered
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleModalFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="fullName"
            label="Full Name"
            rules={[
              { required: true, message: "Please enter the subject's full name." },
              { max: 200, message: "Maximum 200 characters." },
            ]}
          >
            <Input placeholder="e.g. Anatomy-I" />
          </Form.Item>

          <Form.Item
            name="shortName"
            label="Short Name"
            rules={[{ max: 50, message: "Maximum 50 characters." }]}
          >
            <Input placeholder="e.g. Anat-I" />
          </Form.Item>

          <Form.Item
            name="instituteId"
            label="Institute"
            rules={[{ required: true, message: "Please select an institute." }]}
          >
            <Select
              placeholder="Select institute"
              options={instituteOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
              onChange={() => form.setFieldValue("departmentId", undefined)}
            />
          </Form.Item>

          <Form.Item
            name="departmentId"
            label="Department"
            rules={[{ required: true, message: "Please select the teaching department." }]}
            extra={!selectedInstituteId ? "Select an institute first." : undefined}
          >
            <Select
              placeholder="Select department"
              options={departmentOptions}
              disabled={!selectedInstituteId}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

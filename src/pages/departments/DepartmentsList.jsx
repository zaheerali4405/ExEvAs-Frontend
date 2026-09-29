import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getDepartments, createDepartment, updateDepartment, setDepartmentStatus } from "../../api/departmentsApi";
import { getInstitutes } from "../../api/institutesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/useAuth";
import { loadOptions } from "../../utils/loadOptions";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const DEPARTMENT_CATEGORY_OPTIONS = [
  { value: "academic",         label: "Academic" },
  { value: "academic_support", label: "Academic Support" },
  { value: "administration",   label: "Administration" },
];
const DEPARTMENT_CATEGORY_LABELS = Object.fromEntries(DEPARTMENT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));
const DEPARTMENT_CATEGORY_COLORS = {
  academic: "blue",
  academic_support: "purple",
  administration: "orange",
};

const searchableColumns = [
  { value: "name",      label: "Name" },
  { value: "shortName", label: "Short Name" },
  { value: "category",  label: "Category" },
  { value: "institute", label: "Institute" },
  { value: "parent",    label: "Parent" },
  { value: "status",    label: "Status" },
];

const instituteLabel = (institute) => (institute ? institute.shortName || institute.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status")    return item.isActive ? "Active" : "Inactive";
  if (key === "category")  return DEPARTMENT_CATEGORY_LABELS[item.category] ?? "";
  if (key === "institute") return instituteLabel(item.institute);
  if (key === "parent")    return item.parent?.name ?? "";
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

export default function DepartmentsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
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

  useEffect(() => {
    let ignore = false;
    const isStale = () => ignore;
    getDepartments()
      .then(({ data }) => { if (!ignore) setDepartments(data); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Could not load departments."); })
      .finally(() => { if (!ignore) setLoading(false); });
    loadOptions(can("institute.read-all"), getInstitutes, setInstitutes, isStale);
    return () => { ignore = true; };
  }, [can]);

  const filtered = useMemo(() => {
    const scoped = filterInstituteId
      ? departments.filter((item) => item.instituteId === filterInstituteId)
      : departments;
    if (!searchTerm.trim()) return scoped;
    const term = searchTerm.toLowerCase();
    return scoped.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [departments, filterInstituteId, searchBy, searchTerm]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Department" : "Deactivate Department",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${record.name}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setDepartmentStatus(record.id, activate);
          setDepartments((prev) =>
            prev.map((d) => (d.id === record.id ? { ...d, isActive: activate } : d))
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
      name:        record.name,
      shortName:   record.shortName,
      category:    record.category,
      instituteId: record.instituteId,
      parentId:    record.parentId,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = { ...values, parentId: values.parentId ?? null };
      if (editingRecord) {
        const { data } = await updateDepartment(editingRecord.id, payload);
        setDepartments((prev) => prev.map((d) => (d.id === data.id ? data : d)));
      } else {
        const { data } = await createDepartment(payload);
        setDepartments((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} department.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Name",       accessor: (r) => r.name },
        { label: "Short Name", accessor: (r) => r.shortName || "" },
        { label: "Category",   accessor: (r) => DEPARTMENT_CATEGORY_LABELS[r.category] ?? "" },
        { label: "Institute",  accessor: (r) => instituteLabel(r.institute) },
        { label: "Parent",     accessor: (r) => r.parent?.name || "" },
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "departments"
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
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Short Name",
      dataIndex: "shortName",
      width: 130,
      render: (val) => val || "—",
    },
    {
      title: "Category",
      width: 150,
      render: (_, r) => <Tag color={DEPARTMENT_CATEGORY_COLORS[r.category]}>{DEPARTMENT_CATEGORY_LABELS[r.category] ?? r.category}</Tag>,
      sorter: (a, b) => (DEPARTMENT_CATEGORY_LABELS[a.category] ?? "").localeCompare(DEPARTMENT_CATEGORY_LABELS[b.category] ?? ""),
    },
    {
      title: "Institute",
      width: 220,
      render: (_, r) => instituteLabel(r.institute) || "—",
      sorter: (a, b) => instituteLabel(a.institute).localeCompare(instituteLabel(b.institute)),
    },
    {
      title: "Parent",
      width: 200,
      render: (_, r) => r.parent?.name ?? "—",
      sorter: (a, b) => (a.parent?.name ?? "").localeCompare(b.parent?.name ?? ""),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("department.activate") ? (
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
          {can("department.update") && (
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

  const parentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive && d.id !== editingRecord?.id)
        .map((d) => ({ value: d.id, label: d.name })),
    [departments, editingRecord]
  );

  return (
    <DashboardLayout onAdd={can("department.create") ? openAddModal : undefined}>
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
            onChange={(val) => { setFilterInstituteId(val ?? null); setCurrentPage(1); }}
            showSearch
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            style={{ width: "100%" }}
          />
          <Select
            placeholder="Search by"
            allowClear
            options={searchableColumns}
            value={searchBy}
            onChange={(val) => { setSearchBy(val ?? null); setCurrentPage(1); }}
            style={{ width: "100%" }}
          />
          <Input
            placeholder="Search..."
            allowClear
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
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
                  onChange={(val) => { setPageSize(val); setCurrentPage(1); }}
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
        title={editingRecord ? "Edit Department" : "Add Department"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
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
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter a department name." },
              { max: 200, message: "Maximum 200 characters." },
            ]}
          >
            <Input placeholder="e.g. Anatomy" />
          </Form.Item>

          <Form.Item
            name="shortName"
            label="Short Name"
            rules={[{ max: 50, message: "Maximum 50 characters." }]}
          >
            <Input placeholder="e.g. Anat" />
          </Form.Item>

          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: "Please select a category." }]}
          >
            <Select placeholder="Select category" options={DEPARTMENT_CATEGORY_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="instituteId"
            label="Institute"
            rules={[{ required: true, message: "Please select an institute." }]}
            extra="For a top-level Department, select the Institution. For a Sub-department, select the specific Institute it's specialized for."
          >
            <Select
              placeholder="Select institute"
              options={instituteOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="parentId"
            label="Parent Department"
            extra="Leave empty for a top-level Department. Select a parent to create a Sub-department."
          >
            <Select
              placeholder="No parent (top-level department)"
              allowClear
              options={parentOptions}
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

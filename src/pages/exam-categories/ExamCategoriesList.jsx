import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, InputNumber,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getExamCategories, createExamCategory, updateExamCategory, setExamCategoryStatus,
} from "../../api/examCategoriesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/useAuth";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",      label: "Name" },
  { value: "shortName", label: "Short Name" },
  { value: "status",    label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
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

export default function ExamCategoriesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [categories, setCategories] = useState([]);
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
        const { data } = await getExamCategories();
        setCategories(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load exam categories.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [categories, searchBy, searchTerm]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Exam Category" : "Deactivate Exam Category",
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
          await setExamCategoryStatus(record.id, activate);
          setCategories((prev) => prev.map((c) => (c.id === record.id ? { ...c, isActive: activate } : c)));
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ displayOrder: 0 });
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({ name: record.name, shortName: record.shortName, displayOrder: record.displayOrder });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    setError("");
    const payload = { ...values, displayOrder: values.displayOrder ?? 0 };
    try {
      if (editingRecord) {
        const { data } = await updateExamCategory(editingRecord.id, payload);
        setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      } else {
        const { data } = await createExamCategory(payload);
        setCategories((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} exam category.`);
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
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "exam-categories"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 65, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    { title: "Name", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: "Short Name", dataIndex: "shortName", width: 130, render: (v) => v || "—" },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("exam-category.activate") ? (
          <Tag color={isActive ? "success" : "default"} style={{ cursor: "pointer" }} onClick={() => handleToggle(record)}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>
        ),
    },
    {
      title: "Actions",
      width: 90,
      align: "center",
      render: (_, record) => (
        can("exam-category.update") && (
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
        )
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("exam-category.create") ? openAddModal : undefined}>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard>
        <div className="list-toolbar">
          <Select
            placeholder="Search by"
            allowClear
            options={searchableColumns}
            value={searchBy}
            onChange={(val) => { setSearchBy(val ?? null); setCurrentPage(1); }}
            style={{ width: "auto" }}
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
        title={editingRecord ? "Edit Exam Category" : "Add Exam Category"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Space size={16} align="start" style={{ width: "100%" }}>
            <Form.Item
              name="name"
              label="Name"
              style={{ flex: 2 }}
              rules={[
                { required: true, message: "Please enter the category's name." },
                { max: 100, message: "Maximum 100 characters." },
              ]}
            >
              <Input placeholder="e.g. OSCE" />
            </Form.Item>

            <Form.Item
              name="shortName"
              label="Short Name"
              style={{ flex: 1 }}
              rules={[{ max: 30, message: "Maximum 30 characters." }]}
            >
              <Input placeholder="e.g. OSCE" />
            </Form.Item>

            <Form.Item name="displayOrder" label="Display Order" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

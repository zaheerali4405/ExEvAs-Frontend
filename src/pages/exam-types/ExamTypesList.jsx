import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getExamTypes, createExamType, updateExamType, setExamTypeStatus } from "../../api/examTypesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "fullName",  label: "Full Name" },
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

export default function ExamTypesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [examTypes, setExamTypes] = useState([]);
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
        const { data } = await getExamTypes();
        setExamTypes(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load exam types.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return examTypes;
    const term = searchTerm.toLowerCase();
    return examTypes.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [examTypes, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Exam Type" : "Deactivate Exam Type",
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
          await setExamTypeStatus(record.id, activate);
          setExamTypes((prev) =>
            prev.map((e) => (e.id === record.id ? { ...e, isActive: activate } : e))
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
    form.setFieldsValue({ fullName: record.fullName, shortName: record.shortName });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateExamType(editingRecord.id, values);
        setExamTypes((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      } else {
        const { data } = await createExamType(values);
        setExamTypes((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} exam type.`);
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
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "exam-types"
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
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("exam-type.activate") ? (
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
          {can("exam-type.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("exam-type.create") ? openAddModal : undefined}>
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

      <Modal
        title={editingRecord ? "Edit Exam Type" : "Add Exam Type"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnClose
        centered
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
              { required: true, message: "Please enter the exam type's full name." },
              { max: 150, message: "Maximum 150 characters." },
            ]}
          >
            <Input placeholder="e.g. Pre Annual Sendup" />
          </Form.Item>

          <Form.Item
            name="shortName"
            label="Short Name"
            rules={[{ max: 50, message: "Maximum 50 characters." }]}
          >
            <Input placeholder="e.g. PASU" />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip, Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import { getPermissions, setPermissionStatus, createPermission, updatePermission } from "../../api/permissionsApi";
import { exportToExcel } from "../../utils/exportExcel";


const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "permissionKey", label: "Permission Key" },
  { value: "description",   label: "Description" },
  { value: "status",        label: "Status" },
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

export default function PermissionsList() {
  const isMobile = useIsMobile();
  const [permissions, setPermissions] = useState([]);
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

  const fetchPermissions = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getPermissions();
      setPermissions(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPermissions(); }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return permissions;
    const term = searchTerm.toLowerCase();
    return permissions.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [permissions, searchBy, searchTerm]);

  // Reset to page 1 when search changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (permission) => {
    const activate = !permission.isActive;
    Modal.confirm({
      title: activate ? "Activate Permission" : "Deactivate Permission",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${permission.permissionKey}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: { danger: !activate, style: activate ? { background: '#1AB394', borderColor: '#1AB394' } : {} },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setPermissionStatus(permission.id, activate);
          setPermissions((prev) =>
            prev.map((p) => (p.id === permission.id ? { ...p, isActive: activate } : p))
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
    form.setFieldsValue({ permissionKey: record.permissionKey, description: record.description });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updatePermission(editingRecord.id, values);
        setPermissions((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      } else {
        const { data } = await createPermission(values);
        setPermissions((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} permission.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",          accessor: (_, i) => i + 1 },
        { label: "Permission Key", accessor: (r) => r.permissionKey },
        { label: "Description",    accessor: (r) => r.description || "" },
        { label: "Status",         accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "permissions"
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
      title: "Permission Key",
      dataIndex: "permissionKey",
      sorter: (a, b) => a.permissionKey.localeCompare(b.permissionKey),
    },
    {
      title: "Description",
      dataIndex: "description",
      sorter: (a, b) => (a.description ?? "").localeCompare(b.description ?? ""),
      render: (val) => val || "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) => (
        <Tag
          color={isActive ? "success" : "default"}
          style={{ cursor: "pointer" }}
          onClick={() => handleToggle(record)}
        >
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
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
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

      <div style={{ background: "#ffffff", borderRadius: 8, padding: 20, border: "1px solid #f0f0f0" }}>
        {/* Toolbar — stacks vertically on mobile */}
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

        {/* Scrollable container — keeps table + footer inside white div */}
        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns}
            loading={loading}
            size="small"
            pagination={false}
          />

          {/* Custom footer */}
          <div className="list-footer">
            {/* Left: page size + entry count */}
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

            {/* Right: page navigation */}
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
      </div>
      <Modal
        title={editingRecord ? "Edit Permission" : "Add Permission"}
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
            name="permissionKey"
            label="Permission Key"
            rules={[
              { required: true, message: "Please enter a permission key." },
              { max: 100, message: "Maximum 100 characters." },
            ]}
          >
            <Input placeholder="e.g. user.read-all" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
          >
            <Input placeholder="Brief description (optional)" />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

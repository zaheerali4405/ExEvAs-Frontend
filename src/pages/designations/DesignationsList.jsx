import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined, ApartmentOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getDesignations, createDesignation, updateDesignation, setDesignationStatus } from "../../api/designationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import { useAuth } from "../../context/useAuth";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",        label: "Name" },
  { value: "description", label: "Description" },
  { value: "reportsTo",   label: "Reports To" },
  { value: "status",      label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "reportsTo") return item.parent?.name ?? "";
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

export default function DesignationsList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { can } = useAuth();
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

  const loadErrorMessage = (err) => err.response?.data?.message || "Could not load designations.";

  useEffect(() => {
    let ignore = false;
    getDesignations()
      .then(({ data }) => { if (!ignore) setDesignations(data); })
      .catch((err) => { if (!ignore) setError(loadErrorMessage(err)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  // Reload after an edit (see handleModalFinish).
  const reloadDesignations = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getDesignations();
      setDesignations(data);
    } catch (err) {
      setError(loadErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return designations;
    const term = searchTerm.toLowerCase();
    return designations.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [designations, searchBy, searchTerm]);

  const handleToggle = (designation) => {
    const activate = !designation.isActive;
    Modal.confirm({
      title: activate ? "Activate Designation" : "Deactivate Designation",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${designation.name}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setDesignationStatus(designation.id, activate);
          setDesignations((prev) =>
            prev.map((d) => (d.id === designation.id ? { ...d, isActive: activate } : d))
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
      name: record.name,
      description: record.description,
      parentId: record.parentId ?? undefined,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    // A cleared selection is sent as null so an edit can move a designation
    // back to the top level, rather than being dropped from the payload.
    const payload = { ...values, parentId: values.parentId ?? null };
    try {
      if (editingRecord) {
        await updateDesignation(editingRecord.id, payload);
        // Reloaded rather than patched in place: renaming a designation
        // changes the Reports To shown on every row beneath it.
        await reloadDesignations();
      } else {
        const { data } = await createDesignation(payload);
        setDesignations((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} designation.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",       accessor: (_, i) => i + 1 },
        { label: "Name",        accessor: (r) => r.name },
        { label: "Description", accessor: (r) => r.description || "" },
        { label: "Reports To",  accessor: (r) => r.parent?.name || "" },
        { label: "Status",      accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "designations"
    );
  };

  // Everything a designation could report to. When editing, the designation
  // itself and every designation beneath it are left out: picking one of
  // those would close the chain into a loop. The backend refuses it too;
  // this just keeps the impossible choices off the list.
  const parentOptions = useMemo(() => {
    const excluded = new Set();
    if (editingRecord) {
      const childrenOf = new Map();
      designations.forEach((d) => {
        if (d.parentId == null) return;
        if (!childrenOf.has(d.parentId)) childrenOf.set(d.parentId, []);
        childrenOf.get(d.parentId).push(d.id);
      });
      const stack = [editingRecord.id];
      while (stack.length) {
        const id = stack.pop();
        if (excluded.has(id)) continue;
        excluded.add(id);
        (childrenOf.get(id) || []).forEach((childId) => stack.push(childId));
      }
    }
    return designations
      .filter((d) => d.isActive && !excluded.has(d.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ value: d.id, label: d.name }));
  }, [designations, editingRecord]);

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
      title: "Description",
      dataIndex: "description",
      sorter: (a, b) => (a.description ?? "").localeCompare(b.description ?? ""),
      render: (val) => val || "—",
    },
    {
      title: "Reports To",
      width: 180,
      sorter: (a, b) => (a.parent?.name ?? "").localeCompare(b.parent?.name ?? ""),
      render: (_, r) => r.parent?.name ?? "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("designation.activate") ? (
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
          {can("designation.update") && (
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
          )}
          {can("designation-role.read-all") && (
            <Tooltip title="Manage Roles">
              <Button
                size="small"
                icon={<ApartmentOutlined />}
                onClick={() => navigate(`/designation-roles?designationId=${record.id}`)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("designation.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Designation" : "Add Designation"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
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
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter a name." },
              { max: 100, message: "Maximum 100 characters." },
            ]}
          >
            <Input placeholder="Designation name" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Brief description (optional)" />
          </Form.Item>
          <Form.Item
            name="parentId"
            label="Reports To"
            tooltip={infoTip("The designation this one answers to. Leave empty for a top-level designation.")}
          >
            <Select
              placeholder="No one (top-level designation)"
              options={parentOptions}
              allowClear
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

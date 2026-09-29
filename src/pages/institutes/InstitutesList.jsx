import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, InputNumber, Row, Col, Descriptions,
} from "antd";
import { EditOutlined, DownloadOutlined, EyeOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getInstitutes, createInstitute, updateInstitute, setInstituteStatus } from "../../api/institutesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/useAuth";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "fullName",  label: "Full Name" },
  { value: "shortName", label: "Short Name" },
  { value: "parent",    label: "Parent" },
  { value: "status",    label: "Status" },
];

const parentLabel = (parent) => (parent ? parent.shortName || parent.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "parent") return parentLabel(item.parent);
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

export default function InstitutesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [institutes, setInstitutes] = useState([]);
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getInstitutes();
        setInstitutes(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load institutes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return institutes;
    const term = searchTerm.toLowerCase();
    return institutes.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [institutes, searchBy, searchTerm]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Institute" : "Deactivate Institute",
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
          await setInstituteStatus(record.id, activate);
          setInstitutes((prev) =>
            prev.map((i) => (i.id === record.id ? { ...i, isActive: activate } : i))
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
      fullName:        record.fullName,
      shortName:       record.shortName,
      establishedYear: record.establishedYear,
      email:           record.email,
      phone:           record.phone,
      address:         record.address,
      parentId:        record.parentId,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = { ...values, parentId: values.parentId ?? null };
      if (editingRecord) {
        const { data } = await updateInstitute(editingRecord.id, payload);
        setInstitutes((prev) => prev.map((i) => (i.id === data.id ? data : i)));
      } else {
        const { data } = await createInstitute(payload);
        setInstitutes((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} institute.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",            accessor: (_, i) => i + 1 },
        { label: "Full Name",        accessor: (r) => r.fullName },
        { label: "Short Name",       accessor: (r) => r.shortName || "" },
        { label: "Parent",           accessor: (r) => parentLabel(r.parent) },
        { label: "Established Year", accessor: (r) => r.establishedYear || "" },
        { label: "Email",            accessor: (r) => r.email || "" },
        { label: "Phone",            accessor: (r) => r.phone || "" },
        { label: "Address",          accessor: (r) => r.address || "" },
        { label: "Status",           accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "institutes"
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
      title: "Parent",
      width: 200,
      render: (_, r) => parentLabel(r.parent) || "—",
      sorter: (a, b) => parentLabel(a.parent).localeCompare(parentLabel(b.parent)),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("institute.activate") ? (
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
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewRecord(record)} />
          </Tooltip>
          {can("institute.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const parentOptions = useMemo(
    () =>
      institutes
        .filter((i) => i.isActive && i.id !== editingRecord?.id)
        .map((i) => ({ value: i.id, label: i.fullName })),
    [institutes, editingRecord]
  );

  return (
    <DashboardLayout onAdd={can("institute.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Institute" : "Add Institute"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fullName"
                label="Full Name"
                rules={[
                  { required: true, message: "Please enter the full name." },
                  { max: 200, message: "Maximum 200 characters." },
                ]}
              >
                <Input placeholder="e.g. CMH Lahore Medical College and Institute of Dentistry" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="shortName"
                label="Short Name"
                rules={[{ max: 50, message: "Maximum 50 characters." }]}
              >
                <Input placeholder="e.g. LMC" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="parentId"
                label="Parent"
                extra="Leave empty to add this as a top-level institution."
              >
                <Select
                  placeholder="No parent (top-level)"
                  allowClear
                  options={parentOptions}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="establishedYear" label="Established Year">
                <InputNumber placeholder="e.g. 1971" min={1800} max={2200} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Enter a valid email." }]}>
                <Input placeholder="Contact email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="Contact phone" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Address">
            <Input.TextArea placeholder="Address" autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        title="Institute Details"
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
            <Descriptions.Item label="Full Name">{viewRecord.fullName}</Descriptions.Item>
            <Descriptions.Item label="Short Name">{viewRecord.shortName || "—"}</Descriptions.Item>
            <Descriptions.Item label="Parent">{parentLabel(viewRecord.parent) || "—"}</Descriptions.Item>
            <Descriptions.Item label="Established Year">{viewRecord.establishedYear || "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{viewRecord.email || "—"}</Descriptions.Item>
            <Descriptions.Item label="Phone">{viewRecord.phone || "—"}</Descriptions.Item>
            <Descriptions.Item label="Address">{viewRecord.address || "—"}</Descriptions.Item>
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

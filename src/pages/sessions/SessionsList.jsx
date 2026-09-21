import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, InputNumber, DatePicker, Switch,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getSessions, createSession, updateSession, setSessionStatus } from "../../api/sessionsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",     label: "Name" },
  { value: "profYear", label: "Prof Year" },
  { value: "status",   label: "Status" },
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

export default function SessionsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [sessions, setSessions] = useState([]);
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
        const { data } = await getSessions();
        setSessions(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load sessions.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const term = searchTerm.toLowerCase();
    return sessions.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [sessions, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Session" : "Deactivate Session",
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
          await setSessionStatus(record.id, activate);
          setSessions((prev) =>
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
      name:      record.name,
      profYear:  record.profYear,
      startDate: record.startDate ? dayjs(record.startDate) : null,
      endDate:   record.endDate ? dayjs(record.endDate) : null,
      isCurrent: record.isCurrent,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = {
        ...values,
        startDate: values.startDate ? values.startDate.format("YYYY-MM-DD") : undefined,
        endDate:   values.endDate ? values.endDate.format("YYYY-MM-DD") : undefined,
      };
      if (editingRecord) {
        const { data } = await updateSession(editingRecord.id, payload);
        setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      } else {
        const { data } = await createSession(payload);
        setSessions((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} session.`);
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
        { label: "Prof Year",  accessor: (r) => r.profYear },
        { label: "Start Date", accessor: (r) => r.startDate ? dayjs(r.startDate).format("DD MMM YYYY") : "" },
        { label: "End Date",   accessor: (r) => r.endDate ? dayjs(r.endDate).format("DD MMM YYYY") : "" },
        { label: "Is Current", accessor: (r) => (r.isCurrent ? "Yes" : "No") },
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "sessions"
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
      title: "Prof Year",
      dataIndex: "profYear",
      width: 110,
      sorter: (a, b) => a.profYear - b.profYear,
    },
    {
      title: "Start Date",
      dataIndex: "startDate",
      width: 120,
      render: (val) => (val ? dayjs(val).format("DD MMM YYYY") : "—"),
    },
    {
      title: "End Date",
      dataIndex: "endDate",
      width: 120,
      render: (val) => (val ? dayjs(val).format("DD MMM YYYY") : "—"),
    },
    {
      title: "Current",
      dataIndex: "isCurrent",
      width: 100,
      render: (val) => <Tag color={val ? "processing" : "default"}>{val ? "Yes" : "No"}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("session.activate") ? (
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
          {can("session.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("session.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Session" : "Add Session"}
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
          initialValues={{ isCurrent: false }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter a session name." },
              { max: 50, message: "Maximum 50 characters." },
            ]}
          >
            <Input placeholder="e.g. 2025-26" />
          </Form.Item>

          <Form.Item
            name="profYear"
            label="Prof Year"
            rules={[{ required: true, message: "Please enter the professional exam year." }]}
            extra="The year used in Event naming, e.g. 2026."
          >
            <InputNumber placeholder="e.g. 2026" min={1900} max={2200} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="startDate"
            label="Start Date"
            rules={[{ required: true, message: "Please select a start date." }]}
          >
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item
            name="endDate"
            label="End Date"
            dependencies={["startDate"]}
            rules={[
              { required: true, message: "Please select an end date." },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");
                  if (!value || !startDate || value.isAfter(startDate)) return Promise.resolve();
                  return Promise.reject(new Error("End date must be after start date."));
                },
              }),
            ]}
          >
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="isCurrent" label="Current Session" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, Descriptions, Switch,
} from "antd";
import { EditOutlined, DownloadOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getPrograms, createProgram, updateProgram, setProgramStatus } from "../../api/programsApi";
import { getInstitutes } from "../../api/institutesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const TERM_SYSTEM_OPTIONS = [
  { value: "annual",   label: "Annual" },
  { value: "semester", label: "Semester" },
  { value: "mixed",    label: "Mixed" },
];

const AFFILIATED_WITH_OPTIONS = [
  { value: "NUMS", label: "NUMS" },
  { value: "UHS",  label: "UHS" },
];

const PROGRAM_TYPE_OPTIONS = [
  { value: "graduate",     label: "Graduate" },
  { value: "postgraduate", label: "Postgraduate" },
];

const PROGRAM_TYPE_LABELS = {
  graduate:     "Graduate",
  postgraduate: "Postgraduate",
};

const searchableColumns = [
  { value: "fullName",  label: "Full Name" },
  { value: "shortName", label: "Short Name" },
  { value: "code",      label: "Code" },
  { value: "institute", label: "Institute" },
  { value: "status",    label: "Status" },
];

const instituteLabel = (institute) => (institute ? institute.shortName || institute.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status")    return item.isActive ? "Active" : "Inactive";
  if (key === "institute") return instituteLabel(item.institute);
  return item[key] ?? "";
};

const formatDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—");
const userLabel = (user) => (user ? user.username || user.email : "—");

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function ProgramsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [programs, setPrograms] = useState([]);
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
        const { data } = await getPrograms();
        setPrograms(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load programs.");
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return programs;
    const term = searchTerm.toLowerCase();
    return programs.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [programs, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Program" : "Deactivate Program",
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
          await setProgramStatus(record.id, activate);
          setPrograms((prev) =>
            prev.map((p) => (p.id === record.id ? { ...p, isActive: activate } : p))
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
    form.setFieldsValue({ autoScheduleModerationMeetings: true });
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      fullName:       record.fullName,
      shortName:      record.shortName,
      code:           record.code,
      instituteId:    record.instituteId,
      termSystem:     record.termSystem,
      affiliatedWith: record.affiliatedWith,
      type:           record.type,
      notes:          record.notes,
      autoScheduleModerationMeetings: record.autoScheduleModerationMeetings,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateProgram(editingRecord.id, values);
        setPrograms((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      } else {
        const { data } = await createProgram(values);
        setPrograms((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} program.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",           accessor: (_, i) => i + 1 },
        { label: "Full Name",       accessor: (r) => r.fullName },
        { label: "Short Name",      accessor: (r) => r.shortName || "" },
        { label: "Code",            accessor: (r) => r.code },
        { label: "Institute",       accessor: (r) => instituteLabel(r.institute) },
        { label: "Term System",     accessor: (r) => TERM_SYSTEM_OPTIONS.find((t) => t.value === r.termSystem)?.label || r.termSystem },
        { label: "Affiliated With", accessor: (r) => r.affiliatedWith },
        { label: "Type",            accessor: (r) => PROGRAM_TYPE_LABELS[r.type] ?? r.type },
        { label: "Auto-Schedule Moderation Meetings", accessor: (r) => (r.autoScheduleModerationMeetings ? "Yes" : "No") },
        { label: "Status",          accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "programs"
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
      width: 120,
      render: (val) => val || "—",
    },
    {
      title: "Code",
      dataIndex: "code",
      width: 90,
    },
    {
      title: "Institute",
      width: 180,
      render: (_, r) => instituteLabel(r.institute) || "—",
      sorter: (a, b) => instituteLabel(a.institute).localeCompare(instituteLabel(b.institute)),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("program.activate") ? (
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
          {can("program.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Programs belong to an actual Institute (LMC, IOD...), not the root Institution.
  const instituteOptions = useMemo(
    () =>
      institutes
        .filter((i) => i.isActive && i.parentId !== null)
        .map((i) => ({ value: i.id, label: i.fullName })),
    [institutes]
  );

  return (
    <DashboardLayout onAdd={can("program.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Program" : "Add Program"}
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
              { required: true, message: "Please enter the program's full name." },
              { max: 200, message: "Maximum 200 characters." },
            ]}
          >
            <Input placeholder="e.g. Bachelor of Medicine, Bachelor of Surgery" />
          </Form.Item>

          <Form.Item
            name="shortName"
            label="Short Name"
            rules={[{ max: 50, message: "Maximum 50 characters." }]}
          >
            <Input placeholder="e.g. MBBS" />
          </Form.Item>

          <Form.Item
            name="code"
            label="Code"
            extra="Even shorter than Short Name — used as the roll-number prefix for students."
            rules={[
              { required: true, message: "Please enter a code." },
              { max: 10, message: "Maximum 10 characters." },
            ]}
          >
            <Input placeholder="e.g. M" />
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
            />
          </Form.Item>

          <Form.Item
            name="termSystem"
            label="Term System"
            rules={[{ required: true, message: "Please select a term system." }]}
          >
            <Select placeholder="Select term system" options={TERM_SYSTEM_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="affiliatedWith"
            label="Affiliated With"
            rules={[{ required: true, message: "Please select an affiliating body." }]}
          >
            <Select placeholder="Select affiliating body" options={AFFILIATED_WITH_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: "Please select a program type." }]}
          >
            <Select placeholder="Select program type" options={PROGRAM_TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="autoScheduleModerationMeetings"
            label="Auto-Schedule Moderation Meetings"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea placeholder="Notes" autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        title="Program Details"
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
            <Descriptions.Item label="Code">{viewRecord.code}</Descriptions.Item>
            <Descriptions.Item label="Institute">{instituteLabel(viewRecord.institute) || "—"}</Descriptions.Item>
            <Descriptions.Item label="Term System">
              {TERM_SYSTEM_OPTIONS.find((t) => t.value === viewRecord.termSystem)?.label ?? viewRecord.termSystem}
            </Descriptions.Item>
            <Descriptions.Item label="Affiliated With">{viewRecord.affiliatedWith}</Descriptions.Item>
            <Descriptions.Item label="Type">{PROGRAM_TYPE_LABELS[viewRecord.type] ?? viewRecord.type}</Descriptions.Item>
            <Descriptions.Item label="Auto-Schedule Moderation Meetings">
              <Tag color={viewRecord.autoScheduleModerationMeetings ? "success" : "default"}>
                {viewRecord.autoScheduleModerationMeetings ? "Yes" : "No"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Notes">{viewRecord.notes || "—"}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={viewRecord.isActive ? "success" : "default"}>
                {viewRecord.isActive ? "Active" : "Inactive"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Created At">{formatDateTime(viewRecord.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Created By">{userLabel(viewRecord.creator)}</Descriptions.Item>
            <Descriptions.Item label="Updated At">{formatDateTime(viewRecord.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="Updated By">{userLabel(viewRecord.updater)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getClasses, createClass, updateClass, setClassStatus } from "../../api/classesApi";
import { getPrograms } from "../../api/programsApi";
import { getDegreeLevels } from "../../api/degreeLevelsApi";
import { getSessions } from "../../api/sessionsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "fullName",    label: "Full Name" },
  { value: "shortName",   label: "Short Name" },
  { value: "program",     label: "Program" },
  { value: "degreeLevel", label: "Degree Level" },
  { value: "session",     label: "Session" },
  { value: "status",      label: "Status" },
];

const shortLabel = (entity) => (entity ? entity.shortName || entity.fullName : "");

const getFieldValue = (item, key) => {
  if (key === "status")      return item.isActive ? "Active" : "Inactive";
  if (key === "program")     return shortLabel(item.program);
  if (key === "degreeLevel") return shortLabel(item.degreeLevel);
  if (key === "session")     return item.session?.name ?? "";
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

export default function ClassesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [classes, setClasses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [degreeLevels, setDegreeLevels] = useState([]);
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
        const { data } = await getClasses();
        setClasses(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load classes.");
      } finally {
        setLoading(false);
      }

      if (can("program.read-all")) {
        try {
          const { data } = await getPrograms();
          setPrograms(data);
        } catch {
          // Non-fatal: the program dropdown just stays empty.
        }
      }

      if (can("degree-level.read-all")) {
        try {
          const { data } = await getDegreeLevels();
          setDegreeLevels(data);
        } catch {
          // Non-fatal: the degree level dropdown just stays empty.
        }
      }

      if (can("session.read-all")) {
        try {
          const { data } = await getSessions();
          setSessions(data);
        } catch {
          // Non-fatal: the session dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return classes;
    const term = searchTerm.toLowerCase();
    return classes.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [classes, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Class" : "Deactivate Class",
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
          await setClassStatus(record.id, activate);
          setClasses((prev) =>
            prev.map((c) => (c.id === record.id ? { ...c, isActive: activate } : c))
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
      programId:     record.programId,
      degreeLevelId: record.degreeLevelId,
      sessionId:     record.sessionId,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateClass(editingRecord.id, values);
        setClasses((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      } else {
        const { data } = await createClass(values);
        setClasses((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} class.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",        accessor: (_, i) => i + 1 },
        { label: "Full Name",    accessor: (r) => r.fullName },
        { label: "Short Name",   accessor: (r) => r.shortName },
        { label: "Program",      accessor: (r) => shortLabel(r.program) },
        { label: "Degree Level", accessor: (r) => shortLabel(r.degreeLevel) },
        { label: "Session",      accessor: (r) => r.session?.name || "" },
        { label: "Status",       accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "classes"
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
      width: 150,
    },
    {
      title: "Program",
      width: 160,
      render: (_, r) => shortLabel(r.program) || "—",
      sorter: (a, b) => shortLabel(a.program).localeCompare(shortLabel(b.program)),
    },
    {
      title: "Degree Level",
      width: 160,
      render: (_, r) => shortLabel(r.degreeLevel) || "—",
      sorter: (a, b) => shortLabel(a.degreeLevel).localeCompare(shortLabel(b.degreeLevel)),
    },
    {
      title: "Session",
      width: 130,
      render: (_, r) => r.session?.name ?? "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("class.activate") ? (
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
          {can("class.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const programOptions = useMemo(
    () => programs.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.fullName })),
    [programs]
  );
  const degreeLevelOptions = useMemo(
    () => degreeLevels.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.fullName })),
    [degreeLevels]
  );
  const sessionOptions = useMemo(
    () => sessions.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })),
    [sessions]
  );

  return (
    <DashboardLayout onAdd={can("class.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Class" : "Add Class"}
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
            name="programId"
            label="Program"
            rules={[{ required: true, message: "Please select a program." }]}
          >
            <Select
              placeholder="Select program"
              options={programOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="degreeLevelId"
            label="Degree Level"
            rules={[{ required: true, message: "Please select a degree level." }]}
          >
            <Select
              placeholder="Select degree level"
              options={degreeLevelOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="sessionId"
            label="Session"
            rules={[{ required: true, message: "Please select a session." }]}
          >
            <Select
              placeholder="Select session"
              options={sessionOptions}
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

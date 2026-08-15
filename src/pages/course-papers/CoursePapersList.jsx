import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, Checkbox,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getCoursePapers, createCoursePaper, updateCoursePaper, setCoursePaperStatus } from "../../api/coursePapersApi";
import { getPrograms } from "../../api/programsApi";
import { getDegreeLevels } from "../../api/degreeLevelsApi";
import { getSessions } from "../../api/sessionsApi";
import { getSubjects } from "../../api/subjectsApi";
import { getInstitutes } from "../../api/institutesApi";
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

const subjectNames = (coursePaper) => (coursePaper.subjects || []).map((s) => s.subject?.fullName).filter(Boolean);

const getFieldValue = (item, key) => {
  if (key === "status")      return item.isActive ? "Active" : "Inactive";
  if (key === "program")     return item.program?.fullName ?? "";
  if (key === "degreeLevel") return item.degreeLevel?.fullName ?? "";
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

export default function CoursePapersList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [coursePapers, setCoursePapers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [degreeLevels, setDegreeLevels] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
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
  const [form] = Form.useForm();
  const selectedProgramId = Form.useWatch("programId", form);
  const selectedSubjectIds = Form.useWatch("subjectIds", form) || [];

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getCoursePapers();
        setCoursePapers(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load course/papers.");
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

      if (can("subject.read-all")) {
        try {
          const { data } = await getSubjects();
          setSubjects(data);
        } catch {
          // Non-fatal: the subjects dropdown just stays empty.
        }
      }

      if (can("institute.read-all")) {
        try {
          const { data } = await getInstitutes();
          setInstitutes(data);
        } catch {
          // Non-fatal: subject filtering just falls back to an exact institute match.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return coursePapers;
    const term = searchTerm.toLowerCase();
    return coursePapers.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [coursePapers, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Course/Paper" : "Deactivate Course/Paper",
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
          await setCoursePaperStatus(record.id, activate);
          setCoursePapers((prev) =>
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
      fullName:      record.fullName,
      shortName:     record.shortName,
      programId:     record.programId,
      degreeLevelId: record.degreeLevelId,
      sessionId:     record.sessionId,
      subjectIds:    (record.subjects || []).map((s) => s.subjectId),
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateCoursePaper(editingRecord.id, values);
        setCoursePapers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      } else {
        const { data } = await createCoursePaper(values);
        setCoursePapers((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} course/paper.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",       accessor: (_, i) => i + 1 },
        { label: "Full Name",   accessor: (r) => r.fullName },
        { label: "Short Name",  accessor: (r) => r.shortName || "" },
        { label: "Program",     accessor: (r) => r.program?.fullName || "" },
        { label: "DegreeLevel", accessor: (r) => r.degreeLevel?.fullName || "" },
        { label: "Session",     accessor: (r) => r.session?.name || "" },
        { label: "Subjects",    accessor: (r) => subjectNames(r).join(", ") },
        { label: "Status",      accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "course-papers"
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
      title: "Program",
      width: 150,
      render: (_, r) => r.program?.fullName ?? "—",
      sorter: (a, b) => (a.program?.fullName ?? "").localeCompare(b.program?.fullName ?? ""),
    },
    {
      title: "Degree Level",
      width: 150,
      render: (_, r) => r.degreeLevel?.fullName ?? "—",
    },
    {
      title: "Session",
      width: 120,
      render: (_, r) => r.session?.name ?? "—",
    },
    {
      title: "Subjects",
      render: (_, r) => subjectNames(r).join(", ") || "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("course-paper.activate") ? (
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
          {can("course-paper.update") && (
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

  const selectedProgramInstituteId = useMemo(
    () => programs.find((p) => p.id === selectedProgramId)?.instituteId,
    [programs, selectedProgramId]
  );

  // Walks an Institute's parent chain up to the root, inclusive — a subject
  // scoped to any ancestor institute (e.g. the root Institution) applies
  // college-wide to every descendant institute, not just an exact match.
  const instituteAncestorIds = useMemo(() => {
    if (!selectedProgramInstituteId) return [];
    const byId = new Map(institutes.map((i) => [i.id, i]));
    const ids = [];
    let currentId = selectedProgramInstituteId;
    while (currentId != null) {
      ids.push(currentId);
      currentId = byId.get(currentId)?.parentId ?? null;
    }
    return ids;
  }, [institutes, selectedProgramInstituteId]);

  // Selectable subjects: those scoped to the selected program's institute or
  // any of its ancestor institutes — matches the backend's validation.
  const subjectOptions = useMemo(
    () =>
      subjects
        .filter((s) => s.isActive && instituteAncestorIds.includes(s.instituteId))
        .map((s) => ({ value: s.id, label: s.fullName })),
    [subjects, instituteAncestorIds]
  );

  return (
    <DashboardLayout onAdd={can("course-paper.create") ? openAddModal : undefined}>
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
        title={editingRecord ? "Edit Course/Paper" : "Add Course/Paper"}
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
              { required: true, message: "Please enter the course/paper's full name." },
              { max: 200, message: "Maximum 200 characters." },
            ]}
          >
            <Input placeholder="e.g. Paper-I" />
          </Form.Item>

          <Form.Item
            name="shortName"
            label="Short Name"
            rules={[{ max: 50, message: "Maximum 50 characters." }]}
          >
            <Input placeholder="e.g. P-I" />
          </Form.Item>

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
              onChange={() => form.setFieldValue("subjectIds", undefined)}
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

          <Form.Item
            name="subjectIds"
            label="Subjects"
            rules={[{ required: true, type: "array", min: 1, message: "Please select at least one subject." }]}
            extra={!selectedProgramId ? "Select a program first." : undefined}
          >
            <Select
              mode="multiple"
              placeholder="Select subjects"
              options={subjectOptions}
              disabled={!selectedProgramId}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
              menuItemSelectedIcon={null}
              optionRender={(option) => (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{option.label}</span>
                  <Checkbox checked={selectedSubjectIds.includes(option.value)} />
                </div>
              )}
            />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

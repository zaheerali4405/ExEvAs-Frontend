import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Tooltip, Pagination,
  Modal, Form, DatePicker, Checkbox, Typography,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getOspeOsceExams, createOspeOsceExam, updateOspeOsceExam, updateOspeOsceExamStatus,
} from "../../api/ospeOsceApi";
import { getClasses } from "../../api/classesApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { getVenues } from "../../api/venuesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_COLORS = {
  hold:        "default",
  scheduled:   "processing",
  in_progress: "warning",
  completed:   "success",
  cancelled:   "error",
};

// Same as Class.fullName, but with the program's short name instead of its
// full name — keeps the dropdown readable (e.g. "MBBS 4th Year 2025-26").
const classLabel = (programLike, degreeLevel, session) =>
  `${programLike?.shortName || programLike?.fullName || ""} ${degreeLevel?.fullName || ""} ${session?.name || ""}`
    .replace(/\s+/g, " ")
    .trim();

const dateRangeLabel = (record) => {
  if (!record.startDate) return "Not set";
  const start = dayjs(record.startDate).format("DD MMM YYYY");
  const end = record.endDate ? dayjs(record.endDate).format("DD MMM YYYY") : null;
  return end && end !== start ? `${start} – ${end}` : start;
};

const searchableColumns = [
  { value: "fullName",    label: "Full Name" },
  { value: "shortName",   label: "Short Name" },
  { value: "examType",    label: "Exam Type" },
  { value: "class",       label: "Class" },
  { value: "venue",       label: "Venue" },
  { value: "status",      label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "examType") return item.examType?.fullName ?? "";
  if (key === "class")    return classLabel(item.program, item.degreeLevel, item.session);
  if (key === "venue")    return item.venue?.name ?? "";
  if (key === "status")   return STATUS_LABELS[item.status] ?? "";
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

export default function OspeOsceList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [coursePapers, setCoursePapers] = useState([]);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isRetakeMode, setIsRetakeMode] = useState(false);
  const [form] = Form.useForm();

  // Status is auto-computed (Hold <-> Scheduled) from venue + date range, but
  // can be manually advanced to In Progress/Completed/Cancelled — same
  // update-status split as Event/ModerationMeeting. Only offered once
  // editing an existing entry, never on create.
  const canEditStatus = !!editingRecord && can("ospe-osce.update-status");

  const selectedClassId = Form.useWatch("classId", form);
  const selectedExamTypeId = Form.useWatch("examTypeId", form);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getOspeOsceExams();
        setExams(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load OSPE/OSCE exams.");
      } finally {
        setLoading(false);
      }
    })();
    if (can("class.read-all")) getClasses().then(({ data }) => setClasses(data)).catch(() => {});
    if (can("course-paper.read-all")) getCoursePapers().then(({ data }) => setCoursePapers(data)).catch(() => {});
    if (can("venue.read-all")) getVenues().then(({ data }) => setVenues(data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return exams;
    const term = searchTerm.toLowerCase();
    return exams.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [exams, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);
  const activeCoursePapers = useMemo(() => coursePapers.filter((c) => c.isActive), [coursePapers]);
  const activeVenues = useMemo(() => venues.filter((v) => v.isActive), [venues]);

  const selectedClass = useMemo(
    () => activeClasses.find((c) => c.id === selectedClassId) ?? null,
    [activeClasses, selectedClassId]
  );

  const classOptions = useMemo(() => {
    const base = activeClasses;
    // Retake mode only offers classes that already have at least one
    // original (non-retake) OSPE/OSCE entry to retake.
    const filtered2 = isRetakeMode
      ? base.filter((c) =>
          exams.some((o) =>
            o.programId === c.programId && o.degreeLevelId === c.degreeLevelId && o.sessionId === c.sessionId &&
            o.coursePapers.some((cp) => !cp.isRetake)
          )
        )
      : base;
    return filtered2.map((c) => ({ value: c.id, label: classLabel(c.program, c.degreeLevel, c.session) }));
  }, [activeClasses, exams, isRetakeMode]);

  const classCoursePapers = useMemo(() => {
    if (!selectedClass) return [];
    return activeCoursePapers.filter(
      (c) => c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId
    );
  }, [activeCoursePapers, selectedClass]);

  // Exam types this class already has an original OSPE/OSCE entry for (used
  // to narrow the Exam Type dropdown in retake mode).
  const classOriginalExamTypeIds = useMemo(() => {
    if (!selectedClass) return new Set();
    return new Set(
      exams
        .filter(
          (o) =>
            o.programId === selectedClass.programId &&
            o.degreeLevelId === selectedClass.degreeLevelId &&
            o.sessionId === selectedClass.sessionId &&
            o.coursePapers.some((cp) => !cp.isRetake)
        )
        .map((o) => o.examTypeId)
    );
  }, [exams, selectedClass]);

  const examTypeOptions = useMemo(() => {
    const byId = new Map();
    classCoursePapers.forEach((cp) => {
      (cp.examTypes || []).forEach((link) => {
        const et = link.examType;
        if (et && et.isActive && !byId.has(et.id)) byId.set(et.id, et);
      });
    });
    return Array.from(byId.values())
      .filter((et) => !isRetakeMode || classOriginalExamTypeIds.has(et.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [classCoursePapers, isRetakeMode, classOriginalExamTypeIds]);

  const classExamTypeCoursePapers = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classCoursePapers.filter((c) => (c.examTypes || []).some((link) => link.examTypeId === selectedExamTypeId));
  }, [classCoursePapers, selectedExamTypeId]);

  // Course/papers already carrying a non-retake OSPE/OSCE entry (for this
  // class+exam type) and whether each already has its own retake too —
  // drives which papers retake mode offers.
  const originalStatusByCoursePaper = useMemo(() => {
    if (!selectedClass || !selectedExamTypeId) return new Map();
    const map = new Map();
    exams
      .filter(
        (o) =>
          o.programId === selectedClass.programId &&
          o.degreeLevelId === selectedClass.degreeLevelId &&
          o.sessionId === selectedClass.sessionId &&
          o.examTypeId === selectedExamTypeId
      )
      .forEach((o) => {
        o.coursePapers.forEach((cp) => {
          const entry = map.get(cp.coursePaperId) || { hasOriginal: false, hasRetake: false };
          if (cp.isRetake) entry.hasRetake = true;
          else entry.hasOriginal = true;
          map.set(cp.coursePaperId, entry);
        });
      });
    return map;
  }, [exams, selectedClass, selectedExamTypeId]);

  const coursePaperOptions = useMemo(() => {
    const base = isRetakeMode
      ? classExamTypeCoursePapers.filter((cp) => {
          const status = originalStatusByCoursePaper.get(cp.id);
          return status?.hasOriginal && !status.hasRetake;
        })
      : classExamTypeCoursePapers;
    return base.map((cp) => ({ value: cp.id, label: cp.shortName || cp.fullName }));
  }, [classExamTypeCoursePapers, isRetakeMode, originalStatusByCoursePaper]);

  const venueOptions = useMemo(
    () => activeVenues.map((v) => ({ value: v.id, label: `${v.name} (capacity ${v.capacity})` })),
    [activeVenues]
  );

  const handleRetakeModeChange = (checked) => {
    setIsRetakeMode(checked);
    form.setFieldsValue({ classId: undefined, examTypeId: undefined, coursePaperIds: undefined });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    setIsRetakeMode(false);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setIsRetakeMode(false);
    const matchingClass = classes.find(
      (c) => c.programId === record.programId && c.degreeLevelId === record.degreeLevelId && c.sessionId === record.sessionId
    );
    form.setFieldsValue({
      classId: matchingClass?.id,
      examTypeId: record.examTypeId,
      coursePaperIds: record.coursePapers.map((cp) => cp.coursePaperId),
      venueId: record.venueId ?? undefined,
      dateRange: record.startDate
        ? [dayjs(record.startDate), record.endDate ? dayjs(record.endDate) : dayjs(record.startDate)]
        : undefined,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    if (!selectedClass) {
      setError("Please select a class.");
      return;
    }
    setModalLoading(true);
    setError("");
    const payload = {
      examTypeId: values.examTypeId,
      sessionId: selectedClass.sessionId,
      coursePaperIds: values.coursePaperIds,
      venueId: values.venueId ?? undefined,
      startDate: values.dateRange?.[0] ? values.dateRange[0].format("YYYY-MM-DD") : undefined,
      endDate: values.dateRange?.[1] ? values.dateRange[1].format("YYYY-MM-DD") : undefined,
      isRetake: isRetakeMode,
    };
    try {
      let data;
      if (editingRecord) {
        ({ data } = await updateOspeOsceExam(editingRecord.id, payload));
        if (canEditStatus && values.status && values.status !== data.status) {
          ({ data } = await updateOspeOsceExamStatus(editingRecord.id, values.status));
        }
        setExams((prev) => prev.map((o) => (o.id === data.id ? data : o)));
      } else {
        ({ data } = await createOspeOsceExam(payload));
        setExams((prev) => [data, ...prev]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} OSPE/OSCE exam.`);
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
        { label: "Short Name", accessor: (r) => r.shortName },
        { label: "Date Range", accessor: (r) => dateRangeLabel(r) },
        { label: "Venue",      accessor: (r) => r.venue?.name || "" },
        { label: "Status",     accessor: (r) => STATUS_LABELS[r.status] || r.status },
      ],
      "ospe-osce"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 65, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    { title: "Full Name", dataIndex: "fullName", sorter: (a, b) => a.fullName.localeCompare(b.fullName) },
    { title: "Short Name", dataIndex: "shortName", width: 200 },
    { title: "Date Range", width: 200, render: (_, r) => dateRangeLabel(r) },
    {
      title: "Status",
      width: 130,
      render: (_, record) => <Tag color={STATUS_COLORS[record.status]}>{STATUS_LABELS[record.status]}</Tag>,
    },
    {
      title: "Actions",
      width: 90,
      align: "center",
      render: (_, record) => (
        can("ospe-osce.update") && (
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
        )
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={(can("ospe-osce.create") || can("ospe-osce.create-departmental")) ? openAddModal : undefined}>
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
            onChange={(val) => setSearchBy(val ?? null)}
            style={{ width: "auto" }}
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
        title={editingRecord ? "Edit OSPE/OSCE Exam" : "Add OSPE/OSCE Exam"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnClose
        centered
        width={620}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          {!editingRecord && (
            <Form.Item style={{ marginBottom: 8 }}>
              <Checkbox checked={isRetakeMode} onChange={(e) => handleRetakeModeChange(e.target.checked)}>
                Is this a retake?
              </Checkbox>
            </Form.Item>
          )}

          <Form.Item
            name="classId"
            label="Class"
            rules={[{ required: true, message: "Please select a class." }]}
            extra={isRetakeMode && classOptions.length === 0 ? "No class has an existing OSPE/OSCE yet — there's nothing to retake." : undefined}
          >
            <Select
              placeholder="Select class"
              options={classOptions}
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
              onChange={() => form.setFieldsValue({ examTypeId: undefined, coursePaperIds: undefined })}
            />
          </Form.Item>

          <Form.Item
            name="examTypeId"
            label="Exam Type"
            rules={[{ required: true, message: "Please select an exam type." }]}
            extra={!selectedClassId ? "Select a class first." : undefined}
          >
            <Select
              placeholder="Select exam type"
              options={examTypeOptions}
              disabled={!selectedClassId}
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
              onChange={() => form.setFieldValue("coursePaperIds", undefined)}
            />
          </Form.Item>

          <Form.Item
            name="coursePaperIds"
            label="Course/Papers"
            extra={
              !selectedExamTypeId
                ? "Select an exam type first."
                : "One or more course/papers combined into a single OSPE/OSCE occurrence."
            }
            rules={[{ required: true, message: "Please select at least one course/paper." }]}
          >
            <Select
              mode="multiple"
              placeholder="Select course/paper(s)"
              options={coursePaperOptions}
              disabled={!selectedExamTypeId}
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </Form.Item>

          <Form.Item name="venueId" label="Venue">
            <Select
              placeholder="Select venue"
              options={venueOptions}
              allowClear
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Date Range"
            extra="Select the same date twice for a single-day OSPE/OSCE."
          >
            <DatePicker.RangePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>

          {canEditStatus && (
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: "Please select a status." }]}
            >
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          )}

          {editingRecord && (
            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
              Any course/paper newly added here is treated as an original, not a retake — this form doesn't
              support marking an already-existing occurrence's course/papers as a retake after the fact.
            </Text>
          )}
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

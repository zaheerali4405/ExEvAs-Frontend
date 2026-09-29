import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip, Pagination,
} from "antd";
import { EditOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getModerationMeetings } from "../../api/moderationMeetingsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/useAuth";
import ModerationMeetingFormModal from "./ModerationMeetingFormModal";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

const STATUS_COLORS = {
  hold:        "default",
  scheduled:   "processing",
  in_progress: "warning",
  completed:   "success",
  cancelled:   "error",
};

const searchableColumns = [
  { value: "fullName",     label: "Full Name" },
  { value: "shortName",    label: "Short Name" },
  { value: "examType",     label: "Exam Type" },
  { value: "program",      label: "Program" },
  { value: "degreeLevel",  label: "Degree Level" },
  { value: "session",      label: "Session" },
  { value: "department",   label: "Department" },
  { value: "venue",        label: "Venue" },
  { value: "status",       label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "examType")     return item.examType?.fullName ?? "";
  if (key === "program")      return item.program?.fullName ?? "";
  if (key === "degreeLevel")  return item.degreeLevel?.fullName ?? "";
  if (key === "session")      return item.session?.name ?? "";
  if (key === "department")   return item.department?.name ?? "";
  if (key === "venue")        return item.venue?.name ?? "";
  if (key === "status")       return item.status ?? "";
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

export default function ModerationMeetingsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getModerationMeetings();
        setMeetings(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load moderation meetings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return meetings;
    const term = searchTerm.toLowerCase();
    return meetings.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [meetings, searchBy, searchTerm]);

  const openAddModal = () => {
    setEditingRecord(null);
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setModalOpen(true);
  };

  const handleModalSuccess = (data, wasEditing) => {
    if (wasEditing) {
      setMeetings((prev) => prev.map((m) => (m.id === data.id ? data : m)));
    } else {
      setMeetings((prev) => [data, ...prev]);
    }
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",       accessor: (_, i) => i + 1 },
        { label: "Full Name",   accessor: (r) => r.fullName },
        { label: "Short Name",  accessor: (r) => r.shortName },
        { label: "Exam Type",   accessor: (r) => r.examType?.fullName || "" },
        { label: "Program",     accessor: (r) => r.program?.fullName || "" },
        { label: "Degree Level", accessor: (r) => r.degreeLevel?.fullName || "" },
        { label: "Session",     accessor: (r) => r.session?.name || "" },
        { label: "Department",  accessor: (r) => r.department?.name || "" },
        { label: "Venue",       accessor: (r) => r.venue?.name || "" },
        { label: "Date",        accessor: (r) => r.eventDate ? dayjs(r.eventDate).format("DD MMM YYYY") : "" },
        { label: "Start Time",  accessor: (r) => r.startTime || "" },
        { label: "End Time",    accessor: (r) => r.endTime || "" },
        { label: "Status",      accessor: (r) => STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status },
      ],
      "moderation-meetings"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    {
      title: "S.No.",
      width: 65,
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
      width: 160,
    },
    {
      title: "Department",
      width: 160,
      render: (_, r) => r.department?.name ?? "—",
      sorter: (a, b) => (a.department?.name ?? "").localeCompare(b.department?.name ?? ""),
    },
    {
      title: "Venue",
      width: 150,
      render: (_, r) => r.venue?.name ?? "—",
    },
    {
      title: "Date",
      render: (_, r) => r.eventDate ? dayjs(r.eventDate).format("DD MMM YYYY") : "—",
    },
    {
      title: "Time",
      width: 130,
      render: (_, r) => (r.startTime && r.endTime) ? `${r.startTime} – ${r.endTime}` : "—",
    },
    {
      title: "Status",
      width: 130,
      render: (_, record) => (
        <Tag color={STATUS_COLORS[record.status]}>{STATUS_OPTIONS.find((s) => s.value === record.status)?.label}</Tag>
      ),
    },
    {
      title: "Actions",
      width: 90,
      align: "center",
      render: (_, record) => (
        <Space>
          {(can("moderation-meeting.update") || can("moderation-meeting.update-time") || can("moderation-meeting.update-status")) && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={(can("moderation-meeting.create") || can("moderation-meeting.create-departmental")) ? openAddModal : undefined}>
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

      <ModerationMeetingFormModal
        open={modalOpen}
        editingRecord={editingRecord}
        onCancel={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        onError={setError}
      />
    </DashboardLayout>
  );
}

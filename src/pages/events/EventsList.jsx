import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Descriptions, Typography, Empty,
} from "antd";
import { EditOutlined, DownloadOutlined, AppstoreOutlined, EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getEvents } from "../../api/eventsApi";
import { getEventVenues } from "../../api/eventVenuesApi";
import { getEventEquipment } from "../../api/eventEquipmentApi";
import { getEventDepartments } from "../../api/eventDepartmentsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";
import EventFormModal from "./EventFormModal";

const { Title, Text } = Typography;

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

const ALL_CATEGORIES = "__all__";

const searchableColumns = [
  { value: "fullName",      label: "Full Name" },
  { value: "shortName",     label: "Short Name" },
  { value: "examType",      label: "Exam Type" },
  { value: "eventCategory", label: "Event Category" },
  { value: "program",       label: "Program" },
  { value: "degreeLevel",   label: "Degree Level" },
  { value: "session",       label: "Session" },
  { value: "status",        label: "Status" },
];

const examTypeLabel = (examType) => examType?.fullName ?? "";

const getFieldValue = (item, key) => {
  if (key === "examType")      return examTypeLabel(item.examType);
  if (key === "eventCategory") return item.eventCategory?.name ?? "";
  if (key === "program")       return item.program?.fullName ?? "";
  if (key === "degreeLevel")   return item.degreeLevel?.fullName ?? "";
  if (key === "session")       return item.session?.name ?? "";
  if (key === "status")        return item.status ?? "";
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

export default function EventsList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORIES);
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const [viewRecord, setViewRecord] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewVenues, setViewVenues] = useState([]);
  const [viewEquipment, setViewEquipment] = useState([]);
  const [viewDepartments, setViewDepartments] = useState([]);

  const canViewVenues = can("event-venue.read-all");
  const canViewEquipment = can("event-equipment.read-all");
  const canViewDepartments = can("event-department.read-all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getEvents();
        setEvents(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Every distinct Event Category currently appearing in the loaded events —
  // no separate fetch/permission needed, since each event already carries it.
  const categoryOptions = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      if (e.eventCategory && !map.has(e.eventCategory.id)) map.set(e.eventCategory.id, e.eventCategory.name);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  const categoryFiltered = useMemo(() => {
    if (selectedCategoryId === ALL_CATEGORIES) return events;
    return events.filter((e) => e.eventCategory?.id === selectedCategoryId);
  }, [events, selectedCategoryId]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return categoryFiltered;
    const term = searchTerm.toLowerCase();
    return categoryFiltered.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [categoryFiltered, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, selectedCategoryId, pageSize]);

  const openAddModal = () => {
    setEditingRecord(null);
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setModalOpen(true);
  };

  const openViewModal = async (record) => {
    setViewRecord(record);
    setViewVenues([]);
    setViewEquipment([]);
    setViewDepartments([]);
    setViewLoading(true);
    try {
      const [venuesRes, equipmentRes, departmentsRes] = await Promise.all([
        canViewVenues ? getEventVenues(record.id) : Promise.resolve({ data: [] }),
        canViewEquipment ? getEventEquipment(record.id) : Promise.resolve({ data: [] }),
        canViewDepartments ? getEventDepartments(record.id) : Promise.resolve({ data: [] }),
      ]);
      setViewVenues(venuesRes.data);
      setViewEquipment(equipmentRes.data);
      setViewDepartments(departmentsRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load event resources.");
    } finally {
      setViewLoading(false);
    }
  };

  const handleModalSuccess = (data, wasEditing) => {
    if (wasEditing) {
      setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    } else {
      setEvents((prev) => [data, ...prev]);
    }
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Full Name",  accessor: (r) => r.fullName },
        { label: "Short Name", accessor: (r) => r.shortName },
        { label: "Exam Type",      accessor: (r) => examTypeLabel(r.examType) },
        { label: "Event Category", accessor: (r) => r.eventCategory?.name || "" },
        { label: "Program",     accessor: (r) => r.program?.fullName || "" },
        { label: "Degree Level", accessor: (r) => r.degreeLevel?.fullName || "" },
        { label: "Session",     accessor: (r) => r.session?.name || "" },
        { label: "Date",       accessor: (r) => r.eventDate ? dayjs(r.eventDate).format("DD MMM YYYY") : "" },
        { label: "Start Time", accessor: (r) => r.startTime || "" },
        { label: "End Time",   accessor: (r) => r.endTime || "" },
        { label: "Status",     accessor: (r) => STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status },
      ],
      "events"
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
      title: "Category",
      width: 150,
      render: (_, r) => r.eventCategory?.name ?? "—",
      sorter: (a, b) => (a.eventCategory?.name ?? "").localeCompare(b.eventCategory?.name ?? ""),
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
      width: 150,
      render: (_, record) => (
        <Tag color={STATUS_COLORS[record.status]}>{STATUS_OPTIONS.find((s) => s.value === record.status)?.label}</Tag>
      ),
    },
    {
      title: "Actions",
      width: 170,
      align: "center",
      render: (_, record) => (
        <Space>
          {can("event.read") && (
            <Tooltip title="View Details">
              <Button size="small" icon={<EyeOutlined />} onClick={() => openViewModal(record)} />
            </Tooltip>
          )}
          {(can("event.update") || can("event.update-time") || can("event.update-status")) && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
          {can("event.read") && (can("event-venue.read-all") || can("event-equipment.read-all")) && (
            <Tooltip title="Manage Resources">
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => navigate(`/events/${record.id}/resources`)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("event.create") ? openAddModal : undefined}>
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
            className="event-category-filter"
            placeholder="Event Category"
            options={[{ value: ALL_CATEGORIES, label: "All Categories" }, ...categoryOptions]}
            value={selectedCategoryId}
            onChange={setSelectedCategoryId}
            style={{ width: "auto" }}
          />
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

      {/* Add / Edit Modal */}
      <EventFormModal
        open={modalOpen}
        editingRecord={editingRecord}
        onCancel={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        onError={setError}
      />

      {/* View Details Modal */}
      <Modal
        title={viewRecord?.fullName}
        open={!!viewRecord}
        onCancel={() => setViewRecord(null)}
        footer={null}
        centered
        width={720}
      >
        {viewRecord && (
          <div style={{ marginTop: 8 }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Full Name" span={2}>{viewRecord.fullName}</Descriptions.Item>
              <Descriptions.Item label="Short Name" span={2}>{viewRecord.shortName}</Descriptions.Item>
              <Descriptions.Item label="Exam Type">{viewRecord.examType?.fullName ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Event Category">{viewRecord.eventCategory?.name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Program">{viewRecord.program?.fullName ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Degree Level">{viewRecord.degreeLevel?.fullName ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Session">{viewRecord.session?.name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[viewRecord.status]}>
                  {STATUS_OPTIONS.find((s) => s.value === viewRecord.status)?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                {viewRecord.eventDate ? dayjs(viewRecord.eventDate).format("DD MMM YYYY") : "Not set"}
              </Descriptions.Item>
              <Descriptions.Item label="Time">
                {viewRecord.startTime && viewRecord.endTime
                  ? `${viewRecord.startTime} – ${viewRecord.endTime}`
                  : "Not set"}
              </Descriptions.Item>
            </Descriptions>

            {canViewDepartments && (
              <>
                <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Departments</Title>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={viewLoading}
                  dataSource={viewDepartments}
                  locale={{ emptyText: <Empty description="No departments linked." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  columns={[{ title: "Name", render: (_, r) => r.department?.name ?? "—" }]}
                />
              </>
            )}

            {canViewVenues && (
              <>
                <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Venues</Title>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={viewLoading}
                  dataSource={viewVenues}
                  locale={{ emptyText: <Empty description="No venues assigned." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  columns={[
                    { title: "Name", render: (_, r) => r.venue?.name ?? "—" },
                    { title: "Category", render: (_, r) => r.venue?.category?.name ?? "—" },
                    { title: "Location", render: (_, r) => r.venue?.location ?? "—" },
                    { title: "Seats Reserved", width: 130, render: (_, r) => r.seats ?? "—" },
                  ]}
                />
              </>
            )}

            {canViewEquipment && (
              <>
                <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Equipment</Title>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={viewLoading}
                  dataSource={viewEquipment}
                  locale={{ emptyText: <Empty description="No equipment assigned." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  columns={[
                    { title: "Name", render: (_, r) => r.equipment?.name ?? "—" },
                    { title: "Description", render: (_, r) => r.equipment?.description || "—" },
                    { title: "Quantity", width: 100, render: (_, r) => r.quantity },
                  ]}
                />
              </>
            )}

            {!canViewDepartments && !canViewVenues && !canViewEquipment && (
              <Text type="secondary" style={{ display: "block", marginTop: 20 }}>
                You do not have permission to view resources for this event.
              </Text>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

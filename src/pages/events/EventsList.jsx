import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, DatePicker, TimePicker, Spin,
} from "antd";
import { EditOutlined, ClockCircleOutlined, DownloadOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getEvents, createEvent, updateEvent, updateEventTime, updateEventStatus,
} from "../../api/eventsApi";
import { getEventCategories } from "../../api/eventCategoriesApi";
import { getDepartments } from "../../api/mainAppApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";

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
  { value: "name",       label: "Name" },
  { value: "category",   label: "Category" },
  { value: "department", label: "Department" },
  { value: "status",     label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "category")   return item.category?.name ?? "";
  if (key === "department") return item.department?.name ?? "";
  if (key === "status")     return item.status ?? "";
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
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [timeModalRecord, setTimeModalRecord] = useState(null);
  const [timeModalLoading, setTimeModalLoading] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [form] = Form.useForm();
  const [timeForm] = Form.useForm();

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

      if (can("event-category.read-all")) {
        try {
          const { data } = await getEventCategories();
          setCategories(data);
        } catch {
          // Non-fatal: the category dropdown just stays empty.
        }
      }

      try {
        const { data } = await getDepartments();
        setDepartments(data);
      } catch {
        // Non-fatal: the department dropdown just stays empty.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return events;
    const term = searchTerm.toLowerCase();
    return events.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [events, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchBy, pageSize]);

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name:         record.name,
      categoryId:   record.categoryId,
      departmentId: record.departmentId,
      eventDate:    record.eventDate ? dayjs(record.eventDate) : null,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = {
        ...values,
        eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
      };
      if (editingRecord) {
        const { data } = await updateEvent(editingRecord.id, payload);
        setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      } else {
        const { data } = await createEvent(payload);
        setEvents((prev) => [data, ...prev]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} event.`);
    } finally {
      setModalLoading(false);
    }
  };

  const openTimeModal = (record) => {
    setTimeModalRecord(record);
    timeForm.setFieldsValue({
      startTime: record.startTime ? dayjs(record.startTime, "HH:mm") : null,
      endTime:   record.endTime ? dayjs(record.endTime, "HH:mm") : null,
    });
  };

  const handleTimeModalFinish = async (values) => {
    setTimeModalLoading(true);
    try {
      const payload = {
        startTime: values.startTime ? values.startTime.format("HH:mm") : undefined,
        endTime:   values.endTime ? values.endTime.format("HH:mm") : undefined,
      };
      const { data } = await updateEventTime(timeModalRecord.id, payload);
      setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      timeForm.resetFields();
      setTimeModalRecord(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update event time.");
    } finally {
      setTimeModalLoading(false);
    }
  };

  const handleStatusChange = async (record, status) => {
    setStatusUpdatingId(record.id);
    setError("");
    try {
      const { data } = await updateEventStatus(record.id, status);
      setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    } catch (err) {
      setError(err.response?.data?.message || "Could not update event status.");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Name",       accessor: (r) => r.name },
        { label: "Category",   accessor: (r) => r.category?.name || "" },
        { label: "Department", accessor: (r) => r.department?.name || "" },
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

  const activeCategoryOptions = useMemo(
    () => categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );
  const activeDepartmentOptions = useMemo(
    () => departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name })),
    [departments]
  );

  const columns = [
    {
      title: "S.No.",
      width: 65,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Category",
      render: (_, r) => r.category?.name ?? "—",
      sorter: (a, b) => (a.category?.name ?? "").localeCompare(b.category?.name ?? ""),
    },
    {
      title: "Department",
      render: (_, r) => r.department?.name ?? "—",
      sorter: (a, b) => (a.department?.name ?? "").localeCompare(b.department?.name ?? ""),
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
      render: (_, record) => {
        if (statusUpdatingId === record.id) return <Spin size="small" />;
        if (!can("event.update-status")) {
          return <Tag color={STATUS_COLORS[record.status]}>{STATUS_OPTIONS.find((s) => s.value === record.status)?.label}</Tag>;
        }
        return (
          <Select
            className="assignment-select"
            size="small"
            value={record.status}
            options={STATUS_OPTIONS}
            onChange={(val) => handleStatusChange(record, val)}
            style={{ width: "100%" }}
          />
        );
      },
    },
    {
      title: "Actions",
      width: 130,
      align: "center",
      render: (_, record) => (
        <Space>
          {can("event.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
          {can("event.update-time") && (
            <Tooltip title="Edit Time">
              <Button size="small" icon={<ClockCircleOutlined />} onClick={() => openTimeModal(record)} />
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

      {/* Add / Edit Modal */}
      <Modal
        title={editingRecord ? "Edit Event" : "Add Event"}
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
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter an event name." },
              { max: 150, message: "Maximum 150 characters." },
            ]}
          >
            <Input placeholder="Event name" />
          </Form.Item>

          <Form.Item
            name="categoryId"
            label="Category"
            rules={[{ required: true, message: "Please select a category." }]}
          >
            <Select
              className="assignment-select"
              placeholder="Select category"
              options={activeCategoryOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="departmentId"
            label="Department"
            rules={[{ required: true, message: "Please select a department." }]}
          >
            <Select
              className="assignment-select"
              placeholder="Select department"
              options={activeDepartmentOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item name="eventDate" label="Date">
            <DatePicker className="assignment-select" style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Time Modal */}
      <Modal
        title="Edit Event Time"
        open={!!timeModalRecord}
        onCancel={() => { setTimeModalRecord(null); timeForm.resetFields(); }}
        onOk={() => timeForm.submit()}
        okText="Save"
        confirmLoading={timeModalLoading}
        destroyOnClose
        centered
      >
        <Form
          form={timeForm}
          layout="vertical"
          onFinish={handleTimeModalFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="startTime"
            label="Start Time"
            dependencies={["endTime"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const endTime = getFieldValue("endTime");
                  if (!value || !endTime || value.isBefore(endTime)) return Promise.resolve();
                  return Promise.reject(new Error("Start time must be before end time."));
                },
              }),
            ]}
          >
            <TimePicker className="assignment-select" style={{ width: "100%" }} format="HH:mm" />
          </Form.Item>
          <Form.Item
            name="endTime"
            label="End Time"
            dependencies={["startTime"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startTime = getFieldValue("startTime");
                  if (!value || !startTime || value.isAfter(startTime)) return Promise.resolve();
                  return Promise.reject(new Error("End time must be after start time."));
                },
              }),
            ]}
          >
            <TimePicker className="assignment-select" style={{ width: "100%" }} format="HH:mm" />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

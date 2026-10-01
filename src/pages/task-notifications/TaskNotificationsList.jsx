import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip, Pagination, Modal, Form, InputNumber,
  Typography, Row, Col, Descriptions, message,
} from "antd";
import { EditOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getTaskNotifications, createTaskNotification, updateTaskNotification, setTaskNotificationStatus,
} from "../../api/taskNotificationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import {
  OFFSET_DIRECTION_OPTIONS, OFFSET_UNIT_OPTIONS, TASK_NOTIFICATION_BASIS_OPTIONS,
  TASK_NOTIFICATION_RECIPIENT_OPTIONS, describeTaskNotificationTime,
} from "../../utils/offsets";
import { useAuth } from "../../context/useAuth";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const RECIPIENT_LABELS = Object.fromEntries(TASK_NOTIFICATION_RECIPIENT_OPTIONS.map((o) => [o.value, o.label]));

const whenText = (n) => describeTaskNotificationTime(n.offsetBasis, n.offsetDirection, n.offsetValue, n.offsetUnit);

const searchableColumns = [
  { value: "name",       label: "Name" },
  { value: "when",       label: "When" },
  { value: "recipients", label: "Recipients" },
  { value: "status",     label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "when") return whenText(item);
  if (key === "recipients") return RECIPIENT_LABELS[item.recipients] ?? "";
  return item[key] ?? "";
};

// A new notification starts as "on task opening, to the assignee".
const NEW_NOTIFICATION_DEFAULTS = {
  offsetBasis: "open_time",
  offsetValue: 0,
  offsetUnit: "days",
  offsetDirection: "after",
  recipients: "assignee",
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

// The notifications tasks can send, set up once and picked by task
// templates. Each says "<task> - <exam or series>", labelled with its name,
// at the time it defines, to the assignee, their senior, or both.
export default function TaskNotificationsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const canEdit = can("task-notification.update");

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    let ignore = false;
    getTaskNotifications()
      .then(({ data }) => { if (!ignore) setNotifications(data); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Could not load task notifications."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return notifications;
    const term = searchTerm.toLowerCase();
    return notifications.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [notifications, searchBy, searchTerm]);

  // ── Actions ──

  const openAddModal = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(NEW_NOTIFICATION_DEFAULTS);
    setModalOpen(true);
  };

  const openEditModal = (notification) => {
    setEditing(notification);
    form.setFieldsValue({
      name: notification.name,
      offsetBasis: notification.offsetBasis,
      offsetValue: notification.offsetValue,
      offsetUnit: notification.offsetUnit,
      offsetDirection: notification.offsetDirection,
      recipients: notification.recipients,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editing) {
        const { data } = await updateTaskNotification(editing.id, values);
        setNotifications((prev) => prev.map((n) => (n.id === data.id ? data : n)));
      } else {
        const { data } = await createTaskNotification(values);
        setNotifications((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      const detail = err.response?.data?.message;
      setError(Array.isArray(detail) ? detail.join(" ") : detail || "Could not save this notification.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggle = (notification) => {
    const activate = !notification.isActive;
    Modal.confirm({
      title: activate ? "Activate Notification" : "Deactivate Notification",
      content: activate
        ? "Tasks made from now on, from templates that picked it, will send this notification."
        : "No new task will send it, and copies still waiting to go out for existing tasks won't be sent. Ones already sent are kept.",
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          const { data } = await setTaskNotificationStatus(notification.id, activate);
          const { droppedCount, ...saved } = data;
          setNotifications((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
          if (droppedCount > 0) {
            message.info(`${droppedCount} pending notification${droppedCount === 1 ? " was" : "s were"} dropped.`);
          }
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Name",       accessor: (r) => r.name },
        { label: "When",       accessor: (r) => whenText(r) },
        { label: "Recipients", accessor: (r) => RECIPIENT_LABELS[r.recipients] || "" },
        { label: "Used By",    accessor: (r) => (r.templates || []).map((t) => t.taskTemplate.name).join(", ") },
        { label: "Status",     accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "task-notifications"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 70, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    { title: "When", width: 240, render: (_, n) => whenText(n) },
    {
      title: "Recipients",
      width: 160,
      sorter: (a, b) => (RECIPIENT_LABELS[a.recipients] ?? "").localeCompare(RECIPIENT_LABELS[b.recipients] ?? ""),
      render: (_, n) => RECIPIENT_LABELS[n.recipients] ?? "—",
    },
    {
      title: "Used By",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.templates?.length ?? 0) - (b.templates?.length ?? 0),
      render: (_, n) => {
        const count = n.templates?.length ?? 0;
        return (
          <Tooltip title={count ? n.templates.map((t) => t.taskTemplate.name).join(", ") : "No task template has picked it yet"}>
            <span>{count} {count === 1 ? "template" : "templates"}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, n) =>
        can("task-notification.activate") ? (
          <Tag color={isActive ? "success" : "default"} style={{ cursor: "pointer" }} onClick={() => handleToggle(n)}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>
        ),
    },
    {
      title: "Actions",
      width: canEdit ? 90 : 60,
      align: "center",
      render: (_, n) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(n)} />
          </Tooltip>
          {canEdit && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(n)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("task-notification.create") ? openAddModal : undefined}>
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

      {/* Everything about one notification, and which templates picked it. */}
      <Modal
        title="Task Notification Details"
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={[
          <Button key="close" onClick={() => setViewing(null)}>Close</Button>,
          ...(canEdit
            ? [
                <Button
                  key="edit"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => { const n = viewing; setViewing(null); openEditModal(n); }}
                >
                  Edit
                </Button>,
              ]
            : []),
        ]}
        width={680}
        destroyOnHidden
        centered
      >
        {viewing && (
          <Descriptions bordered size="small" column={1} labelStyle={{ width: 170, fontWeight: 600 }} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Name">{viewing.name}</Descriptions.Item>
            <Descriptions.Item label="When">{whenText(viewing)}</Descriptions.Item>
            <Descriptions.Item label="Recipients">{RECIPIENT_LABELS[viewing.recipients] ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Used By">
              {(viewing.templates || []).length === 0 ? (
                <Text type="secondary">No task template has picked it yet</Text>
              ) : (
                <Space size={[4, 4]} wrap>
                  {viewing.templates.map(({ taskTemplate }) => (
                    <Tooltip key={taskTemplate.id} title={taskTemplate.activity?.name}>
                      <Tag style={{ marginInlineEnd: 0 }}>{taskTemplate.name}</Tag>
                    </Tooltip>
                  ))}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={viewing.isActive ? "success" : "default"}>{viewing.isActive ? "Active" : "Inactive"}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={editing ? "Edit Task Notification" : "Add Task Notification"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editing ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={980}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="name"
                label="Name"
                tooltip={infoTip("How it's picked on a task template, and the label it's shown with, e.g. [Task Opening] Call for EAF - M-P5-A-2026.")}
                rules={[
                  { required: true, message: "Please name the notification." },
                  { max: 100, message: "Maximum 100 characters." },
                ]}
              >
                <Input placeholder="e.g. Task Opening" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="recipients"
                label="Recipients"
                tooltip={infoTip("Whoever holds the task's designation, the one above it, or both — worked out when it's sent.")}
                rules={[{ required: true, message: "Please choose who receives it." }]}
              >
                <Select options={TASK_NOTIFICATION_RECIPIENT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="offsetBasis"
                label="Measured From"
                tooltip={infoTip("The task's own times. Grace Period End is the due time plus the template's grace period — the due time itself when it has none. One measured from Task Opening waits until the task has actually opened.")}
                rules={[{ required: true, message: "Please choose what it is measured from." }]}
              >
                <Select options={TASK_NOTIFICATION_BASIS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Offset" required tooltip={infoTip("0 sends it right at that moment.")}>
                <Space.Compact block>
                  <Form.Item name="offsetValue" noStyle rules={[{ required: true, message: "Enter the offset." }]}>
                    <InputNumber min={0} placeholder="0" style={{ width: "28%" }} />
                  </Form.Item>
                  <Form.Item name="offsetUnit" noStyle rules={[{ required: true, message: "Choose the unit." }]}>
                    <Select options={OFFSET_UNIT_OPTIONS} style={{ width: "36%" }} />
                  </Form.Item>
                  <Form.Item name="offsetDirection" noStyle rules={[{ required: true, message: "Choose before or after." }]}>
                    <Select options={OFFSET_DIRECTION_OPTIONS} style={{ width: "36%" }} />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, Descriptions, Tabs, Typography,
} from "antd";

const { Text } = Typography;
import { EditOutlined, EyeOutlined, SendOutlined, DownloadOutlined, StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getNotifications, getNotification, createNotification,
  updateNotification, sendNotification, setNotificationActiveStatus,
} from "../../api/notificationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { useAuth } from "../../context/AuthContext";
import AudiencePicker from "./AudiencePicker";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_COLORS = { draft: "default", scheduled: "processing", sent: "success" };
const STATUS_LABELS = { draft: "Draft", scheduled: "Scheduled", sent: "Sent" };

const recipientName = (user) => {
  const person = user.employee || user.student;
  if (person) return [person.firstName, person.lastName].filter(Boolean).join(" ");
  return user.email;
};

const CATEGORY_TABS = [
  { key: "manual", label: "Manual" },
  { key: "automatic", label: "Automatic" },
];

const searchableColumns = [
  { value: "subject", label: "Subject" },
  { value: "status",  label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return STATUS_LABELS[item.status] ?? "";
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

export default function NotificationsList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryTab, setCategoryTab] = useState("manual");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recipientUserIds, setRecipientUserIds] = useState([]);
  const [form] = Form.useForm();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getNotifications();
      setNotifications(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const filtered = useMemo(() => {
    const inCategory = notifications.filter((n) => n.category === categoryTab);
    if (!searchTerm.trim()) return inCategory;
    const term = searchTerm.toLowerCase();
    return inCategory.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term)
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [notifications, categoryTab, searchBy, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [categoryTab, searchTerm, searchBy, pageSize]);

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setRecipientUserIds([]);
    setModalOpen(true);
  };

  const openEditModal = async (record) => {
    setEditingRecord(record);
    setModalOpen(true);
    setModalLoading(true);
    try {
      const { data } = await getNotification(record.id);
      form.setFieldsValue({
        subject: data.subject,
        message: data.message,
      });
      setRecipientUserIds(data.recipients.map((r) => r.user.id));
    } catch (err) {
      setError(err.response?.data?.message || "Could not load notification details.");
      setModalOpen(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalFinish = async (values) => {
    if (recipientUserIds.length === 0) {
      setError("Please select at least one recipient.");
      return;
    }
    setModalLoading(true);
    try {
      const payload = { ...values, recipientUserIds };
      if (editingRecord) {
        await updateNotification(editingRecord.id, payload);
      } else {
        await createNotification(payload);
      }
      form.resetFields();
      setRecipientUserIds([]);
      setModalOpen(false);
      loadNotifications();
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} notification.`);
    } finally {
      setModalLoading(false);
    }
  };

  const openDetails = async (record) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const { data } = await getNotification(record.id);
      setDetailsRecord(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load notification details.");
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSend = (record) => {
    Modal.confirm({
      title: "Send Notification",
      content: `Send "${record.subject}" to its ${record._count?.recipients ?? ""} recipient(s) now? This cannot be undone.`,
      okText: "Send Now!",
      okButtonProps: { style: { background: "#1AB394", borderColor: "#1AB394" } },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await sendNotification(record.id);
          loadNotifications();
        } catch (err) {
          setError(err.response?.data?.message || "Could not send notification.");
        }
      },
    });
  };

  const handleToggleActive = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Reactivate Notification" : "Cancel Notification",
      content: activate
        ? `Reactivate "${record.subject}"? It will resume sending at its scheduled time if still pending.`
        : `Cancel "${record.subject}"? It stays on record but will not be sent.`,
      okText: activate ? "Reactivate" : "Cancel Notification",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Close",
      centered: true,
      onOk: async () => {
        try {
          await setNotificationActiveStatus(record.id, activate);
          loadNotifications();
        } catch (err) {
          setError(err.response?.data?.message || "Could not update notification status.");
        }
      },
    });
  };

  const handleExport = () => {
    const isAutomatic = categoryTab === "automatic";
    exportToExcel(
      filtered,
      [
        { label: "S.No.",      accessor: (_, i) => i + 1 },
        { label: "Subject",    accessor: (r) => r.subject },
        ...(isAutomatic ? [{ label: "Template", accessor: (r) => r.template?.name || "" }] : []),
        { label: "Status",     accessor: (r) => STATUS_LABELS[r.status] },
        { label: "Recipients", accessor: (r) => r._count?.recipients ?? 0 },
        ...(isAutomatic ? [
          { label: "Scheduled For", accessor: (r) => (r.scheduledFor ? dayjs(r.scheduledFor).format("DD MMM YYYY, hh:mm A") : "") },
          { label: "Active", accessor: (r) => (r.isActive ? "Active" : "Cancelled") },
        ] : []),
        { label: "Sent At",    accessor: (r) => (r.sentAt ? dayjs(r.sentAt).format("DD MMM YYYY, hh:mm A") : "") },
      ],
      "notifications"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const isAutomaticTab = categoryTab === "automatic";

  const columns = [
    {
      title: "S.No.",
      width: 65,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "Subject",
      dataIndex: "subject",
      sorter: (a, b) => a.subject.localeCompare(b.subject),
    },
    ...(isAutomaticTab ? [{
      title: "Template",
      width: 170,
      render: (_, r) => r.template?.name ?? "—",
    }] : []),
    {
      title: "Recipients",
      width: 110,
      align: "center",
      // A scheduled automatic notification has none yet — its audience is
      // resolved on the send date, so whoever holds the role then receives
      // it. Showing 0 would read as "this will reach nobody".
      render: (_, r) =>
        r.status === "scheduled" ? (
          <Tooltip title="Resolved when this sends, from whoever holds the template's audience at that moment">
            <Text type="secondary">On send</Text>
          </Tooltip>
        ) : (
          (r._count?.recipients ?? 0)
        ),
    },
    {
      title: "Status",
      width: 110,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Tag>
          {isAutomaticTab && !r.isActive && <Tag color="error">Cancelled</Tag>}
        </Space>
      ),
    },
    ...(isAutomaticTab ? [{
      title: "Scheduled For",
      width: 170,
      render: (_, r) => (r.scheduledFor ? dayjs(r.scheduledFor).format("DD MMM YYYY, hh:mm A") : "—"),
    }] : []),
    {
      title: "Sent At",
      width: 170,
      render: (_, r) => (r.sentAt ? dayjs(r.sentAt).format("DD MMM YYYY, hh:mm A") : "—"),
    },
    {
      title: "Actions",
      width: 130,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetails(record)} />
          </Tooltip>
          {!isAutomaticTab && record.status === "draft" && can("notification.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
          {!isAutomaticTab && record.status === "draft" && can("notification.send") && (
            <Tooltip title="Send Now">
              <Button size="small" icon={<SendOutlined />} onClick={() => handleSend(record)} />
            </Tooltip>
          )}
          {isAutomaticTab && can("notification.update") && (
            <Tooltip title={record.isActive ? "Cancel" : "Reactivate"}>
              <Button
                size="small"
                danger={record.isActive}
                icon={record.isActive ? <StopOutlined /> : <CheckCircleOutlined />}
                onClick={() => handleToggleActive(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout onAdd={can("notification.create") ? openAddModal : undefined}>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <Tabs
            activeKey={categoryTab}
            onChange={setCategoryTab}
            items={CATEGORY_TABS}
            className="no-border-tabs"
            style={{ marginBottom: 0 }}
          />

          <div className="list-toolbar" style={{ marginBottom: 0 }}>
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
        title={editingRecord ? "Edit Notification" : "Add Notification"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setRecipientUserIds([]); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Create Draft"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleModalFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="subject"
            label="Subject"
            rules={[
              { required: true, message: "Please enter a subject for this notification." },
              { max: 200, message: "Maximum 200 characters." },
            ]}
          >
            <Input placeholder="e.g. Hall Preparation Reminder" />
          </Form.Item>

          <Form.Item
            name="message"
            label="Message"
            rules={[{ required: true, message: "Please enter the notification message." }]}
          >
            <Input.TextArea rows={3} placeholder="e.g. Please prepare the seating plan for the exam." />
          </Form.Item>

          <Form.Item label="Audience" required>
            <AudiencePicker value={recipientUserIds} onChange={setRecipientUserIds} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Notification Details"
        open={detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        footer={null}
        centered
        width={720}
      >
        {detailsRecord && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Subject" span={2}>{detailsRecord.subject}</Descriptions.Item>
              <Descriptions.Item label="Message" span={2}>{detailsRecord.message}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[detailsRecord.status]}>{STATUS_LABELS[detailsRecord.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Sent At">
                {detailsRecord.sentAt ? dayjs(detailsRecord.sentAt).format("DD MMM YYYY, hh:mm A") : "—"}
              </Descriptions.Item>
              {detailsRecord.category === "automatic" && (
                <>
                  <Descriptions.Item label="Template">{detailsRecord.template?.name ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Scheduled For">
                    {detailsRecord.scheduledFor ? dayjs(detailsRecord.scheduledFor).format("DD MMM YYYY, hh:mm A") : "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Active" span={2}>
                    <Tag color={detailsRecord.isActive ? "success" : "error"}>{detailsRecord.isActive ? "Active" : "Cancelled"}</Tag>
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            {/* A scheduled notification has no recipients yet, so the read
                report below would look like nobody is getting it. */}
            {detailsRecord.status === "scheduled" && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 16 }}
                message="Recipients are worked out when this sends, from whoever holds the template's audience at that moment — not from who holds it today."
              />
            )}

            <Tabs
              size="small"
              items={["faculty", "administrative", "candidates"].map((groupKey) => {
                const label = groupKey === "faculty" ? "Faculty" : groupKey === "administrative" ? "Adm Staff" : "Candidates";
                const rows = detailsRecord.recipients.filter((r) =>
                  groupKey === "candidates"
                    ? !!r.user.student
                    : r.user.employee?.employeeCategory === groupKey
                );
                const readReportColumns = [
                  { title: "User Name", render: (_, r) => recipientName(r.user) },
                  ...(groupKey !== "candidates"
                    ? [{ title: "Department", render: (_, r) => r.user.employee?.department?.name ?? "—" }]
                    : []),
                  {
                    title: "Read Status",
                    width: 110,
                    render: (_, r) => <Tag color={r.isRead ? "success" : "default"}>{r.isRead ? "Read" : "Unread"}</Tag>,
                  },
                  {
                    title: "Read At",
                    width: 170,
                    render: (_, r) => (r.readAt ? dayjs(r.readAt).format("DD MMM YYYY, hh:mm A") : "—"),
                  },
                ];
                return {
                  key: groupKey,
                  label: `${label}${rows.length ? ` (${rows.length})` : ""}`,
                  children: (
                    <Table
                      rowKey="id"
                      dataSource={rows}
                      loading={detailsLoading}
                      size="small"
                      pagination={false}
                      scroll={{ y: 195 }}
                      columns={readReportColumns}
                    />
                  ),
                };
              })}
            />
          </>
        )}
      </Modal>
    </DashboardLayout>
  );
}

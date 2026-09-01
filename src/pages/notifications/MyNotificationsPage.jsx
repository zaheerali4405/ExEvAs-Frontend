import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { List, Tag, Segmented, Typography, Alert, Empty, Badge, Button } from "antd";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getMyNotifications, markNotificationRead } from "../../api/notificationsApi";

const { Text } = Typography;

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Read", value: "read" },
];

const formatDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "");

const receivedReadLabel = (item) => {
  const received = `Received: ${formatDateTime(item.notification.sentAt)}`;
  if (item.isRead && item.readAt) {
    return `${received} . Read: ${formatDateTime(item.readAt)}`;
  }
  return received;
};

export default function MyNotificationsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const itemRefs = useRef(new Map());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getMyNotifications();
      setItems(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!highlightId || loading) return;
    const node = itemRefs.current.get(String(highlightId));
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, loading, items]);

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((i) => !i.isRead);
    if (filter === "read") return items.filter((i) => i.isRead);
    return items;
  }, [items, filter]);

  const handleMarkRead = async (item) => {
    try {
      await markNotificationRead(item.notification.id);
      setItems((prev) =>
        prev.map((i) =>
          i.recipientId === item.recipientId ? { ...i, isRead: true, readAt: new Date().toISOString() } : i
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not mark notification as read.");
    }
  };

  return (
    <DashboardLayout>
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
        <div style={{ marginBottom: 16 }}>
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <List
          loading={loading}
          dataSource={filtered}
          locale={{ emptyText: <Empty description="No notifications" /> }}
          renderItem={(item) => {
            const isHighlighted = highlightId && String(item.notification.id) === highlightId;
            return (
              <List.Item
                ref={(node) => {
                  if (node) itemRefs.current.set(String(item.notification.id), node);
                  else itemRefs.current.delete(String(item.notification.id));
                }}
                style={{
                  background: isHighlighted ? "#e6f7f2" : item.isRead ? "transparent" : "#f0f9f7",
                  border: isHighlighted ? "1px solid #1AB394" : "1px solid transparent",
                  padding: "12px 16px",
                  borderRadius: 6,
                  marginBottom: 4,
                }}
                actions={[
                  item.isRead ? (
                    <Tag color="success">Read</Tag>
                  ) : (
                    <Button size="small" onClick={() => handleMarkRead(item)}>
                      Mark As Read
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  avatar={<Badge dot={!item.isRead} offset={[-2, 2]} color="#1AB394" />}
                  title={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Text strong={!item.isRead}>{item.notification.subject}</Text>
                    </div>
                  }
                  description={
                    <div>
                      <div>{item.notification.message}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {receivedReadLabel(item)}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      </PageCard>
    </DashboardLayout>
  );
}

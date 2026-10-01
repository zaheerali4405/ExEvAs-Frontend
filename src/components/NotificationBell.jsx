import { useState, useEffect } from "react";
import { Badge, Dropdown, Button, List, Typography, Empty, Tag } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { getMyNotifications } from "../api/notificationsApi";

const { Text } = Typography;
const POLL_INTERVAL_MS = 30000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  // Polls on a timer; each response lands in state from its own callback.
  useEffect(() => {
    let ignore = false;
    const poll = () =>
      getMyNotifications()
        .then(({ data }) => { if (!ignore) setItems(data); })
        .catch(() => {
          // Silent — the bell is a convenience surface, not a critical path.
        });
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = items.filter((i) => !i.isRead).length;
  const recent = items.slice(0, 5);

  // Marking as read is now an explicit action on the My Notifications page
  // itself — clicking here only navigates there and highlights the item.
  const handleItemClick = (item) => {
    setOpen(false);
    navigate(`/my-notifications?highlight=${item.notification.id}`);
  };

  const dropdownContent = (
    <div style={{ width: 340, background: "#fff", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 600 }}>
        Notifications
      </div>
      <List
        dataSource={recent}
        locale={{ emptyText: <Empty description="No notifications" style={{ padding: 16 }} /> }}
        renderItem={(item) => (
          <List.Item
            onClick={() => handleItemClick(item)}
            style={{
              cursor: "pointer",
              padding: "10px 16px",
              background: item.isRead ? "transparent" : "#f0f9f7",
            }}
          >
            <List.Item.Meta
              title={
                <>
                  {item.notification.taskNotification && (
                    <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 6 }}>{item.notification.taskNotification.name}</Tag>
                  )}
                  <Text strong={!item.isRead} style={{ fontSize: 13 }}>{item.notification.subject}</Text>
                </>
              }
              description={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.notification.sentAt ? dayjs(item.notification.sentAt).format("DD MMM, hh:mm A") : ""}
                </Text>
              }
            />
          </List.Item>
        )}
      />
      <div style={{ padding: 8, borderTop: "1px solid #f0f0f0", textAlign: "center" }}>
        <Button type="link" size="small" onClick={() => { setOpen(false); navigate("/my-notifications"); }}>
          View All
        </Button>
      </div>
    </div>
  );

  return (
    <Dropdown
      popupRender={() => dropdownContent}
      trigger={["click"]}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ color: "#ffffff", fontSize: 18 }} />}
          shape="circle"
        />
      </Badge>
    </Dropdown>
  );
}

import { useState } from "react";
import { Timeline, Typography, Popover, Button, theme } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { describeHistoryEntry } from "../../utils/taskStatus";

const { Text, Paragraph } = Typography;

const formatDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—");
const ACTION_LABELS = { okay: "accepted it", forwarded: "forwarded it", reassigned: "re-assigned the task" };

// A task's history, oldest first: every status change with when it happened,
// who made it and their comment, and where each update went and what the
// recipient did with it. A task not open yet ends with when it will open.
export function TaskHistoryTimeline({ task }) {
  const { token } = theme.useToken();

  const items = (task.history ?? []).map((h) => ({
    color:
      h.kind === "paused" ? "orange" : h.toStatus === "cancelled" ? "red" : h.toStatus === "completed" ? "green" : "blue",
    children: (
      <>
        <div>{describeHistoryEntry(h)}</div>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(h.at)}</Text>
        {h.comment && <Paragraph style={{ margin: "4px 0 0" }} type="secondary">"{h.comment}"</Paragraph>}
        {h.deliveries?.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {h.deliveries.map((d) => (
              <div key={d.id} style={{ fontSize: 12, color: token.colorTextSecondary }}>
                {d.forwarded ? `${d.sentBy} forwarded it to ${d.sentTo}` : `Sent to ${d.sentTo}`}
                {d.action ? ` — ${d.actedBy} ${ACTION_LABELS[d.action]}` : " — waiting"}
              </div>
            ))}
          </div>
        )}
      </>
    ),
  }));

  if (task.status === "inactive") {
    items.push({
      color: "gray",
      children: (
        <>
          <div>{task.isPaused ? "On hold" : "Not open yet"}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {task.openAt ? `Opens ${formatDateTime(task.openAt)}` : "Opens once its exam has the date or time it needs"}
          </Text>
        </>
      ),
    });
  }

  return <Timeline items={items} />;
}

// The History button beside the assignee's status steps: the same timeline in
// a popover, so a glance at it never moves them off the task.
export function TaskHistoryButton({ task }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      title="History"
      content={
        <div style={{ width: 340, maxHeight: 420, overflowY: "auto", paddingTop: 8, paddingRight: 4 }}>
          <TaskHistoryTimeline task={task} />
        </div>
      }
    >
      <Button size="small" icon={<HistoryOutlined />}>History</Button>
    </Popover>
  );
}

import { useState } from "react";
import { Steps, Button, Input, Tag, Typography } from "antd";
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "../../utils/taskStatus";
import { TaskHistoryButton } from "./TaskHistory";

const { Text } = Typography;

// The assignee's path through a task, left to right. Steps may be skipped but
// never walked back, and cancelling sits outside the path — the backend holds
// the same rule.
const PATH = ["active", "pending", "in_process", "completed"];

// The assignee's status control: the task's progress as steps, where any
// later step is a click away. Picking one opens a small composer for an
// optional comment to the senior; sending it marks the status. onSubmit(status,
// comment) resolves true when it went through.
export default function TaskStatusControl({ task, onSubmit, saving }) {
  const [target, setTarget] = useState(null);
  const [comment, setComment] = useState("");

  const current = PATH.indexOf(task.status);
  const cancelled = task.status === "cancelled";
  const finished = task.status === "completed" || cancelled;
  const editable = !finished && !task.isPaused;

  const choose = (status) => {
    setTarget(status);
    setComment("");
  };

  const send = async () => {
    const ok = await onSubmit(target, comment.trim() || undefined);
    if (ok) {
      setTarget(null);
      setComment("");
    }
  };

  if (cancelled) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Tag color={TASK_STATUS_COLORS.cancelled} style={{ marginInlineEnd: 0 }}>Cancelled</Tag>
        <TaskHistoryButton task={task} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Steps
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          current={current}
          status={task.status === "completed" ? "finish" : "process"}
          onChange={editable ? (i) => choose(PATH[i]) : undefined}
          items={PATH.map((s, i) => ({
            title: TASK_STATUS_LABELS[s],
            // Only steps ahead of where the task is can be picked.
            disabled: !editable || i <= current,
          }))}
        />
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <TaskHistoryButton task={task} />
          {editable && (
            <Button danger size="small" onClick={() => choose("cancelled")}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {editable && !target && (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
          Click a step to move the task forward.
        </Text>
      )}

      {target && (
        // One row: the comment box, then its two buttons on the right. The
        // buttons stay at the top as a long comment grows the box.
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
          <Input.TextArea
            autoFocus
            autoSize={{ minRows: 1, maxRows: 5 }}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) send();
            }}
            placeholder="Add Comments (Optional)"
            style={{ flex: 1, minWidth: 0 }}
          />
          {/* When the task itself is being cancelled, "Close" keeps the
              button that shuts this box from reading like "Cancel task". */}
          <Button onClick={() => setTarget(null)} disabled={saving} style={{ flex: "none" }}>
            {target === "cancelled" ? "Close" : "Cancel"}
          </Button>
          <Button
            type="primary"
            danger={target === "cancelled"}
            loading={saving}
            onClick={send}
            style={{ flex: "none" }}
          >
            {target === "cancelled" ? "Cancel task" : `Mark ${TASK_STATUS_LABELS[target]}`}
          </Button>
        </div>
      )}
    </div>
  );
}

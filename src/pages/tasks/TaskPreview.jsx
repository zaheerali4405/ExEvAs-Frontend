import { useState, useEffect, useCallback } from "react";
import {
  Tag, Typography, Button, Select, Input, Alert, Spin, Space, Avatar, Modal, message, theme,
} from "antd";
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SwapOutlined } from "@ant-design/icons";
import {
  getTask, changeTaskStatus, cancelTask, pauseTask, resumeTask, adminReassignTask, getTaskDesignationOptions,
} from "../../api/tasksApi";
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "../../utils/taskStatus";
import { useAuth } from "../../context/AuthContext";
import TaskDetailsSections from "./TaskDetailsSections";
import TaskStatusControl from "./TaskStatusControl";
import { TaskHistoryTimeline } from "./TaskHistory";

const { Text, Title } = Typography;

const FINAL = ["completed", "cancelled"];

const initials = (name) =>
  (name || "?")
    .replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

// The right-hand pane: one task in full. mode "mine" is the assignee's view,
// with the step control for its status under the title; mode "admin" shows who holds the task
// and the admin's actions — re-assign, hold or resume, cancel — each allowed
// by its own permission. onChanged is told the refreshed task after any
// change, so the list can update that row.
export default function TaskPreview({ taskId, mode, onChanged }) {
  const { token } = theme.useToken();
  const { can } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The admin's re-assign.
  const [reassigning, setReassigning] = useState(false);
  const [designations, setDesignations] = useState([]);
  const [target, setTarget] = useState(null);
  const [reassignComment, setReassignComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getTask(taskId);
      setTask(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this task.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setTask(null);
    setReassigning(false);
    load();
  }, [load]);

  const done = (data) => {
    setTask(data);
    onChanged?.(data);
  };

  // The assignee marking a status from the step control, confirmed with a
  // short toast naming who it went to.
  const markStatus = async (status, comment) => {
    const ok = await run(() => changeTaskStatus(task.id, status, comment));
    if (ok) {
      const to = task.senior?.holders?.[0];
      message.success(`Marked ${TASK_STATUS_LABELS[status]}${to ? ` · sent to ${to}` : ""}`);
    }
    return ok;
  };

  const run = async (request) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await request();
      // The assignee's status change answers without history, so reload.
      if (data.history) done(data);
      else {
        const { data: full } = await getTask(taskId);
        done(full);
      }
      return true;
    } catch (err) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" ") : message || "Could not complete that action.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Cancel, hold and resume ask for an optional reason first.
  const confirmWithReason = ({ title, okText, danger, request }) => {
    let reason = "";
    Modal.confirm({
      title,
      centered: true,
      okText,
      okButtonProps: danger ? { danger: true } : { style: { background: "#1AB394", borderColor: "#1AB394" } },
      content: (
        <Input.TextArea
          rows={3}
          maxLength={2000}
          placeholder="Reason (optional) — kept in the task's history"
          onChange={(e) => { reason = e.target.value; }}
          style={{ marginTop: 8 }}
        />
      ),
      onOk: () => run(() => request(reason.trim() || undefined)),
    });
  };

  const startReassign = async () => {
    setReassigning(true);
    setTarget(null);
    setReassignComment("");
    if (designations.length === 0) {
      try { const { data } = await getTaskDesignationOptions(); setDesignations(data); } catch { /* stays empty */ }
    }
  };

  if (loading && !task) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin /></div>;
  if (!task) return error ? <Alert type="error" showIcon message={error} /> : null;

  const isFinal = FINAL.includes(task.status);
  const holders = task.assigneeHolders?.length ? task.assigneeHolders.join(", ") : "No one holds this designation";
  const senior = task.senior;
  const seniorText = senior
    ? `${senior.holders?.length ? senior.holders.join(", ") : "no one"} · ${senior.name}`
    : null;

  // ── The admin's action strip, under the details ──
  // (The assignee's status control sits under the title instead.)
  let actionStrip = null;
  if (mode === "mine") {
    if (task.isPaused) {
      actionStrip = <Alert type="warning" showIcon message="This task is on hold. You can update it once it's resumed." />;
    }
  } else {
    const buttons = [];
    if (!isFinal && can("task.update")) {
      buttons.push(<Button key="reassign" icon={<SwapOutlined />} onClick={startReassign}>Re-assign</Button>);
    }
    if (!isFinal && can("task.activate")) {
      buttons.push(
        task.isPaused ? (
          <Button
            key="resume"
            icon={<PlayCircleOutlined />}
            onClick={() => confirmWithReason({ title: `Resume "${task.name}"?`, okText: "Resume", request: (r) => resumeTask(task.id, r) })}
          >
            Resume
          </Button>
        ) : (
          <Button
            key="pause"
            icon={<PauseCircleOutlined />}
            onClick={() => confirmWithReason({ title: `Put "${task.name}" on hold?`, okText: "Put on hold", request: (r) => pauseTask(task.id, r) })}
          >
            Put on hold
          </Button>
        )
      );
    }
    if (!isFinal && can("task.cancel")) {
      buttons.push(
        <Button
          key="cancel"
          danger
          icon={<StopOutlined />}
          onClick={() => confirmWithReason({ title: `Cancel "${task.name}"?`, okText: "Cancel task", danger: true, request: (r) => cancelTask(task.id, r) })}
        >
          Cancel task
        </Button>
      );
    }
    actionStrip = (
      <div style={{ background: token.colorFillQuaternary, borderRadius: token.borderRadius, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar style={{ background: token.colorPrimaryBg, color: token.colorPrimaryText, flex: "none" }}>
            {initials(task.assigneeHolders?.[0] ?? task.assigneeDesignation?.name)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{holders}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {task.assigneeDesignation?.name}
              {seniorText ? ` · reports to ${seniorText}` : " · reports to no one"}
            </Text>
          </div>
        </div>
        {buttons.length > 0 && !reassigning && <Space wrap style={{ marginTop: 12 }}>{buttons}</Space>}
        {reassigning && (
          <div style={{ marginTop: 12 }}>
            <Select
              style={{ width: "100%" }}
              placeholder="Re-assign to a designation"
              showSearch
              optionFilterProp="label"
              value={target}
              onChange={setTarget}
              options={designations
                .filter((d) => d.id !== task.assigneeDesignation?.id)
                .map((d) => ({ value: d.id, label: d.name }))}
            />
            <Input.TextArea
              rows={2}
              maxLength={2000}
              value={reassignComment}
              onChange={(e) => setReassignComment(e.target.value)}
              placeholder="Reason (optional) — kept in the task's history"
              style={{ marginTop: 8 }}
            />
            <Space style={{ marginTop: 8 }}>
              <Button onClick={() => setReassigning(false)} disabled={saving}>Back</Button>
              <Button
                type="primary"
                disabled={!target}
                loading={saving}
                onClick={async () => {
                  const ok = await run(() => adminReassignTask(task.id, target, reassignComment.trim() || undefined));
                  if (ok) setReassigning(false);
                }}
              >
                Re-assign
              </Button>
            </Space>
          </div>
        )}
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }}>{task.name}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {task.isOneOff
              ? "One-off task"
              : [task.taskTemplate?.workflow?.name, task.taskTemplate?.activity?.name].filter(Boolean).join(" · ")}
          </Text>
        </div>
        <Space size={4} wrap>
          {task.isPaused && <Tag color="warning">On hold</Tag>}
          {/* The assignee's step control shows the status itself. */}
          {mode !== "mine" && <Tag color={TASK_STATUS_COLORS[task.status]}>{TASK_STATUS_LABELS[task.status]}</Tag>}
        </Space>
      </div>

      {mode === "mine" && <TaskStatusControl task={task} onSubmit={markStatus} saving={saving} />}

      <TaskDetailsSections task={task} />

      {actionStrip}

      {/* The assignee reaches the history from the History button beside
          the status steps; the admin's preview has no steps, so it's here. */}
      {mode !== "mine" && (
        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>History</Text>
          <TaskHistoryTimeline task={task} />
        </div>
      )}
    </Space>
  );
}

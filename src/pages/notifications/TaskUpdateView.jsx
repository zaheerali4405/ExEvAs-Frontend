import { useState, useEffect, useMemo } from "react";
import {
  Tag, Timeline, Button, Select, Input, Alert, Spin, Typography, Space,
} from "antd";
import dayjs from "dayjs";
import {
  getTaskUpdate, okayTaskUpdate, forwardTaskUpdate, reassignTask, getTaskDesignationOptions,
} from "../../api/tasksApi";
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "../../utils/taskStatus";
import TaskDetailsSections from "../tasks/TaskDetailsSections";

const { Text, Paragraph } = Typography;

const formatDateTime = (val) => (val ? dayjs(val).format("DD MMM YYYY, hh:mm A") : "—");

const ACTION_LABELS = { okay: "accepted it", forwarded: "forwarded it", reassigned: "re-assigned the task" };

// A status update as delivered to the person reading it: which task, for
// which exam, when it became active, when it's due and its grace period, what
// the assignee marked, and every hop it has taken to get here. The reader can
// accept it, forward it on unchanged, or re-assign the task — once.
//
// Used in two places: the window My Notifications opens, and the preview pane
// of My Tasks' Sent to me tab. onActed is told after any action, with the
// refreshed status update.
export default function TaskUpdateView({ deliveryId, onActed }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [designations, setDesignations] = useState([]);
  const [mode, setMode] = useState(null); // null | "forward" | "reassign"
  const [targetIds, setTargetIds] = useState([]);
  const [targetId, setTargetId] = useState(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!deliveryId) return;
    setDetail(null);
    setError("");
    setMode(null);
    setLoading(true);
    (async () => {
      try {
        const [{ data }, { data: options }] = await Promise.all([
          getTaskUpdate(deliveryId),
          getTaskDesignationOptions(),
        ]);
        setDetail(data);
        setDesignations(options);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load this status update.");
      } finally {
        setLoading(false);
      }
    })();
  }, [deliveryId]);

  const designationOptions = useMemo(
    () => designations.map((d) => ({ value: d.id, label: d.name })),
    [designations]
  );
  // A task can't be re-assigned to the designation that already has it.
  const reassignOptions = useMemo(
    () => designationOptions.filter((o) => o.value !== detail?.task?.assigneeDesignation?.id),
    [designationOptions, detail]
  );

  const startMode = (next) => {
    setMode(next);
    setTargetIds([]);
    setTargetId(null);
    setComment("");
  };

  const act = async (request) => {
    setSubmitting(true);
    setError("");
    try {
      const { data } = await request();
      setDetail(data);
      setMode(null);
      onActed?.(data);
    } catch (err) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" ") : message || "Could not complete that action.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !detail) {
    return (
      <>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>{loading && <Spin />}</div>
      </>
    );
  }

  const task = detail.task;
  const update = detail.statusUpdate;

  // The trail, oldest hop first: who received it, who forwarded it on and
  // with what comment, and what each holder did with it.
  const timelineItems = (detail.trail ?? []).flatMap((hop, index) => {
    const items = [
      {
        color: "gray",
        children: (
          <>
            <div>
              {index === 0 ? (
                <>Sent to <Text strong>{hop.sentTo}</Text></>
              ) : (
                <><Text strong>{hop.sentBy}</Text> forwarded it to <Text strong>{hop.sentTo}</Text></>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(hop.sentAt)}</Text>
            {hop.comment && <Paragraph style={{ margin: "4px 0 0" }} type="secondary">"{hop.comment}"</Paragraph>}
          </>
        ),
      },
    ];
    if (hop.action) {
      items.push({
        color: hop.action === "reassigned" ? "orange" : "green",
        children: (
          <>
            <div>
              <Text strong>{hop.actedBy}</Text> {ACTION_LABELS[hop.action]}
              {hop.action === "forwarded" && hop.forwardedTo.length > 0 && <> to {hop.forwardedTo.join(", ")}</>}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(hop.actedAt)}</Text>
            {hop.actionComment && hop.action !== "forwarded" && (
              <Paragraph style={{ margin: "4px 0 0" }} type="secondary">"{hop.actionComment}"</Paragraph>
            )}
          </>
        ),
      });
    }
    return items;
  });

  const ready = mode === "forward" ? targetIds.length > 0 : !!targetId;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} />}

      <div>
        <Text strong>{update.changedBy ?? "The system"}</Text> marked this task{" "}
        <Tag color={TASK_STATUS_COLORS[update.toStatus]} style={{ marginInlineEnd: 0 }}>
          {TASK_STATUS_LABELS[update.toStatus]}
        </Tag>
        {update.fromStatus && update.fromStatus !== update.toStatus && (
          <Text type="secondary"> (was {TASK_STATUS_LABELS[update.fromStatus]})</Text>
        )}
        <div><Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(update.changedAt)}</Text></div>
        {update.comment && <Paragraph style={{ margin: "6px 0 0" }}>"{update.comment}"</Paragraph>}
      </div>

      <TaskDetailsSections task={task} />

      <div>
        <Text strong style={{ display: "block", marginBottom: 12 }}>Trail</Text>
        <Timeline items={timelineItems} />
      </div>

      {!detail.canAct && detail.action && (
        <Alert type="success" showIcon message="This status update has been dealt with." />
      )}

      {detail.canAct && !mode && (
        <Space wrap style={{ justifyContent: "flex-end", width: "100%" }}>
          <Button onClick={() => startMode("reassign")}>Re-assign</Button>
          <Button onClick={() => startMode("forward")}>Forward</Button>
          <Button type="primary" loading={submitting} onClick={() => act(() => okayTaskUpdate(deliveryId))}>
            Okay
          </Button>
        </Space>
      )}

      {mode && (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Text strong>{mode === "forward" ? "Forward to" : "Re-assign the task to"}</Text>
          {mode === "forward" ? (
            <Select
              id="task-update-forward-to"
              mode="multiple"
              placeholder="Select designations"
              options={designationOptions}
              value={targetIds}
              onChange={setTargetIds}
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
            />
          ) : (
            <Select
              id="task-update-reassign-to"
              placeholder="Select a designation"
              options={reassignOptions}
              value={targetId}
              onChange={setTargetId}
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
            />
          )}
          <Input.TextArea
            id="task-update-comment"
            rows={3}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              mode === "forward" ? "Optional — sent along with the update" : "Optional — why it's being re-assigned"
            }
          />
          <Space style={{ justifyContent: "flex-end", width: "100%" }}>
            <Button onClick={() => setMode(null)} disabled={submitting}>Back</Button>
            <Button
              type="primary"
              disabled={!ready}
              loading={submitting}
              onClick={() =>
                act(() =>
                  mode === "forward"
                    ? forwardTaskUpdate(deliveryId, targetIds, comment.trim() || undefined)
                    : reassignTask(deliveryId, targetId, comment.trim() || undefined)
                )
              }
            >
              {mode === "forward" ? "Forward" : "Re-assign"}
            </Button>
          </Space>
        </Space>
      )}
    </Space>
  );
}

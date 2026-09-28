// Task statuses and how a task is described, shared by the Tasks and My Tasks
// pages and the status update review. Mirrors TaskStatus in the backend.

export const TASK_STATUS_LABELS = {
  inactive: "Inactive",
  active: "Active",
  pending: "Pending",
  in_process: "In Process",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_COLORS = {
  inactive: "default",
  active: "processing",
  pending: "gold",
  in_process: "geekblue",
  completed: "success",
  cancelled: "default",
};

// The statuses a task is being worked in — open, not yet opened, and not
// finished. What the assignee may move one to next is shown by the step
// control in TaskStatusControl.jsx; the backend enforces the same rule.
const OPEN_STATUSES = ["active", "pending", "in_process"];

export const isOpenStatus = (status) => OPEN_STATUSES.includes(status);

// What a task is for: one exam, a whole exam series with the exams it covers,
// or — for a one-off task — nothing. The backend sends at most one of the
// two, so everything that displays a task reads it the same way here.
export function taskSubject(task) {
  if (task?.series) {
    const count = task.series.examCount ?? (task.series.exams?.length ?? 0);
    return {
      kind: "series",
      isSeries: true,
      title: task.series.shortName || task.series.fullName,
      fullTitle: task.series.fullName,
      subtitle: `${count} exam${count === 1 ? "" : "s"} in this series`,
      exams: task.series.exams ?? [],
    };
  }
  if (task?.event) {
    return {
      kind: "exam",
      isSeries: false,
      title: task.event.shortName,
      fullTitle: task.event.fullName,
      subtitle: null,
      exams: [task.event],
    };
  }
  return { kind: "none", isSeries: false, title: "No exam", fullTitle: "Not tied to an exam", subtitle: null, exams: [] };
}

// Where a task stands, for grouping and the view tabs: open (being worked),
// upcoming (not open yet), or finished. Being on hold is shown on top of it.
export const taskStage = (task) =>
  isOpenStatus(task.status) ? "open" : task.status === "inactive" ? "upcoming" : "finished";

// One line of a task's history, as a sentence.
export function describeHistoryEntry(entry) {
  const who = entry.changedBy || "The system";
  if (entry.kind === "created") return `${who} created this task`;
  if (entry.kind === "paused") return `${who} put it on hold`;
  if (entry.kind === "resumed") return `${who} resumed it`;
  if (entry.reassignedTo) return `${who} re-assigned it from ${entry.reassignedFrom} to ${entry.reassignedTo}`;
  if (!entry.changedBy && entry.toStatus === "active") return "It opened";
  if (!entry.changedBy && entry.toStatus === "inactive") return "It went back to not open yet";
  const to = TASK_STATUS_LABELS[entry.toStatus] ?? entry.toStatus;
  if (entry.fromStatus === entry.toStatus) return `${who} noted a change`;
  return `${who} marked it ${to}`;
}

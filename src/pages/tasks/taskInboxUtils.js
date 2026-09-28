import { useState, useEffect } from "react";
import { taskSubject, taskStage } from "../../utils/taskStatus";

// The non-visual half of the inbox-style task pages: screen width, filters,
// sorting, grouping and search. The components live in TaskInbox.jsx.

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Filters ──────────────────────────────────────────────────────────────
// A filter is { key, label, type: "multi" | "dateRange", options?, match }.
// match(task, value) says whether a task passes; an empty value always
// passes. Values live in one object keyed by filter key.

export const isFilterActive = (filter, value) =>
  filter.type === "dateRange" ? !!(value && value[0] && value[1]) : Array.isArray(value) && value.length > 0;

export function applyFilters(items, filters, values) {
  return items.filter((item) =>
    filters.every((f) => !isFilterActive(f, values[f.key]) || f.match(item, values[f.key]))
  );
}

// Whether a date falls on or between the two days of a date-range filter.
export const inRange = (value, range) => {
  if (!value) return false;
  const t = new Date(value).getTime();
  return t >= range[0].startOf("day").valueOf() && t <= range[1].endOf("day").valueOf();
};

// ── Sorting and grouping ──────────────────────────────────────────────────

export const SORT_OPTIONS = [
  { value: "due", label: "Due date" },
  { value: "opens", label: "Opening date" },
  { value: "exam", label: "Exam date" },
  { value: "updated", label: "Recently updated" },
];

const time = (v, missing) => (v ? new Date(v).getTime() : missing);
const examTime = (task) => {
  const dates = taskSubject(task).exams.map((e) => e.eventDate).filter(Boolean);
  return dates.length ? Math.min(...dates.map((d) => new Date(d).getTime())) : Infinity;
};

export function sortTasks(tasks, sortBy) {
  const by = {
    due: (a, b) => time(a.dueAt, Infinity) - time(b.dueAt, Infinity),
    opens: (a, b) => time(a.openAt, Infinity) - time(b.openAt, Infinity),
    exam: (a, b) => examTime(a) - examTime(b),
    updated: (a, b) => time(b.updatedAt, 0) - time(a.updatedAt, 0),
  }[sortBy];
  return [...tasks].sort((a, b) => by(a, b) || a.id - b.id);
}

const STAGE_GROUPS = [
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Not open yet" },
  { key: "finished", label: "Finished" },
];

export function groupByStage(tasks) {
  return STAGE_GROUPS.map((g) => ({ ...g, items: tasks.filter((t) => taskStage(t) === g.key) })).filter(
    (g) => g.items.length > 0
  );
}

// Text a search should match on for a task: its name, exam or series, who
// holds it, and its workflow.
export const taskSearchText = (task) => {
  const s = taskSubject(task);
  return [
    task.name,
    s.title,
    s.fullTitle,
    task.assigneeDesignation?.name,
    ...(task.assigneeHolders ?? []),
    task.taskTemplate?.workflow?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

// Which row the preview shows. A wide screen always has one showing, as a
// mail client does — the chosen row if it's still in view, else the first.
// A phone shows none until one is tapped.
export const effectiveSelection = (selectedId, visibleIds, isMobile) =>
  visibleIds.includes(selectedId) ? selectedId : isMobile ? null : visibleIds[0] ?? null;

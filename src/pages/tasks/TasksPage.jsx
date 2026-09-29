import { useState, useEffect, useMemo } from "react";
import { Alert, Spin } from "antd";
import DashboardLayout from "../../layouts/DashboardLayout";
import { getAllTasks } from "../../api/tasksApi";
import { TASK_STATUS_LABELS, taskStage } from "../../utils/taskStatus";
import { useAuth } from "../../context/useAuth";
import TaskPreview from "./TaskPreview";
import NewTaskModal from "./NewTaskModal";
import {
  InboxLayout, ViewTabs, SearchBox, FilterButton, FilterChips, TaskListItem, GroupHeader, ListEmpty, PreviewEmpty,
} from "./TaskInbox";
import {
  applyFilters, sortTasks, groupByStage, taskSearchText, effectiveSelection, inRange,
  SORT_OPTIONS, useIsMobile,
} from "./taskInboxUtils";

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Not open yet" },
  { key: "finished", label: "Finished" },
  { key: "all", label: "All" },
];

// Every task the workflows have made or an admin has added, including ones
// not open yet and ones on hold — the admin's inbox. The preview carries the
// admin's actions; New Task adds one by hand.
export default function TasksPage() {
  const { can } = useAuth();
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("open");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const [sortBy, setSortBy] = useState("due");
  const [selectedId, setSelectedId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  // Bumped on every open and used as the New Task modal's key, so each
  // opening starts from fresh state.
  const [newOpenCount, setNewOpenCount] = useState(0);
  const openNewTask = () => {
    setNewOpenCount((n) => n + 1);
    setNewOpen(true);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await getAllTasks();
        setTasks(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load tasks.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter choices come from the tasks themselves, so every option matches
  // something.
  const filters = useMemo(() => {
    const designations = new Map();
    const workflows = new Map();
    tasks.forEach((t) => {
      if (t.assigneeDesignation) designations.set(t.assigneeDesignation.id, t.assigneeDesignation.name);
      if (t.taskTemplate?.workflow) workflows.set(t.taskTemplate.workflow.id, t.taskTemplate.workflow.name);
    });
    const byName = (a, b) => a.label.localeCompare(b.label);
    return [
      {
        key: "status",
        label: "Status",
        type: "multi",
        options: [
          ...Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          { value: "on_hold", label: "On hold" },
        ],
        match: (t, v) => v.includes(t.status) || (v.includes("on_hold") && t.isPaused),
      },
      {
        key: "assignee",
        label: "Assigned to",
        type: "multi",
        options: [...designations].map(([value, label]) => ({ value, label })).sort(byName),
        match: (t, v) => v.includes(t.assigneeDesignation?.id),
      },
      {
        key: "workflow",
        label: "Workflow",
        type: "multi",
        options: [
          ...[...workflows].map(([value, label]) => ({ value, label })).sort(byName),
          { value: "oneoff", label: "One-off tasks" },
        ],
        match: (t, v) => (t.isOneOff ? v.includes("oneoff") : v.includes(t.taskTemplate?.workflow?.id)),
      },
      { key: "due", label: "Due between", type: "dateRange", match: (t, v) => inRange(t.dueAt, v) },
      { key: "opens", label: "Opens between", type: "dateRange", match: (t, v) => inRange(t.openAt, v) },
    ];
  }, [tasks]);

  // Search and filters first; the view tabs then split what's left, so their
  // counts always add up.
  const narrowed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const searched = term ? tasks.filter((t) => taskSearchText(t).includes(term)) : tasks;
    return applyFilters(searched, filters, filterValues);
  }, [tasks, search, filters, filterValues]);

  const counts = useMemo(() => {
    const c = { open: 0, upcoming: 0, finished: 0, all: narrowed.length };
    narrowed.forEach((t) => { c[taskStage(t)] += 1; });
    return c;
  }, [narrowed]);

  const visible = useMemo(
    () => sortTasks(view === "all" ? narrowed : narrowed.filter((t) => taskStage(t) === view), sortBy),
    [narrowed, view, sortBy]
  );
  const groups = useMemo(() => groupByStage(visible), [visible]);
  const shownId = effectiveSelection(selectedId, visible.map((t) => t.id), isMobile);

  const select = (id) => { setSelectedId(id); setShowPreview(true); };
  const replaceTask = (updated) => setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));

  const listHeader = (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search task, exam or person" />
        </div>
        <FilterButton
          filters={filters}
          values={filterValues}
          onChange={setFilterValues}
          sortOptions={SORT_OPTIONS}
          sortValue={sortBy}
          onSortChange={setSortBy}
        />
      </div>
      <FilterChips filters={filters} values={filterValues} onChange={setFilterValues} />
      <div style={{ marginTop: 10 }}>
        <ViewTabs tabs={VIEWS.map((v) => ({ ...v, count: counts[v.key] }))} active={view} onChange={setView} />
      </div>
    </>
  );

  const list = loading ? (
    <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spin /></div>
  ) : groups.length === 0 ? (
    <ListEmpty>{tasks.length === 0 ? "No tasks yet. They appear as exams are added to workflows." : "No tasks match."}</ListEmpty>
  ) : (
    groups.map((g) => (
      <div key={g.key}>
        {view === "all" && <GroupHeader>{g.label}</GroupHeader>}
        {g.items.map((t) => (
          <TaskListItem key={t.id} task={t} selected={t.id === shownId} onClick={() => select(t.id)} />
        ))}
      </div>
    ))
  );

  return (
    <DashboardLayout onAdd={can("task.create") ? openNewTask : undefined}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} style={{ marginBottom: 16 }} />}
      <InboxLayout
        listHeader={listHeader}
        list={list}
        showPreview={showPreview && !!shownId}
        onBack={() => setShowPreview(false)}
        preview={
          shownId ? (
            <TaskPreview key={shownId} taskId={shownId} mode="admin" onChanged={replaceTask} />
          ) : (
            <PreviewEmpty>Select a task to see it here.</PreviewEmpty>
          )
        }
      />
      <NewTaskModal
        key={newOpenCount}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(task) => {
          setTasks((prev) => [...prev.filter((t) => t.id !== task.id), task]);
          setNewOpen(false);
          setView("all");
          setSelectedId(task.id);
          setShowPreview(true);
        }}
      />
    </DashboardLayout>
  );
}

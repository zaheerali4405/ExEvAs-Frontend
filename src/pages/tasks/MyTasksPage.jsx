import { useState, useEffect, useMemo, useCallback } from "react";
import { Alert, Spin } from "antd";
import DashboardLayout from "../../layouts/DashboardLayout";
import { getMyTasks, getSentToMe } from "../../api/tasksApi";
import { taskStage } from "../../utils/taskStatus";
import TaskPreview from "./TaskPreview";
import TaskUpdateView from "../notifications/TaskUpdateView";
import {
  InboxLayout, ViewTabs, SearchBox, FilterButton, FilterChips, TaskListItem, GroupHeader, ListEmpty, PreviewEmpty,
} from "./TaskInbox";
import {
  applyFilters, sortTasks, taskSearchText, effectiveSelection, inRange, SORT_OPTIONS, useIsMobile,
} from "./taskInboxUtils";

// The signed-in user's own inbox: the tasks assigned to designations they
// hold, once open, with the status update right in the preview; and Sent to
// me — status updates that have reached them as someone's senior, each opening
// as the review with Okay, Forward and Re-assign.
export default function MyTasksPage() {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("open");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const [sortBy, setSortBy] = useState("due");
  const [selectedId, setSelectedId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadSent = useCallback(async () => {
    const { data } = await getSentToMe();
    setSent(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ data: mine }] = await Promise.all([getMyTasks(), loadSent()]);
        setTasks(mine);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load your tasks.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSent]);

  const isSent = view === "sent";

  const filters = useMemo(() => {
    const workflows = new Map();
    tasks.forEach((t) => { if (t.taskTemplate?.workflow) workflows.set(t.taskTemplate.workflow.id, t.taskTemplate.workflow.name); });
    return [
      {
        key: "workflow",
        label: "Workflow",
        type: "multi",
        options: [
          ...[...workflows].map(([value, label]) => ({ value, label })),
          { value: "oneoff", label: "One-off tasks" },
        ],
        match: (t, v) => (t.isOneOff ? v.includes("oneoff") : v.includes(t.taskTemplate?.workflow?.id)),
      },
      { key: "due", label: "Due between", type: "dateRange", match: (t, v) => inRange(t.dueAt, v) },
    ];
  }, [tasks]);

  const term = search.trim().toLowerCase();

  const narrowedTasks = useMemo(() => {
    const searched = term ? tasks.filter((t) => taskSearchText(t).includes(term)) : tasks;
    return applyFilters(searched, filters, filterValues);
  }, [tasks, term, filters, filterValues]);

  const narrowedSent = useMemo(
    () =>
      term
        ? sent.filter((d) =>
            [taskSearchText(d.task), d.statusUpdate.changedBy, d.sentBy].filter(Boolean).join(" ").toLowerCase().includes(term)
          )
        : sent,
    [sent, term]
  );

  const tabs = [
    { key: "open", label: "Open", count: narrowedTasks.filter((t) => taskStage(t) === "open").length },
    { key: "finished", label: "Finished", count: narrowedTasks.filter((t) => taskStage(t) === "finished").length },
    { key: "sent", label: "Sent to me", count: narrowedSent.filter((d) => !d.action).length },
  ];

  const visibleTasks = useMemo(
    () => sortTasks(narrowedTasks.filter((t) => taskStage(t) === view), sortBy),
    [narrowedTasks, view, sortBy]
  );
  const sentGroups = useMemo(
    () =>
      [
        { key: "waiting", label: "Waiting for you", items: narrowedSent.filter((d) => !d.action) },
        { key: "done", label: "Dealt with", items: narrowedSent.filter((d) => d.action) },
      ].filter((g) => g.items.length > 0),
    [narrowedSent]
  );
  // Sent to me lists waiting updates first, so its order is its groups'.
  const visibleIds = isSent ? sentGroups.flatMap((g) => g.items.map((d) => d.id)) : visibleTasks.map((t) => t.id);
  const shownId = effectiveSelection(selectedId, visibleIds, isMobile);

  const changeView = (next) => { setView(next); setSelectedId(null); setShowPreview(false); };
  const select = (id) => { setSelectedId(id); setShowPreview(true); };
  const replaceTask = (updated) => setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));

  const listHeader = (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SearchBox value={search} onChange={setSearch} placeholder={isSent ? "Search updates" : "Search task or exam"} />
        </div>
        {!isSent && (
          <FilterButton
            filters={filters}
            values={filterValues}
            onChange={setFilterValues}
            sortOptions={SORT_OPTIONS}
            sortValue={sortBy}
            onSortChange={setSortBy}
          />
        )}
      </div>
      {!isSent && <FilterChips filters={filters} values={filterValues} onChange={setFilterValues} />}
      <div style={{ marginTop: 10 }}>
        <ViewTabs tabs={tabs} active={view} onChange={changeView} />
      </div>
    </>
  );

  let list;
  if (loading) {
    list = <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spin /></div>;
  } else if (isSent) {
    list = sentGroups.length === 0 ? (
      <ListEmpty>Nothing has been sent to you. Status updates from the people who report to you land here.</ListEmpty>
    ) : (
      sentGroups.map((g) => (
        <div key={g.key}>
          <GroupHeader>{g.label}</GroupHeader>
          {/* A status update's row is its task's: whether it's still waiting
              shows in the group it sits under, the rest in the preview. */}
          {g.items.map((d) => (
            <TaskListItem key={d.id} task={d.task} selected={d.id === shownId} onClick={() => select(d.id)} />
          ))}
        </div>
      ))
    );
  } else {
    list = visibleTasks.length === 0 ? (
      <ListEmpty>{view === "open" ? "No open tasks. New ones appear here when they open." : "Nothing finished yet."}</ListEmpty>
    ) : (
      visibleTasks.map((t) => (
        <TaskListItem key={t.id} task={t} selected={t.id === shownId} onClick={() => select(t.id)} />
      ))
    );
  }

  let preview;
  if (!shownId) {
    preview = <PreviewEmpty>{isSent ? "Select an update to review it." : "Select a task to see it here."}</PreviewEmpty>;
  } else if (isSent) {
    preview = <TaskUpdateView key={shownId} deliveryId={shownId} onActed={() => loadSent().catch(() => {})} />;
  } else {
    preview = <TaskPreview key={shownId} taskId={shownId} mode="mine" onChanged={replaceTask} />;
  }

  return (
    <DashboardLayout>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} style={{ marginBottom: 16 }} />}
      <InboxLayout
        listHeader={listHeader}
        list={list}
        preview={preview}
        showPreview={showPreview && !!shownId}
        onBack={() => setShowPreview(false)}
      />
    </DashboardLayout>
  );
}

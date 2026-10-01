import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip, Pagination, Modal, Form, InputNumber,
  Typography, Row, Col, Descriptions, Checkbox, Divider, message,
} from "antd";
import { EditOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getTaskTemplates, createTaskTemplate, updateTaskTemplate, setTaskTemplateStatus,
} from "../../api/taskTemplatesApi";
import { getActivities } from "../../api/activitiesApi";
import { getWorkflows } from "../../api/workflowsApi";
import { getDesignations } from "../../api/designationsApi";
import { getPrograms } from "../../api/programsApi";
import { getTaskNotifications } from "../../api/taskNotificationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import {
  OFFSET_BASIS_OPTIONS, DUE_OFFSET_BASIS_OPTIONS, EVENT_TIME_REFERENCE_OPTIONS,
  OFFSET_DIRECTION_OPTIONS, OFFSET_UNIT_OPTIONS, TASK_SCOPE_OPTIONS, SERIES_ANCHOR_OPTIONS,
  describeOffset, describeGracePeriod,
} from "../../utils/offsets";
import { useAuth } from "../../context/useAuth";
import { loadOptions } from "../../utils/loadOptions";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",     label: "Task" },
  { value: "activity", label: "Activity" },
  { value: "workflow", label: "Workflow" },
  { value: "programs", label: "Programs" },
  { value: "assignee", label: "Assigned To" },
  { value: "status",   label: "Status" },
];

// A program's short label, as the list and filters show it.
const programLabel = (p) => p.shortName || p.code || p.fullName;

// Which programs' exams a template makes tasks for, in words.
const programsText = (t) => {
  const names = (t.programs || []).map((p) => programLabel(p.program));
  return names.length ? names.join(", ") : "None";
};

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "activity") return item.activity?.name ?? "";
  if (key === "workflow") return item.activity?.workflow?.name ?? "";
  if (key === "programs") return programsText(item);
  if (key === "assignee") return item.assigneeDesignation?.name ?? "";
  return item[key] ?? "";
};

// The Program filter's extra choice: templates whose programs are not set yet
// and so make no tasks.
const NO_PROGRAMS = "none";

const opensText = (t) =>
  describeOffset(t.openOffsetBasis, t.openEventTimeReference, t.openOffsetDirection, t.openOffsetValue, t.openOffsetUnit, t.seriesAnchor);
const dueText = (t) =>
  describeOffset(t.dueOffsetBasis, t.dueEventTimeReference, t.dueOffsetDirection, t.dueOffsetValue, t.dueOffsetUnit, t.seriesAnchor);

// A new template starts as "opens 1 day before the event date, due on the
// event date" — a plausible shape to edit from, and one the backend accepts
// as is.
const NEW_TEMPLATE_DEFAULTS = {
  scope: "per_exam",
  openOffsetBasis: "event_time",
  openEventTimeReference: "event_date",
  openOffsetValue: 1,
  openOffsetUnit: "days",
  openOffsetDirection: "before",
  dueOffsetBasis: "event_time",
  dueEventTimeReference: "event_date",
  dueOffsetValue: 0,
  dueOffsetUnit: "days",
  dueOffsetDirection: "after",
};

// A small heading that groups the three offset blocks in the form.
function SectionLabel({ children }) {
  return (
    <Text strong style={{ display: "block", margin: "4px 0 8px" }}>
      {children}
    </Text>
  );
}

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// Every task template — the steps of a workflow, each in one of its
// activities, that become tasks for the exams the workflow applies to.
// Filtered by workflow, activity and program at the top; the filters live in
// the address (?workflowId=&activityId=&programId=), so the Activities page
// can open this list already narrowed to one activity.
export default function TaskTemplatesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const canEdit = can("task-template.update");
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowFilter = Number(searchParams.get("workflowId")) || null;
  const activityFilter = Number(searchParams.get("activityId")) || null;
  const programParam = searchParams.get("programId");
  const programFilter = programParam === NO_PROGRAMS ? NO_PROGRAMS : Number(programParam) || null;

  const [templates, setTemplates] = useState([]);
  const [activities, setActivities] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [taskNotifications, setTaskNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // The filters live in the URL, so they can change without passing through
  // a handler here (Back, or a link from another page). Back to the first
  // page whenever they do, adjusted during render rather than in an effect.
  const filterKey = `${workflowFilter}|${activityFilter}|${programFilter}`;
  const [pagedFilterKey, setPagedFilterKey] = useState(filterKey);
  if (pagedFilterKey !== filterKey) {
    setPagedFilterKey(filterKey);
    setCurrentPage(1);
  }
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form] = Form.useForm();
  const openOffsetBasis = Form.useWatch("openOffsetBasis", form);
  const dueOffsetBasis = Form.useWatch("dueOffsetBasis", form);
  const scope = Form.useWatch("scope", form);
  const formWorkflowId = Form.useWatch("workflowId", form);
  const formProgramIds = Form.useWatch("programIds", form);
  const isSeries = scope === "per_series";

  useEffect(() => {
    let ignore = false;
    const isStale = () => ignore;
    getTaskTemplates()
      .then(({ data }) => { if (!ignore) setTemplates(data); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Could not load task templates."); })
      .finally(() => { if (!ignore) setLoading(false); });
    // Without activities or workflows the filter dropdowns fall back to the templates' own.
    loadOptions(can("activity.read-all"), getActivities, setActivities, isStale);
    loadOptions(can("workflow.read-all"), getWorkflows, setWorkflows, isStale);
    loadOptions(can("designation.read-all"), getDesignations, setDesignations, isStale);
    // Without programs the pickers fall back to the templates' own.
    loadOptions(can("program.read-all"), getPrograms, setPrograms, isStale);
    // Without them, the picker offers only what templates have already picked.
    loadOptions(can("task-notification.read-all"), getTaskNotifications, setTaskNotifications, isStale);
    return () => { ignore = true; };
  }, [can]);

  // ── Filters ──

  // Changing the workflow clears an activity that isn't one of its own. The
  // program filter is independent of both and is kept.
  const setFilters = (workflowId, activityId) => {
    const next = {};
    if (workflowId) next.workflowId = String(workflowId);
    if (activityId) next.activityId = String(activityId);
    if (programFilter) next.programId = String(programFilter);
    setSearchParams(next, { replace: true });
  };

  const setProgramFilter = (programId) => {
    const next = {};
    if (workflowFilter) next.workflowId = String(workflowFilter);
    if (activityFilter) next.activityId = String(activityFilter);
    if (programId) next.programId = String(programId);
    setSearchParams(next, { replace: true });
  };

  // Every program there is to pick from: the full list where it can be read,
  // plus any a template already names.
  const programChoices = useMemo(() => {
    const byId = new Map();
    programs.forEach((p) => byId.set(p.id, p));
    templates.forEach((t) => (t.programs || []).forEach(({ program }) => {
      if (!byId.has(program.id)) byId.set(program.id, program);
    }));
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [programs, templates]);

  const programFilterOptions = useMemo(
    () => [
      ...programChoices.map((p) => ({ value: p.id, label: programLabel(p) })),
      { value: NO_PROGRAMS, label: "No programs set" },
    ],
    [programChoices]
  );

  // New choices are active programs only; one a template already has stays
  // listed, marked, so an edit doesn't silently drop it.
  const formProgramOptions = useMemo(() => {
    const kept = new Set((editingTemplate?.programs || []).map(({ program }) => program.id));
    return programChoices
      .filter((p) => p.isActive !== false || kept.has(p.id))
      .map((p) => ({ value: p.id, label: p.isActive === false ? `${p.fullName} (inactive)` : p.fullName }));
  }, [programChoices, editingTemplate]);

  // Every activity there is to pick from: the full list where it can be read,
  // plus any a template sits in, each knowing its workflow.
  const allActivities = useMemo(() => {
    const byId = new Map();
    activities.forEach((a) =>
      byId.set(a.id, { id: a.id, name: a.name, isActive: a.isActive, displayOrder: a.displayOrder, workflowId: a.workflowId, workflowName: a.workflow?.name ?? "" })
    );
    templates.forEach((t) => {
      if (t.activity && !byId.has(t.activity.id)) {
        byId.set(t.activity.id, {
          id: t.activity.id,
          name: t.activity.name,
          isActive: t.activity.isActive,
          displayOrder: t.activity.displayOrder,
          workflowId: t.activity.workflowId,
          workflowName: t.activity.workflow?.name ?? "",
        });
      }
    });
    return [...byId.values()].sort(
      (a, b) => a.workflowName.localeCompare(b.workflowName) || a.displayOrder - b.displayOrder || a.id - b.id
    );
  }, [activities, templates]);

  const workflowFilterOptions = useMemo(() => {
    const byId = new Map();
    workflows.forEach((w) => byId.set(w.id, w.name));
    allActivities.forEach((a) => byId.set(a.workflowId, a.workflowName));
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [workflows, allActivities]);

  const activityFilterOptions = useMemo(
    () =>
      allActivities
        .filter((a) => !workflowFilter || a.workflowId === workflowFilter)
        .map((a) => ({ value: a.id, label: workflowFilter ? a.name : `${a.name} · ${a.workflowName}` })),
    [allActivities, workflowFilter]
  );

  const filtered = useMemo(() => {
    let rows = templates;
    if (workflowFilter) rows = rows.filter((t) => t.activity?.workflowId === workflowFilter);
    if (activityFilter) rows = rows.filter((t) => t.activityId === activityFilter);
    if (programFilter === NO_PROGRAMS) {
      rows = rows.filter((t) => (t.programs || []).length === 0);
    } else if (programFilter) {
      rows = rows.filter((t) => (t.programs || []).some(({ program }) => program.id === programFilter));
    }
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [templates, workflowFilter, activityFilter, programFilter, searchBy, searchTerm]);

  // ── The form's choices ──

  // The chosen workflow's activities. An existing template keeps its
  // workflow (the Workflow field is locked on edit) and can only move between
  // that workflow's activities.
  const formActivityOptions = useMemo(
    () =>
      allActivities
        .filter((a) => a.workflowId === formWorkflowId)
        .map((a) => ({ value: a.id, label: a.isActive ? a.name : `${a.name} (inactive)` })),
    [allActivities, formWorkflowId]
  );

  // "Select all" picks every program the Programs field offers.
  const formProgramValues = formProgramOptions.map((o) => o.value);

  // The shared task notifications to pick from: active ones, plus any this
  // template already picked (marked if since switched off), so an edit
  // doesn't silently drop it.
  const notificationOptions = useMemo(() => {
    const byId = new Map();
    taskNotifications.forEach((n) => byId.set(n.id, n));
    templates.forEach((t) => (t.notifications || []).forEach(({ taskNotification }) => {
      if (!byId.has(taskNotification.id)) byId.set(taskNotification.id, taskNotification);
    }));
    const kept = new Set((editingTemplate?.notifications || []).map(({ taskNotification }) => taskNotification.id));
    return [...byId.values()]
      .filter((n) => n.isActive || kept.has(n.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({ value: n.id, label: n.isActive ? n.name : `${n.name} (inactive)` }));
  }, [taskNotifications, templates, editingTemplate]);
  const chosenProgramCount = (formProgramIds || []).length;
  const allProgramsChosen = formProgramValues.length > 0 && formProgramValues.every((id) => (formProgramIds || []).includes(id));

  const designationOptions = useMemo(
    () =>
      designations
        .filter((d) => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    [designations]
  );

  // ── Actions ──

  const openAddModal = () => {
    if (allActivities.length === 0) {
      setError("Add an activity on the Activities page first — every task template belongs to one.");
      return;
    }
    setEditingTemplate(null);
    form.resetFields();
    // Starts from whatever the list is filtered to: the activity (and its
    // workflow), else the workflow, else the only one there is.
    const activityId = activityFilter ?? (allActivities.length === 1 ? allActivities[0].id : undefined);
    const workflowId =
      allActivities.find((a) => a.id === activityId)?.workflowId ??
      workflowFilter ??
      (workflowFilterOptions.length === 1 ? workflowFilterOptions[0].value : undefined);
    form.setFieldsValue({
      ...NEW_TEMPLATE_DEFAULTS,
      workflowId,
      activityId,
      programIds: typeof programFilter === "number" ? [programFilter] : [],
    });
    setModalOpen(true);
  };

  const openEditModal = (template) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      workflowId: template.activity?.workflowId,
      name: template.name,
      instructions: template.instructions,
      activityId: template.activityId,
      assigneeDesignationId: template.assigneeDesignationId,
      scope: template.scope,
      seriesAnchor: template.seriesAnchor ?? undefined,
      openOffsetBasis: template.openOffsetBasis,
      openEventTimeReference: template.openEventTimeReference ?? undefined,
      openOffsetValue: template.openOffsetValue,
      openOffsetUnit: template.openOffsetUnit,
      openOffsetDirection: template.openOffsetDirection,
      dueOffsetBasis: template.dueOffsetBasis,
      dueEventTimeReference: template.dueEventTimeReference ?? undefined,
      dueOffsetValue: template.dueOffsetValue,
      dueOffsetUnit: template.dueOffsetUnit,
      dueOffsetDirection: template.dueOffsetDirection,
      gracePeriodValue: template.gracePeriodValue ?? undefined,
      gracePeriodUnit: template.gracePeriodUnit ?? undefined,
      programIds: (template.programs || []).map(({ program }) => program.id),
      notificationIds: (template.notifications || []).map(({ taskNotification }) => taskNotification.id),
    });
    setModalOpen(true);
  };

  // Programs an edit drops, by name. Their unfinished tasks from this
  // template get cancelled on save.
  const droppedPrograms = (template, payload) =>
    (template.programs || [])
      .filter(({ program }) => !payload.programIds.includes(program.id))
      .map(({ program }) => program.fullName);

  const handleModalFinish = (values) => {
    // The workflow only narrows the activity choice; the template reaches it
    // through its activity, so it isn't sent. Empty optional fields are sent
    // as null rather than dropped, so an edit can clear a grace period or an
    // event timestamp instead of keeping the stored one.
    const payload = {
      name: values.name,
      instructions: values.instructions,
      activityId: values.activityId,
      assigneeDesignationId: values.assigneeDesignationId,
      programIds: values.programIds ?? [],
      notificationIds: values.notificationIds ?? [],
      scope: values.scope,
      seriesAnchor: values.scope === "per_series" ? values.seriesAnchor : null,
      openOffsetBasis: values.openOffsetBasis,
      openEventTimeReference: values.openOffsetBasis === "event_time" ? values.openEventTimeReference : null,
      openOffsetValue: values.openOffsetValue,
      openOffsetUnit: values.openOffsetUnit,
      openOffsetDirection: values.openOffsetDirection,
      dueOffsetBasis: values.dueOffsetBasis,
      dueEventTimeReference: values.dueOffsetBasis === "event_time" ? values.dueEventTimeReference : null,
      dueOffsetValue: values.dueOffsetValue,
      dueOffsetUnit: values.dueOffsetUnit,
      dueOffsetDirection: values.dueOffsetDirection,
      gracePeriodValue: values.gracePeriodValue ?? null,
      gracePeriodUnit: values.gracePeriodUnit ?? null,
    };
    const dropped = editingTemplate ? droppedPrograms(editingTemplate, payload) : [];
    if (dropped.length === 0) {
      saveTemplate(payload);
      return;
    }
    Modal.confirm({
      title: "Remove Programs",
      content: `Unfinished "${editingTemplate.name}" tasks for ${dropped.join(", ")} will be cancelled. Finished ones are kept. Continue?`,
      okText: "Save and Cancel Tasks",
      okButtonProps: { danger: true },
      cancelText: "Go Back",
      centered: true,
      onOk: () => saveTemplate(payload),
    });
  };

  const saveTemplate = async (payload) => {
    setModalLoading(true);
    try {
      if (editingTemplate) {
        const { data } = await updateTaskTemplate(editingTemplate.id, payload);
        const { cancelledTaskCount, ...saved } = data;
        setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
        if (cancelledTaskCount > 0) {
          message.info(`${cancelledTaskCount} unfinished task${cancelledTaskCount === 1 ? " was" : "s were"} cancelled.`);
        }
      } else {
        const { data } = await createTaskTemplate(payload);
        setTemplates((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      const detail = err.response?.data?.message;
      setError(Array.isArray(detail) ? detail.join(" ") : detail || "Could not save this task template.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggle = (template) => {
    const activate = !template.isActive;
    Modal.confirm({
      title: activate ? "Activate Task Template" : "Deactivate Task Template",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${template.name}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          const { data } = await setTaskTemplateStatus(template.id, activate);
          setTemplates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",       accessor: (_, i) => i + 1 },
        { label: "Task",        accessor: (r) => r.name },
        { label: "Activity",    accessor: (r) => r.activity?.name || "" },
        { label: "Workflow",    accessor: (r) => r.activity?.workflow?.name || "" },
        { label: "Programs",    accessor: (r) => programsText(r) },
        { label: "Opens",       accessor: (r) => opensText(r) },
        { label: "Due",         accessor: (r) => dueText(r) },
        { label: "Assigned To", accessor: (r) => r.assigneeDesignation?.name || "" },
        { label: "Status",      accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "task-templates"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 70, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    {
      title: "Task",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: "Activity",
      width: 180,
      sorter: (a, b) => (a.activity?.name ?? "").localeCompare(b.activity?.name ?? ""),
      render: (_, t) => (
        <>
          {t.activity?.name ?? "—"}
          {t.activity && !t.activity.isActive && <Tag style={{ marginLeft: 6 }}>Inactive</Tag>}
        </>
      ),
    },
    {
      title: "Workflow",
      width: 200,
      sorter: (a, b) => (a.activity?.workflow?.name ?? "").localeCompare(b.activity?.workflow?.name ?? ""),
      render: (_, t) => t.activity?.workflow?.name ?? "—",
    },
    { title: "Opens", width: 220, render: (_, t) => opensText(t) },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, t) =>
        can("task-template.activate") ? (
          <Tag color={isActive ? "success" : "default"} style={{ cursor: "pointer" }} onClick={() => handleToggle(t)}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>
        ),
    },
    {
      title: "Actions",
      width: canEdit ? 90 : 60,
      align: "center",
      render: (_, t) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(t)} />
          </Tooltip>
          {canEdit && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(t)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // One timing row of the form — the open time or the due time — in four
  // columns: what it's measured from, the event timestamp (only used when
  // that's the event), the offset as value, unit and direction side by side
  // (the same three parts, in the same order, as a notification template's),
  // and room for one more field.
  const timingRow = ({ prefix, basis, basisOptions, basisTooltip, onBasisChange, directionOptions, extra = null }) => (
    <Row gutter={16}>
      <Col xs={24} md={6}>
        <Form.Item
          name={`${prefix}OffsetBasis`}
          label="Measured From"
          tooltip={infoTip(basisTooltip)}
          rules={[{ required: true, message: "Please choose what it is measured from." }]}
        >
          <Select options={basisOptions} onChange={onBasisChange} />
        </Form.Item>
      </Col>
      <Col xs={24} md={6}>
        <Form.Item
          name={`${prefix}EventTimeReference`}
          label="Event Timestamp"
          rules={basis === "event_time" ? [{ required: true, message: "Please select which timestamp to offset from." }] : []}
        >
          <Select
            placeholder={basis === "event_time" ? "Select timestamp" : "Only for the event"}
            options={EVENT_TIME_REFERENCE_OPTIONS}
            disabled={basis !== "event_time"}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={6}>
        <Form.Item label="Offset" required>
          <Space.Compact block>
            <Form.Item name={`${prefix}OffsetValue`} noStyle rules={[{ required: true, message: "Enter the offset." }]}>
              <InputNumber min={0} placeholder="0" style={{ width: "28%" }} />
            </Form.Item>
            <Form.Item name={`${prefix}OffsetUnit`} noStyle rules={[{ required: true, message: "Choose the unit." }]}>
              <Select options={OFFSET_UNIT_OPTIONS} style={{ width: "36%" }} />
            </Form.Item>
            <Form.Item name={`${prefix}OffsetDirection`} noStyle rules={[{ required: true, message: "Choose before or after." }]}>
              <Select options={directionOptions} style={{ width: "36%" }} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
      </Col>
      <Col xs={24} md={6}>{extra}</Col>
    </Row>
  );

  return (
    <DashboardLayout onAdd={can("task-template.create") ? openAddModal : undefined}>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard>
        <div className="list-toolbar">
          <Select
            placeholder="All workflows"
            allowClear
            showSearch
            optionFilterProp="label"
            options={workflowFilterOptions}
            value={workflowFilter}
            onChange={(val) => {
              const keep = val && allActivities.some((a) => a.id === activityFilter && a.workflowId === val);
              setFilters(val ?? null, keep ? activityFilter : null);
            }}
            style={{ width: "100%" }}
          />
          <Select
            placeholder="All activities"
            allowClear
            showSearch
            optionFilterProp="label"
            options={activityFilterOptions}
            value={activityFilter}
            // Picking an activity also settles its workflow.
            onChange={(val) =>
              setFilters(val ? allActivities.find((a) => a.id === val)?.workflowId ?? workflowFilter : workflowFilter, val ?? null)
            }
            style={{ width: "100%" }}
          />
          <Select
            placeholder="All programs"
            allowClear
            showSearch
            optionFilterProp="label"
            options={programFilterOptions}
            value={programFilter}
            onChange={(val) => setProgramFilter(val ?? null)}
            style={{ width: "100%" }}
          />
          <Select
            placeholder="Search by"
            allowClear
            options={searchableColumns}
            value={searchBy}
            onChange={(val) => { setSearchBy(val ?? null); setCurrentPage(1); }}
            style={{ width: "100%" }}
          />
          <Input
            placeholder="Search..."
            allowClear
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            style={{ width: "auto" }}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ width: "100%" }}>
            Export Excel
          </Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns}
            loading={loading}
            size="small"
            pagination={false}
          />

          <div className="list-footer">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: "#595959" }}>Show</span>
                <Select
                  value={pageSize}
                  options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: `${n}` }))}
                  onChange={(val) => { setPageSize(val); setCurrentPage(1); }}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: "#595959" }}>Entries</span>
              </div>
              <span style={{ fontSize: 13, color: "#8c8c8c" }}>
                Showing {startEntry}–{endEntry} of {filtered.length} Entries
              </span>
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filtered.length}
              onChange={(page) => setCurrentPage(page)}
              simple={isMobile}
              showQuickJumper={!isMobile}
              showSizeChanger={false}
            />
          </div>
        </div>
      </PageCard>

      {/* Everything about one template, since the list carries only the
          columns worth scanning. */}
      <Modal
        title="Task Template Details"
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={[
          <Button key="close" onClick={() => setViewing(null)}>Close</Button>,
          ...(canEdit
            ? [
                <Button
                  key="edit"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => { const t = viewing; setViewing(null); openEditModal(t); }}
                >
                  Edit
                </Button>,
              ]
            : []),
        ]}
        width={680}
        destroyOnHidden
        centered
      >
        {viewing && (
          <Descriptions bordered size="small" column={1} labelStyle={{ width: 170, fontWeight: 600 }} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Workflow">{viewing.activity?.workflow?.name}</Descriptions.Item>
            <Descriptions.Item label="Activity">{viewing.activity?.name}</Descriptions.Item>
            <Descriptions.Item label="Programs">
              {(viewing.programs || []).length === 0 ? (
                <Text type="secondary">None — makes no tasks until its programs are set</Text>
              ) : (
                <Space size={[4, 4]} wrap>
                  {viewing.programs.map(({ program }) => (
                    <Tooltip key={program.id} title={program.fullName}>
                      <Tag style={{ marginInlineEnd: 0 }}>{programLabel(program)}</Tag>
                    </Tooltip>
                  ))}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Task">{viewing.name}</Descriptions.Item>
            <Descriptions.Item label="Instructions">{viewing.instructions || "—"}</Descriptions.Item>
            <Descriptions.Item label="Scope">
              {viewing.scope === "per_series"
                ? `Per Exam Series - Measured from ${
                    SERIES_ANCHOR_OPTIONS.find((o) => o.value === viewing.seriesAnchor)?.label ?? "—"
                  }`
                : "Per Exam"}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned To">{viewing.assigneeDesignation?.name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Opens">{opensText(viewing)}</Descriptions.Item>
            <Descriptions.Item label="Due">{dueText(viewing)}</Descriptions.Item>
            <Descriptions.Item label="Grace Period">
              {describeGracePeriod(viewing.gracePeriodValue, viewing.gracePeriodUnit)}
            </Descriptions.Item>
            <Descriptions.Item label="Notifications">
              {(viewing.notifications || []).length === 0 ? (
                <Text type="secondary">None</Text>
              ) : (
                <Space size={[4, 4]} wrap>
                  {viewing.notifications.map(({ taskNotification }) => (
                    <Tag key={taskNotification.id} style={{ marginInlineEnd: 0 }}>
                      {taskNotification.name}
                      {!taskNotification.isActive && <span style={{ opacity: 0.65 }}> (inactive)</span>}
                    </Tag>
                  ))}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={viewing.isActive ? "success" : "default"}>{viewing.isActive ? "Active" : "Inactive"}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={editingTemplate ? "Edit Task Template" : "Add Task Template"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingTemplate ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={980}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          {/* ── Where it belongs ── */}
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="workflowId"
                label="Workflow"
                tooltip={infoTip(
                  editingTemplate
                    ? "A template stays in its workflow. It can move to another activity of the same workflow."
                    : "The workflow it belongs to. Narrows the activities to choose from."
                )}
                rules={[{ required: true, message: "Please choose the workflow." }]}
              >
                <Select
                  placeholder="Select a workflow"
                  options={workflowFilterOptions}
                  showSearch
                  optionFilterProp="label"
                  disabled={!!editingTemplate}
                  onChange={(val) => {
                    // An activity of another workflow no longer fits.
                    const activityId = form.getFieldValue("activityId");
                    if (!allActivities.some((a) => a.id === activityId && a.workflowId === val)) {
                      form.setFieldValue("activityId", undefined);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="activityId"
                label="Activity"
                tooltip={infoTip("Deactivating an activity stops all its tasks from being made.")}
                rules={[{ required: true, message: "Please choose the activity." }]}
              >
                <Select
                  placeholder={formWorkflowId ? "Select an activity" : "Choose the workflow first"}
                  disabled={!formWorkflowId}
                  options={formActivityOptions}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="programIds"
                label="Programs"
                tooltip={infoTip(
                  "Only these programs' exams get this task. A task with a different timeline for another program is a separate template, which may share this name as long as the two cover different programs. With no programs it makes no tasks."
                )}
              >
                <Select
                  mode="multiple"
                  placeholder="None — makes no tasks yet"
                  options={formProgramOptions}
                  showSearch
                  optionFilterProp="label"
                  maxTagCount="responsive"
                  popupRender={(menu) => (
                    <>
                      {/* Kept from taking focus, so ticking it doesn't close the list. */}
                      <div style={{ padding: "4px 12px" }} onMouseDown={(e) => e.preventDefault()}>
                        <Checkbox
                          checked={allProgramsChosen}
                          indeterminate={chosenProgramCount > 0 && !allProgramsChosen}
                          disabled={formProgramValues.length === 0}
                          onChange={(e) => form.setFieldValue("programIds", e.target.checked ? formProgramValues : [])}
                        >
                          Select all
                        </Checkbox>
                      </div>
                      <Divider style={{ margin: "4px 0" }} />
                      {menu}
                    </>
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* ── What it is ── */}
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="assigneeDesignationId"
                label="Assigned To"
                tooltip={infoTip("Whoever holds this designation is assigned the task and can complete it.")}
                rules={[{ required: true, message: "Please choose the designation to assign it to." }]}
              >
                <Select
                  placeholder="Select a designation"
                  options={designationOptions}
                  showSearch
                  filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="name"
                label="Task"
                rules={[
                  { required: true, message: "Please name the task." },
                  { max: 200, message: "Maximum 200 characters." },
                ]}
              >
                <Input placeholder="e.g. Print and pack the question paper" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="instructions" label="Instructions">
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} placeholder="What the assignee is expected to do (optional)" />
              </Form.Item>
            </Col>
          </Row>

          {/* ── How many tasks it makes, and what they notify ── */}
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="scope"
                label="Scope"
                tooltip={infoTip(
                  "Per Exam makes one task for every exam. Per Exam Series makes one task for the whole batch — every exam of the same class sitting the same exam type — for work done once for all of them, such as collecting exam admission forms."
                )}
                rules={[{ required: true, message: "Please choose the scope." }]}
              >
                <Select
                  options={TASK_SCOPE_OPTIONS}
                  onChange={(val) => {
                    if (val === "per_series") {
                      if (!form.getFieldValue("seriesAnchor")) form.setFieldValue("seriesAnchor", "first_exam");
                    } else {
                      form.setFieldValue("seriesAnchor", undefined);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="seriesAnchor"
                label="Measure From"
                tooltip={infoTip("For a series task: which exam of the series the open and due times are counted from. It moves as exams are added, re-dated or cancelled.")}
                rules={isSeries ? [{ required: true, message: "Please choose which exam of the series to measure from." }] : []}
              >
                <Select
                  options={SERIES_ANCHOR_OPTIONS}
                  placeholder={isSeries ? "Select an exam" : "Only for a series task"}
                  disabled={!isSeries}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="notificationIds"
                label="Notifications"
                tooltip={infoTip("The task notifications its tasks send, set up on the Task Notifications page. Only tasks made after one is picked send it; un-picking one stops its copies not yet sent.")}
              >
                <Select
                  mode="multiple"
                  placeholder="None"
                  options={notificationOptions}
                  showSearch
                  optionFilterProp="label"
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* ── When it opens and falls due ── */}
          <SectionLabel>Open Time</SectionLabel>
          {timingRow({
            prefix: "open",
            basis: openOffsetBasis,
            basisOptions: OFFSET_BASIS_OPTIONS,
            basisTooltip: "The trigger is the exam being created, which is when its tasks are generated.",
            onBasisChange: (val) => { if (val !== "event_time") form.setFieldValue("openEventTimeReference", undefined); },
            directionOptions: OFFSET_DIRECTION_OPTIONS,
          })}

          <SectionLabel>Due Time</SectionLabel>
          {timingRow({
            prefix: "due",
            basis: dueOffsetBasis,
            basisOptions: DUE_OFFSET_BASIS_OPTIONS,
            basisTooltip: "Relative to the Open Time counts from when this task opens, for example due 2 days after it opens.",
            onBasisChange: (val) => {
              if (val !== "event_time") form.setFieldValue("dueEventTimeReference", undefined);
              // Counting from its own open time, a task can only fall due after it.
              if (val === "open_time") form.setFieldValue("dueOffsetDirection", "after");
            },
            directionOptions: OFFSET_DIRECTION_OPTIONS.map((o) => ({
              ...o,
              disabled: dueOffsetBasis === "open_time" && o.value === "before",
            })),
            extra: (
              <Form.Item
                label="Grace Period"
                tooltip={infoTip("How long past the due time the task may run before it counts as overdue. Leave both empty for none.")}
              >
                <Space.Compact block>
                  <Form.Item
                    name="gracePeriodValue"
                    noStyle
                    dependencies={["gracePeriodUnit"]}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const unit = getFieldValue("gracePeriodUnit");
                          if ((value == null) === (unit == null)) return Promise.resolve();
                          return Promise.reject(new Error("Enter both a value and a unit, or neither."));
                        },
                      }),
                    ]}
                  >
                    <InputNumber min={1} placeholder="None" style={{ width: "40%" }} />
                  </Form.Item>
                  <Form.Item name="gracePeriodUnit" noStyle dependencies={["gracePeriodValue"]}>
                    <Select options={OFFSET_UNIT_OPTIONS} placeholder="Unit" allowClear style={{ width: "60%" }} />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            ),
          })}
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

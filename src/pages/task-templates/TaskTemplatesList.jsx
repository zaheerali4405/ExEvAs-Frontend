import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip, Pagination, Modal, Form, InputNumber,
  Typography, Row, Col, Descriptions,
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
  { value: "assignee", label: "Assigned To" },
  { value: "status",   label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "activity") return item.activity?.name ?? "";
  if (key === "workflow") return item.activity?.workflow?.name ?? "";
  if (key === "assignee") return item.assigneeDesignation?.name ?? "";
  return item[key] ?? "";
};

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
// Filtered by workflow and activity at the top; both filters live in the
// address (?workflowId=&activityId=), so the Activities page can open this
// list already narrowed to one activity.
export default function TaskTemplatesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const canEdit = can("task-template.update");
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowFilter = Number(searchParams.get("workflowId")) || null;
  const activityFilter = Number(searchParams.get("activityId")) || null;

  const [templates, setTemplates] = useState([]);
  const [activities, setActivities] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // The filters live in the URL, so they can change without passing through
  // a handler here (Back, or a link from another page). Back to the first
  // page whenever they do, adjusted during render rather than in an effect.
  const filterKey = `${workflowFilter}|${activityFilter}`;
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
  const formActivityId = Form.useWatch("activityId", form);
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
    return () => { ignore = true; };
  }, [can]);

  // ── Filters ──

  // Changing the workflow clears an activity that isn't one of its own.
  const setFilters = (workflowId, activityId) => {
    const next = {};
    if (workflowId) next.workflowId = String(workflowId);
    if (activityId) next.activityId = String(activityId);
    setSearchParams(next, { replace: true });
  };

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
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [templates, workflowFilter, activityFilter, searchBy, searchTerm]);

  // ── The form's choices ──

  // A new template may go in any activity, grouped by workflow. An existing
  // one can only move within its own workflow, since its prerequisites
  // belong there.
  const formActivityOptions = useMemo(() => {
    const pool = editingTemplate
      ? allActivities.filter((a) => a.workflowId === editingTemplate.activity?.workflowId)
      : allActivities;
    const groups = new Map();
    pool.forEach((a) => {
      if (!groups.has(a.workflowId)) groups.set(a.workflowId, { label: a.workflowName, options: [] });
      groups.get(a.workflowId).options.push({ value: a.id, label: a.isActive ? a.name : `${a.name} (inactive)` });
    });
    return [...groups.values()];
  }, [allActivities, editingTemplate]);

  const designationOptions = useMemo(
    () =>
      designations
        .filter((d) => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    [designations]
  );

  // The workflow the template being edited or added sits in, by its activity.
  const formWorkflowId = allActivities.find((a) => a.id === formActivityId)?.workflowId ?? null;

  // Templates this one may wait for: others of the same workflow, in any of
  // its activities. It can't wait for itself, nor for anything that already
  // waits for it, directly or through others — either would leave both
  // waiting forever. A series task can only wait for other series tasks. The
  // backend refuses all of these too; this keeps them off the list.
  const waitForOptions = useMemo(() => {
    if (!formWorkflowId) return [];
    const sameWorkflow = templates.filter((t) => t.activity?.workflowId === formWorkflowId);
    const excluded = new Set();
    if (editingTemplate) {
      const waitedOnBy = new Map();
      sameWorkflow.forEach((t) =>
        (t.dependsOn || []).forEach((d) => {
          if (!waitedOnBy.has(d.dependsOnId)) waitedOnBy.set(d.dependsOnId, []);
          waitedOnBy.get(d.dependsOnId).push(t.id);
        })
      );
      const stack = [editingTemplate.id];
      while (stack.length) {
        const current = stack.pop();
        if (excluded.has(current)) continue;
        excluded.add(current);
        (waitedOnBy.get(current) || []).forEach((next) => stack.push(next));
      }
    }
    return sameWorkflow
      .filter((t) => !excluded.has(t.id) && (!isSeries || t.scope === "per_series"))
      // Names repeat across activities, so each option says which one it's in.
      .map((t) => ({ value: t.id, label: `${t.name} · ${t.activity?.name ?? ""}` }));
  }, [templates, editingTemplate, isSeries, formWorkflowId]);

  // ── Actions ──

  const openAddModal = () => {
    if (allActivities.length === 0) {
      setError("Add an activity on the Activities page first — every task template belongs to one.");
      return;
    }
    setEditingTemplate(null);
    form.resetFields();
    // The activity the list is filtered to, else the only one there is.
    const activityId = activityFilter ?? (allActivities.length === 1 ? allActivities[0].id : undefined);
    const siblings = templates.filter((t) => t.activityId === activityId);
    form.setFieldsValue({
      ...NEW_TEMPLATE_DEFAULTS,
      activityId,
      displayOrder: siblings.reduce((max, t) => Math.max(max, t.displayOrder), 0) + 1,
      dependsOnIds: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (template) => {
    setEditingTemplate(template);
    form.setFieldsValue({
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
      displayOrder: template.displayOrder,
      dependsOnIds: (template.dependsOn || []).map((d) => d.dependsOnId),
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    // Empty optional fields are sent as null rather than dropped, so an edit
    // can clear a grace period or an event timestamp instead of keeping the
    // stored one.
    const payload = {
      ...values,
      seriesAnchor: values.scope === "per_series" ? values.seriesAnchor : null,
      openEventTimeReference: values.openOffsetBasis === "event_time" ? values.openEventTimeReference : null,
      dueEventTimeReference: values.dueOffsetBasis === "event_time" ? values.dueEventTimeReference : null,
      gracePeriodValue: values.gracePeriodValue ?? null,
      gracePeriodUnit: values.gracePeriodUnit ?? null,
      dependsOnIds: values.dependsOnIds ?? [],
    };
    try {
      if (editingTemplate) {
        const { data } = await updateTaskTemplate(editingTemplate.id, payload);
        setTemplates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      } else {
        const { data } = await createTaskTemplate(payload);
        setTemplates((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" ") : message || "Could not save this task template.");
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
        { label: "Order",       accessor: (r) => r.displayOrder },
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
    { title: "Opens", width: 210, render: (_, t) => opensText(t) },
    {
      title: "Assigned To",
      width: 160,
      sorter: (a, b) => (a.assigneeDesignation?.name ?? "").localeCompare(b.assigneeDesignation?.name ?? ""),
      render: (_, t) => t.assigneeDesignation?.name ?? "—",
    },
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

  // The value / unit / direction row shared by the open and due blocks —
  // the same three fields, in the same order, as a notification template.
  const offsetRow = (prefix, directionOptions) => (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item name={`${prefix}OffsetValue`} label="Offset Value" rules={[{ required: true, message: "Required." }]}>
          <InputNumber min={0} style={{ width: "100%" }} placeholder="e.g. 16" />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name={`${prefix}OffsetUnit`} label="Offset Unit" rules={[{ required: true, message: "Required." }]}>
          <Select options={OFFSET_UNIT_OPTIONS} />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name={`${prefix}OffsetDirection`} label="Offset Direction" rules={[{ required: true, message: "Required." }]}>
          <Select options={directionOptions} />
        </Form.Item>
      </Col>
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
            <Descriptions.Item label="Order">{viewing.displayOrder}</Descriptions.Item>
            <Descriptions.Item label="Task">{viewing.name}</Descriptions.Item>
            <Descriptions.Item label="Instructions">{viewing.instructions || "—"}</Descriptions.Item>
            <Descriptions.Item label="Scope">
              {viewing.scope === "per_series" ? (
                <>
                  <Tag color="geekblue">Per Exam Series</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    One task for every exam of the same class sitting the same exam type
                  </Text>
                </>
              ) : (
                <>
                  <Tag>Per Exam</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>One task for each exam</Text>
                </>
              )}
            </Descriptions.Item>
            {viewing.scope === "per_series" && (
              <Descriptions.Item label="Measured From">
                {SERIES_ANCHOR_OPTIONS.find((o) => o.value === viewing.seriesAnchor)?.label ?? "—"}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Assigned To">{viewing.assigneeDesignation?.name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Opens">{opensText(viewing)}</Descriptions.Item>
            <Descriptions.Item label="Due">{dueText(viewing)}</Descriptions.Item>
            <Descriptions.Item label="Grace Period">
              {describeGracePeriod(viewing.gracePeriodValue, viewing.gracePeriodUnit)}
            </Descriptions.Item>
            <Descriptions.Item label="Waits For">
              {(viewing.dependsOn || []).length === 0 ? (
                <Text type="secondary">Nothing — opens on its own schedule</Text>
              ) : (
                <Space size={[4, 4]} wrap>
                  {viewing.dependsOn.map((d) => (
                    <Tag key={d.dependsOnId} style={{ marginInlineEnd: 0 }}>
                      {d.dependsOn?.name}
                      {d.dependsOn?.activity?.name && <span style={{ opacity: 0.65 }}> · {d.dependsOn.activity.name}</span>}
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
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col flex="auto">
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
            <Col flex="110px">
              <Form.Item
                name="displayOrder"
                label="Order"
                tooltip={infoTip("Position within its activity. It does not decide when the task opens — the timing and Waits For do.")}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="instructions" label="Instructions">
            <Input.TextArea rows={2} placeholder="What the assignee is expected to do (optional)" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="activityId"
                label="Activity"
                tooltip={infoTip(
                  editingTemplate
                    ? "The activity it belongs to. It can move to another activity of the same workflow."
                    : "The activity it belongs to, and through it, the workflow. Deactivating an activity stops all its tasks from being made."
                )}
                rules={[{ required: true, message: "Please choose the activity." }]}
              >
                <Select
                  placeholder="Select an activity"
                  options={formActivityOptions}
                  showSearch
                  optionFilterProp="label"
                  onChange={(val) => {
                    // Prerequisites must be in the same workflow; drop any
                    // left behind by a switch to another one.
                    const workflowId = allActivities.find((a) => a.id === val)?.workflowId;
                    const allowed = new Set(templates.filter((t) => t.activity?.workflowId === workflowId).map((t) => t.id));
                    form.setFieldValue(
                      "dependsOnIds",
                      (form.getFieldValue("dependsOnIds") ?? []).filter((depId) => allowed.has(depId))
                    );
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
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
          </Row>

          {/* ── Scope ── */}
          <Row gutter={16}>
            <Col span={12}>
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
                      // A series task can only wait for other series tasks.
                      const perSeriesIds = new Set(templates.filter((t) => t.scope === "per_series").map((t) => t.id));
                      form.setFieldValue(
                        "dependsOnIds",
                        (form.getFieldValue("dependsOnIds") ?? []).filter((depId) => perSeriesIds.has(depId))
                      );
                    } else {
                      form.setFieldValue("seriesAnchor", undefined);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            {isSeries && (
              <Col span={12}>
                <Form.Item
                  name="seriesAnchor"
                  label="Measure From"
                  tooltip={infoTip("Which exam of the series the open and due times below are counted from. It moves as exams are added, re-dated or cancelled.")}
                  rules={[{ required: true, message: "Please choose which exam of the series to measure from." }]}
                >
                  <Select options={SERIES_ANCHOR_OPTIONS} />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Open time ── */}
          <SectionLabel>Open Time</SectionLabel>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="openOffsetBasis"
                label="Offset Basis"
                tooltip={infoTip("The trigger is the exam being created, which is when its tasks are generated.")}
                rules={[{ required: true, message: "Please choose what the open time is measured from." }]}
              >
                <Select
                  options={OFFSET_BASIS_OPTIONS}
                  onChange={(val) => { if (val !== "event_time") form.setFieldValue("openEventTimeReference", undefined); }}
                />
              </Form.Item>
            </Col>
            {openOffsetBasis === "event_time" && (
              <Col span={12}>
                <Form.Item
                  name="openEventTimeReference"
                  label="Event Timestamp"
                  rules={[{ required: true, message: "Please select which timestamp to offset from." }]}
                >
                  <Select placeholder="Select timestamp" options={EVENT_TIME_REFERENCE_OPTIONS} />
                </Form.Item>
              </Col>
            )}
          </Row>
          {offsetRow("open", OFFSET_DIRECTION_OPTIONS)}

          {/* ── Due time ── */}
          <SectionLabel>Due Time</SectionLabel>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="dueOffsetBasis"
                label="Offset Basis"
                tooltip={infoTip("Relative to the Open Time counts from when this task opens, for example due 2 days after it opens.")}
                rules={[{ required: true, message: "Please choose what the due time is measured from." }]}
              >
                <Select
                  options={DUE_OFFSET_BASIS_OPTIONS}
                  onChange={(val) => {
                    if (val !== "event_time") form.setFieldValue("dueEventTimeReference", undefined);
                    // Counting from its own open time, a task can only fall due after it.
                    if (val === "open_time") form.setFieldValue("dueOffsetDirection", "after");
                  }}
                />
              </Form.Item>
            </Col>
            {dueOffsetBasis === "event_time" && (
              <Col span={12}>
                <Form.Item
                  name="dueEventTimeReference"
                  label="Event Timestamp"
                  rules={[{ required: true, message: "Please select which timestamp to offset from." }]}
                >
                  <Select placeholder="Select timestamp" options={EVENT_TIME_REFERENCE_OPTIONS} />
                </Form.Item>
              </Col>
            )}
          </Row>
          {offsetRow(
            "due",
            OFFSET_DIRECTION_OPTIONS.map((o) => ({ ...o, disabled: dueOffsetBasis === "open_time" && o.value === "before" }))
          )}

          {/* ── Grace period ── */}
          <SectionLabel>Grace Period</SectionLabel>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="gracePeriodValue"
                label="Value"
                tooltip={infoTip("How long past the due time the task may run before it counts as overdue. Leave both empty for none.")}
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
                <InputNumber min={1} style={{ width: "100%" }} placeholder="None" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="gracePeriodUnit" label="Unit" dependencies={["gracePeriodValue"]}>
                <Select options={OFFSET_UNIT_OPTIONS} placeholder="None" allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="dependsOnIds"
            label="Waits For"
            tooltip={infoTip("Other tasks in the same workflow — any of its activities — that must be done before this one opens, even if its open time has passed.")}
          >
            <Select
              mode="multiple"
              placeholder={formWorkflowId ? "Nothing — opens on its own schedule" : "Choose the activity first"}
              disabled={!formWorkflowId}
              options={waitForOptions}
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

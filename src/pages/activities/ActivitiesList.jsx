import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Tooltip, Space,
  Pagination, Modal, Form, InputNumber, Row, Col,
} from "antd";
import { EditOutlined, DownloadOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getActivities, createActivity, updateActivity, setActivityStatus } from "../../api/activitiesApi";
import { getWorkflows } from "../../api/workflowsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import { useAuth } from "../../context/useAuth";
import { loadOptions } from "../../utils/loadOptions";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",        label: "Activity" },
  { value: "description", label: "Description" },
  { value: "workflow",    label: "Workflow" },
  { value: "status",      label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  if (key === "workflow") return item.workflow?.name ?? "";
  return item[key] ?? "";
};

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// Activities are the named stages of a workflow — Paper Setting, Examination
// Admission, Printing — that its task templates are grouped into. Each one
// belongs to one workflow; templates are placed in an activity from the
// workflow's own page.
export default function ActivitiesList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activities, setActivities] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The workflow filter lives in the address (?workflowId=), so the
  // Workflows page can open this list already filtered to one workflow, and
  // Back returns to the same view.
  const workflowFilter = Number(searchParams.get("workflowId")) || null;
  const setWorkflowFilter = (id) =>
    setSearchParams(id ? { workflowId: String(id) } : {}, { replace: true });
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // The filter lives in the URL, so it can change without passing through a
  // handler here (Back, or a link from another page). Back to the first page
  // whenever it does, adjusted during render rather than in an effect.
  const [pagedWorkflowFilter, setPagedWorkflowFilter] = useState(workflowFilter);
  if (pagedWorkflowFilter !== workflowFilter) {
    setPagedWorkflowFilter(workflowFilter);
    setCurrentPage(1);
  }
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    let ignore = false;
    const isStale = () => ignore;
    getActivities()
      .then(({ data }) => { if (!ignore) setActivities(data); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Could not load activities."); })
      .finally(() => { if (!ignore) setLoading(false); });
    loadOptions(can("workflow.read-all"), getWorkflows, setWorkflows, isStale);
    return () => { ignore = true; };
  }, [can]);

  // A new activity goes on an active workflow; an existing one keeps showing
  // its own, even if that workflow has since been switched off.
  const workflowOptions = useMemo(
    () =>
      workflows
        .filter((w) => w.isActive || w.id === editingRecord?.workflowId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((w) => ({ value: w.id, label: w.name })),
    [workflows, editingRecord]
  );

  // Every workflow can be picked in the filter, including one with no
  // activities yet — which is how you arrive from the Workflows page to add
  // its first. Without permission to list workflows, the ones the activities
  // belong to are offered instead.
  const workflowFilterOptions = useMemo(() => {
    const seen = new Map();
    workflows.forEach((w) => seen.set(w.id, w.name));
    activities.forEach((a) => { if (a.workflow) seen.set(a.workflow.id, a.workflow.name); });
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [workflows, activities]);

  const filtered = useMemo(() => {
    const inWorkflow = workflowFilter ? activities.filter((a) => a.workflowId === workflowFilter) : activities;
    if (!searchTerm.trim()) return inWorkflow;
    const term = searchTerm.toLowerCase();
    return inWorkflow.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [activities, workflowFilter, searchBy, searchTerm]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Activity" : "Deactivate Activity",
      content: activate
        ? `Activate "${record.name}"? Its task templates will make tasks again for exams added or re-dated from now on.`
        : `Deactivate "${record.name}"? Its task templates stop making tasks for exams added or re-dated from now on. Tasks already made are not affected.`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          const { data } = await setActivityStatus(record.id, activate);
          setActivities((prev) => prev.map((a) => (a.id === data.id ? data : a)));
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    if (workflowFilter) form.setFieldValue("workflowId", workflowFilter);
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      workflowId: record.workflowId,
      name: record.name,
      description: record.description,
      displayOrder: record.displayOrder,
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = { ...values, description: values.description ?? "" };
      if (editingRecord) {
        const { data } = await updateActivity(editingRecord.id, payload);
        setActivities((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      } else {
        const { data } = await createActivity(payload);
        setActivities((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" ") : message || `Could not ${editingRecord ? "update" : "create"} activity.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",          accessor: (_, i) => i + 1 },
        { label: "Activity",       accessor: (r) => r.name },
        { label: "Description",    accessor: (r) => r.description || "" },
        { label: "Workflow",       accessor: (r) => r.workflow?.name || "" },
        { label: "Order",          accessor: (r) => r.displayOrder },
        { label: "Task Templates", accessor: (r) => r._count?.taskTemplates ?? 0 },
        { label: "Status",         accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "activities"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 70, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    {
      title: "Activity",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, r) => (
        <>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {r.description && <div style={{ fontSize: 12, color: "#8c8c8c" }}>{r.description}</div>}
        </>
      ),
    },
    {
      title: "Workflow",
      width: 240,
      sorter: (a, b) => (a.workflow?.name ?? "").localeCompare(b.workflow?.name ?? ""),
      render: (_, r) => (
        <>
          {r.workflow?.name ?? "—"}
          {r.workflow && !r.workflow.isActive && <Tag style={{ marginLeft: 6 }}>Inactive</Tag>}
        </>
      ),
    },
    {
      title: "Order",
      dataIndex: "displayOrder",
      width: 80,
      align: "center",
      sorter: (a, b) => a.displayOrder - b.displayOrder,
    },
    {
      title: "Task Templates",
      width: 130,
      align: "center",
      sorter: (a, b) => (a._count?.taskTemplates ?? 0) - (b._count?.taskTemplates ?? 0),
      render: (_, r) => r._count?.taskTemplates ?? 0,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("activity.activate") ? (
          <Tag color={isActive ? "success" : "default"} style={{ cursor: "pointer" }} onClick={() => handleToggle(record)}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>
        ),
    },
    ...(can("activity.update") || can("task-template.read-all")
      ? [{
          title: "Actions",
          width: 100,
          align: "center",
          render: (_, record) => (
            <Space>
              {can("activity.update") && (
                <Tooltip title="Edit">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                </Tooltip>
              )}
              {/* The Task Templates list, filtered to this activity. */}
              {can("task-template.read-all") && (
                <Tooltip title="Task Templates">
                  <Button
                    size="small"
                    icon={<UnorderedListOutlined />}
                    onClick={() => navigate(`/task-templates?workflowId=${record.workflowId}&activityId=${record.id}`)}
                  />
                </Tooltip>
              )}
            </Space>
          ),
        }]
      : []),
  ];

  return (
    <DashboardLayout onAdd={can("activity.create") ? openAddModal : undefined}>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard>
        <div className="list-toolbar">
          <Select
            placeholder="All workflows"
            allowClear
            options={workflowFilterOptions}
            value={workflowFilter}
            onChange={(val) => setWorkflowFilter(val ?? null)}
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

      <Modal
        title={editingRecord ? "Edit Activity" : "Add Activity"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item
            name="workflowId"
            label="Workflow"
            tooltip={infoTip(
              "The workflow this activity is a stage of. Moving it to another workflow takes its task templates with it — unless any of them wait for, or are waited for by, templates in other activities."
            )}
            rules={[{ required: true, message: "Please choose the workflow." }]}
          >
            <Select placeholder="Select a workflow" options={workflowOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Row gutter={16}>
            <Col flex="auto">
              <Form.Item
                name="name"
                label="Activity"
                rules={[
                  { required: true, message: "Please name the activity." },
                  { whitespace: true, message: "Please name the activity." },
                  { max: 150, message: "Maximum 150 characters." },
                ]}
              >
                <Input placeholder="e.g. Paper Setting" />
              </Form.Item>
            </Col>
            <Col flex="110px">
              <Form.Item
                name="displayOrder"
                label="Order"
                tooltip={infoTip("Where this activity sits among its workflow's activities. Leave it empty to put a new one last.")}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="What this stage covers (optional)" />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

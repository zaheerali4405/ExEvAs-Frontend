import { useState, useEffect, useMemo } from "react";
import {
  Table, Input, Select, Button, Tag, Alert, Space, Tooltip,
  Pagination, Modal, Form, Checkbox,
} from "antd";
import { EditOutlined, DownloadOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getWorkflows, createWorkflow, updateWorkflow, setWorkflowStatus } from "../../api/workflowsApi";
import { getExamTypes } from "../../api/examTypesApi";
import { getExamCategories } from "../../api/examCategoriesApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import { useAuth } from "../../context/useAuth";
import { loadOptions } from "../../utils/loadOptions";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const searchableColumns = [
  { value: "name",        label: "Name" },
  { value: "description", label: "Description" },
  { value: "status",      label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  return item[key] ?? "";
};

const shortLabel = (entity) => (entity ? entity.shortName || entity.fullName || entity.name : "");

// A long list of exam types would swamp the row, so only the first few are
// named and the rest are counted.
const MAX_TAGS = 3;
function TagList({ names }) {
  if (names.length === 0) return "—";
  const shown = names.slice(0, MAX_TAGS);
  const hidden = names.slice(MAX_TAGS);
  return (
    <Space size={[4, 4]} wrap>
      {shown.map((n) => <Tag key={n} style={{ marginInlineEnd: 0 }}>{n}</Tag>)}
      {hidden.length > 0 && (
        <Tooltip title={hidden.join(", ")}>
          <Tag style={{ marginInlineEnd: 0 }}>+{hidden.length}</Tag>
        </Tooltip>
      )}
    </Space>
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

// Workflows are the IEC's named processes. Each one applies to the exams
// whose exam type and exam category it lists, and is made of activities,
// which hold its task templates; a row's Activities button opens the
// Activities page filtered to it.
export default function WorkflowsList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [examCategories, setExamCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const selectedExamTypeIds = Form.useWatch("examTypeIds", form) || [];
  const selectedExamCategoryIds = Form.useWatch("examCategoryIds", form) || [];

  useEffect(() => {
    let ignore = false;
    const isStale = () => ignore;
    getWorkflows()
      .then(({ data }) => { if (!ignore) setWorkflows(data); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Could not load workflows."); })
      .finally(() => { if (!ignore) setLoading(false); });
    loadOptions(can("exam-type.read-all"), getExamTypes, setExamTypes, isStale);
    loadOptions(can("exam-category.read-all"), getExamCategories, setExamCategories, isStale);
    return () => { ignore = true; };
  }, [can]);

  const examTypeOptions = useMemo(
    () => examTypes.filter((e) => e.isActive).map((e) => ({ value: e.id, label: e.fullName })),
    [examTypes]
  );
  const examCategoryOptions = useMemo(
    () =>
      examCategories
        .filter((c) => c.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name })),
    [examCategories]
  );

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return workflows;
    const term = searchTerm.toLowerCase();
    return workflows.filter((item) => {
      if (!searchBy) {
        return searchableColumns.some((col) => String(getFieldValue(item, col.value)).toLowerCase().includes(term));
      }
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [workflows, searchBy, searchTerm]);

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate ? "Activate Workflow" : "Deactivate Workflow",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${record.name}"?`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate ? { background: "#1AB394", borderColor: "#1AB394" } : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setWorkflowStatus(record.id, activate);
          setWorkflows((prev) => prev.map((w) => (w.id === record.id ? { ...w, isActive: activate } : w)));
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      examTypeIds: (record.examTypes || []).map((l) => l.examTypeId),
      examCategoryIds: (record.examCategories || []).map((l) => l.examCategoryId),
    });
    setModalOpen(true);
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      if (editingRecord) {
        const { data } = await updateWorkflow(editingRecord.id, values);
        // The response is the detail shape; keep the list's own count.
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === data.id
              ? {
                  ...data,
                  _count: { taskTemplates: data.taskTemplates?.length ?? 0, activities: data.activities?.length ?? 0 },
                }
              : w
          )
        );
      } else {
        const { data } = await createWorkflow(values);
        setWorkflows((prev) => [...prev, { ...data, _count: { taskTemplates: 0, activities: 0 } }]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} workflow.`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.",           accessor: (_, i) => i + 1 },
        { label: "Name",            accessor: (r) => r.name },
        { label: "Description",     accessor: (r) => r.description || "" },
        { label: "Exam Types",      accessor: (r) => (r.examTypes || []).map((l) => shortLabel(l.examType)).join(", ") },
        { label: "Exam Categories", accessor: (r) => (r.examCategories || []).map((l) => shortLabel(l.examCategory)).join(", ") },
        { label: "Activities",      accessor: (r) => r._count?.activities ?? 0 },
        { label: "Status",          accessor: (r) => (r.isActive ? "Active" : "Inactive") },
      ],
      "workflows"
    );
  };

  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    { title: "S.No.", width: 70, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
    {
      title: "Name",
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
      title: "Exam Types",
      render: (_, r) => <TagList names={(r.examTypes || []).map((l) => shortLabel(l.examType))} />,
    },
    {
      title: "Exam Categories",
      render: (_, r) => <TagList names={(r.examCategories || []).map((l) => shortLabel(l.examCategory))} />,
    },
    {
      title: "Activities",
      width: 100,
      align: "center",
      sorter: (a, b) => (a._count?.activities ?? 0) - (b._count?.activities ?? 0),
      render: (_, r) => r._count?.activities ?? 0,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 110,
      sorter: (a, b) => Number(b.isActive) - Number(a.isActive),
      render: (isActive, record) =>
        can("workflow.activate") ? (
          <Tag color={isActive ? "success" : "default"} style={{ cursor: "pointer" }} onClick={() => handleToggle(record)}>
            {isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>
        ),
    },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          {can("workflow.update") && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
          {can("activity.read-all") && (
            <Tooltip title="Activities">
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => navigate(`/activities?workflowId=${record.id}`)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Selecting every option is how "all exam types" is expressed, so the
  // dropdown offers it in one click rather than sixteen.
  const selectAllPopup = (field, options) => (menu) => (
    <>
      <div style={{ padding: "4px 8px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => form.setFieldValue(field, options.map((o) => o.value))}
        >
          Select all
        </Button>
      </div>
      {menu}
    </>
  );

  const checkboxOption = (selected) => (option) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span>{option.label}</span>
      <Checkbox checked={selected.includes(option.value)} />
    </div>
  );

  return (
    <DashboardLayout onAdd={can("workflow.create") ? openAddModal : undefined}>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard>
        <div className="list-toolbar">
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
        title={editingRecord ? "Edit Workflow" : "Add Workflow"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleModalFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter the workflow's name." },
              { max: 150, message: "Maximum 150 characters." },
            ]}
          >
            <Input placeholder="e.g. Internal Exams" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="What this workflow covers (optional)" />
          </Form.Item>

          <Form.Item
            name="examTypeIds"
            label="Exam Types"
            tooltip={infoTip("An exam gets this workflow's tasks only when both its exam type and its exam category are listed here.")}
            rules={[{ required: true, type: "array", min: 1, message: "Select at least one exam type." }]}
          >
            <Select
              mode="multiple"
              placeholder="Select exam types"
              options={examTypeOptions}
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
              menuItemSelectedIcon={null}
              optionRender={checkboxOption(selectedExamTypeIds)}
              popupRender={selectAllPopup("examTypeIds", examTypeOptions)}
            />
          </Form.Item>

          <Form.Item
            name="examCategoryIds"
            label="Exam Categories"
            tooltip={infoTip("Lets a paper-printing workflow apply to theory exams without also firing for OSPE and OSCE.")}
            rules={[{ required: true, type: "array", min: 1, message: "Select at least one exam category." }]}
          >
            <Select
              mode="multiple"
              placeholder="Select exam categories"
              options={examCategoryOptions}
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
              menuItemSelectedIcon={null}
              optionRender={checkboxOption(selectedExamCategoryIds)}
              popupRender={selectAllPopup("examCategoryIds", examCategoryOptions)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

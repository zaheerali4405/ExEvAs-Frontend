import { useState, useEffect, useMemo } from "react";
import {
  Table,
  Input,
  Select,
  Button,
  Tag,
  Alert,
  Space,
  Tooltip,
  Pagination,
  Modal,
  Form,
  InputNumber,
  Row,
  Col,
  Descriptions,
} from "antd";
import { EditOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  setNotificationTemplateStatus,
} from "../../api/notificationTemplatesApi";
import { getExamTypes } from "../../api/examTypesApi";
import { getRoles } from "../../api/rolesApi";
import { getDesignations } from "../../api/designationsApi";
import { exportToExcel } from "../../utils/exportExcel";
import { infoTip } from "../../utils/formTooltip";
import { useAuth } from "../../context/useAuth";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PLACEHOLDER_HINT =
  "Placeholders available: {{eventName}}, {{examType}}, {{eventDate}}, {{startTime}}, {{endTime}}";

const TARGET_ENTITY_OPTIONS = [
  { value: "event", label: "Event" },
  { value: "moderation_meeting", label: "Moderation Meeting" },
];
const TARGET_ENTITY_LABELS = Object.fromEntries(
  TARGET_ENTITY_OPTIONS.map((o) => [o.value, o.label]),
);

const EVENT_TRIGGER_OPTIONS = [
  { value: "event_created", label: "Event Created" },
  { value: "event_date_changed", label: "Event Date Changed" },
  { value: "event_time_changed", label: "Event Time Changed" },
  { value: "staff_assigned", label: "Staff Assigned" },
];
const MODERATION_MEETING_TRIGGER_OPTIONS = [
  {
    value: "moderation_meeting_scheduled",
    label: "Moderation Meeting Scheduled",
  },
  {
    value: "moderation_meeting_date_changed",
    label: "Moderation Meeting Date Changed",
  },
  {
    value: "moderation_meeting_time_changed",
    label: "Moderation Meeting Time Changed",
  },
];
const TRIGGER_LABELS = Object.fromEntries(
  [...EVENT_TRIGGER_OPTIONS, ...MODERATION_MEETING_TRIGGER_OPTIONS].map((o) => [
    o.value,
    o.label,
  ]),
);

const AUDIENCE_MODE_OPTIONS = [
  { value: "role", label: "Role Based" },
  { value: "event", label: "Event Based" },
];
const AUDIENCE_MODE_LABELS = Object.fromEntries(
  AUDIENCE_MODE_OPTIONS.map((o) => [o.value, o.label]),
);

const AUDIENCE_CATEGORY_OPTIONS = [
  { value: "event_staff", label: "Event Staff" },
  { value: "candidates", label: "Candidates" },
  { value: "department_employees", label: "Department Employees" },
];
const AUDIENCE_CATEGORY_LABELS = Object.fromEntries(
  AUDIENCE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const DUTY_TYPE_OPTIONS = [
  { value: "superintendent", label: "Superintendent" },
  { value: "deputy_superintendent", label: "Deputy Superintendent" },
  { value: "invigilator", label: "Invigilator" },
  { value: "nomes_admin", label: "NOMES Admin" },
  { value: "facilitator", label: "Facilitator" },
  { value: "water_man", label: "Water Man" },
  { value: "janitorial", label: "Janitorial" },
];
const DUTY_TYPE_LABELS = Object.fromEntries(
  DUTY_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const OFFSET_BASIS_OPTIONS = [
  { value: "trigger_time", label: "Relative to the Trigger" },
  { value: "event_time", label: "Relative to the Event" },
];

const EVENT_TIME_REFERENCE_OPTIONS = [
  { value: "event_date", label: "Event Date" },
  { value: "start_time", label: "Start Time" },
  { value: "end_time", label: "End Time" },
];

const OFFSET_DIRECTION_OPTIONS = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];

const OFFSET_UNIT_OPTIONS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];
const OFFSET_UNIT_LABELS = Object.fromEntries(
  OFFSET_UNIT_OPTIONS.map((o) => [o.value, o.label]),
);

const searchableColumns = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
];

const getFieldValue = (item, key) => {
  if (key === "status") return item.isActive ? "Active" : "Inactive";
  return item[key] ?? "";
};

const offsetSummary = (t) => {
  const basis =
    t.offsetBasis === "trigger_time"
      ? "trigger"
      : (EVENT_TIME_REFERENCE_OPTIONS.find(
          (o) => o.value === t.eventTimeReference,
        )?.label ?? "event");
  return `${t.offsetValue} ${OFFSET_UNIT_LABELS[t.offsetUnit]} ${t.offsetDirection} ${basis}`;
};

const atLeastOneRule = (message) => ({
  validator(_, value) {
    if (!value || value.length === 0) return Promise.reject(new Error(message));
    return Promise.resolve();
  },
});

function useIsMobile(breakpoint = 576) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function NotificationTemplatesList() {
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBy, setSearchBy] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState(null);
  const [form] = Form.useForm();

  const targetEntity = Form.useWatch("targetEntity", form);
  const audienceMode = Form.useWatch("audienceMode", form);
  const audienceCategories = Form.useWatch("audienceCategories", form) ?? [];
  const offsetBasis = Form.useWatch("offsetBasis", form);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getNotificationTemplates();
        setTemplates(data);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Could not load notification templates.",
        );
      } finally {
        setLoading(false);
      }
    })();
    getExamTypes()
      .then(({ data }) => setExamTypes(data))
      .catch(() => {});
    getRoles()
      .then(({ data }) => setRoles(data))
      .catch(() => {});
    getDesignations()
      .then(({ data }) => setDesignations(data))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return templates;
    const term = searchTerm.toLowerCase();
    return templates.filter((item) => {
      if (!searchBy)
        return searchableColumns.some((col) =>
          String(getFieldValue(item, col.value)).toLowerCase().includes(term),
        );
      return String(getFieldValue(item, searchBy)).toLowerCase().includes(term);
    });
  }, [templates, searchBy, searchTerm]);

  const examTypeOptions = useMemo(
    () =>
      examTypes
        .filter((e) => e.isActive)
        .map((e) => ({ value: e.id, label: e.fullName })),
    [examTypes],
  );
  const roleOptions = useMemo(
    () =>
      roles
        .filter((r) => r.isActive)
        .map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );
  const designationOptions = useMemo(
    () =>
      designations
        .filter((d) => d.isActive)
        .map((d) => ({ value: d.id, label: d.name })),
    [designations],
  );

  const triggerOptions =
    targetEntity === "moderation_meeting"
      ? MODERATION_MEETING_TRIGGER_OPTIONS
      : EVENT_TRIGGER_OPTIONS;
  // Moderation Meeting has no per-meeting staff or candidate concept —
  // Department Employees is the only Event Based category that resolves to
  // anything for it.
  const categoryOptions =
    targetEntity === "moderation_meeting"
      ? AUDIENCE_CATEGORY_OPTIONS.filter(
          (o) => o.value === "department_employees",
        )
      : AUDIENCE_CATEGORY_OPTIONS;

  const handleToggle = (record) => {
    const activate = !record.isActive;
    Modal.confirm({
      title: activate
        ? "Activate Notification Template"
        : "Deactivate Notification Template",
      content: `Are you sure you want to ${activate ? "activate" : "deactivate"} "${record.name}"? ${activate ? "" : "It will stop generating new notifications until reactivated."}`,
      okText: activate ? "Activate" : "Deactivate",
      okButtonProps: {
        danger: !activate,
        style: activate
          ? { background: "#1AB394", borderColor: "#1AB394" }
          : {},
      },
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await setNotificationTemplateStatus(record.id, activate);
          setTemplates((prev) =>
            prev.map((t) =>
              t.id === record.id ? { ...t, isActive: activate } : t,
            ),
          );
        } catch (err) {
          setError(err.response?.data?.message || "Could not update status.");
        }
      },
    });
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      targetEntity: "event",
      audienceMode: "event",
      offsetDirection: "before",
      offsetUnit: "minutes",
    });
    setModalOpen(true);
  };

  const openDetails = (record) => {
    setDetailsRecord(record);
    setDetailsOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name: record.name,
      targetEntity: record.targetEntity,
      examTypeIds: record.examTypes.map((link) => link.examType.id),
      triggerEvents: record.triggerEvents,
      audienceMode: record.audienceMode,
      audienceRoleIds: record.roles.map((link) => link.role.id),
      audienceCategories: record.audienceCategories,
      audienceDutyTypes: record.audienceDutyTypes,
      audienceDesignationIds: record.designations.map(
        (link) => link.designation.id,
      ),
      subject: record.subject,
      message: record.message,
      offsetBasis: record.offsetBasis,
      eventTimeReference: record.eventTimeReference ?? undefined,
      offsetDirection: record.offsetDirection,
      offsetUnit: record.offsetUnit,
      offsetValue: record.offsetValue,
    });
    setModalOpen(true);
  };

  // Keep dependent fields consistent when their governing field changes.
  const handleTargetEntityChange = (value) => {
    if (value === "moderation_meeting") {
      form.setFieldsValue({
        audienceCategories: ["department_employees"],
        audienceDutyTypes: [],
        triggerEvents: [],
      });
    } else {
      form.setFieldsValue({ triggerEvents: [] });
    }
  };

  const handleAudienceModeChange = (value) => {
    if (value === "role") {
      form.setFieldsValue({
        audienceCategories: [],
        audienceDutyTypes: [],
        audienceDesignationIds: [],
      });
    } else {
      form.setFieldsValue({ audienceRoleIds: [] });
    }
  };

  const handleAudienceCategoriesChange = (value) => {
    if (!value.includes("event_staff"))
      form.setFieldsValue({ audienceDutyTypes: [] });
    if (!value.includes("department_employees"))
      form.setFieldsValue({ audienceDesignationIds: [] });
  };

  const handleOffsetBasisChange = (value) => {
    if (value !== "event_time")
      form.setFieldsValue({ eventTimeReference: undefined });
  };

  const handleModalFinish = async (values) => {
    setModalLoading(true);
    try {
      const payload = {
        ...values,
        audienceRoleIds:
          values.audienceMode === "role" ? values.audienceRoleIds : [],
        audienceCategories:
          values.audienceMode === "event" ? values.audienceCategories : [],
        audienceDutyTypes:
          values.audienceMode === "event"
            ? (values.audienceDutyTypes ?? [])
            : [],
        audienceDesignationIds:
          values.audienceMode === "event"
            ? (values.audienceDesignationIds ?? [])
            : [],
      };
      if (editingRecord) {
        const { data } = await updateNotificationTemplate(
          editingRecord.id,
          payload,
        );
        setTemplates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      } else {
        const { data } = await createNotificationTemplate(payload);
        setTemplates((prev) => [...prev, data]);
      }
      form.resetFields();
      setModalOpen(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Could not ${editingRecord ? "update" : "create"} notification template.`,
      );
    } finally {
      setModalLoading(false);
    }
  };

  const audienceSummary = (t) => {
    if (t.audienceMode === "role") {
      return t.roles.map((link) => link.role.name).join(", ") || "—";
    }
    const categories = t.audienceCategories
      .map((c) => AUDIENCE_CATEGORY_LABELS[c])
      .join(", ");
    const qualifiers = [];
    if (t.audienceCategories.includes("event_staff")) {
      qualifiers.push(
        t.audienceDutyTypes.length > 0
          ? t.audienceDutyTypes.map((d) => DUTY_TYPE_LABELS[d]).join(", ")
          : "All duties",
      );
    }
    if (
      t.audienceCategories.includes("department_employees") &&
      t.designations.length > 0
    ) {
      qualifiers.push(
        t.designations.map((link) => link.designation.name).join(", "),
      );
    }
    return qualifiers.length > 0
      ? `${categories} (${qualifiers.join("; ")})`
      : categories;
  };

  const examTypeSummary = (t) => {
    const allCount = examTypes.length;
    if (allCount > 0 && t.examTypes.length === allCount) return "All";
    return t.examTypes
      .map((link) => link.examType.shortName || link.examType.fullName)
      .join(", ");
  };

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { label: "S.No.", accessor: (_, i) => i + 1 },
        { label: "Name", accessor: (r) => r.name },
        {
          label: "Target Entity",
          accessor: (r) => TARGET_ENTITY_LABELS[r.targetEntity],
        },
        { label: "Exam Types", accessor: (r) => examTypeSummary(r) },
        {
          label: "Triggers",
          accessor: (r) =>
            r.triggerEvents.map((t) => TRIGGER_LABELS[t]).join(", "),
        },
        {
          label: "Audience Mode",
          accessor: (r) => AUDIENCE_MODE_LABELS[r.audienceMode],
        },
        { label: "Audience", accessor: (r) => audienceSummary(r) },
        { label: "Offset", accessor: (r) => offsetSummary(r) },
        {
          label: "Status",
          accessor: (r) => (r.isActive ? "Active" : "Inactive"),
        },
      ],
      "notification-templates",
    );
  };

  const startEntry =
    filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, filtered.length);

  const columns = [
    {
      title: "S.No.",
      width: 65,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Target",
      width: 130,
      render: (_, r) => TARGET_ENTITY_LABELS[r.targetEntity],
    },
    {
      title: "Offset",
      width: 170,
      render: (_, r) => offsetSummary(r),
    },
    {
      title: "Status",
      width: 110,
      render: (_, record) =>
        can("notification-template.activate") ? (
          <Tag
            color={record.isActive ? "success" : "default"}
            style={{ cursor: "pointer" }}
            onClick={() => handleToggle(record)}
          >
            {record.isActive ? "Active" : "Inactive"}
          </Tag>
        ) : (
          <Tag color={record.isActive ? "success" : "default"}>
            {record.isActive ? "Active" : "Inactive"}
          </Tag>
        ),
    },
    {
      title: "Actions",
      width: 90,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetails(record)}
            />
          </Tooltip>
          {can("notification-template.update") && (
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout
      onAdd={can("notification-template.create") ? openAddModal : undefined}
    >
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
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
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            style={{ width: "100%" }}
          >
            Export Excel
          </Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={filtered.slice(
              (currentPage - 1) * pageSize,
              currentPage * pageSize,
            )}
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
                  options={PAGE_SIZE_OPTIONS.map((n) => ({
                    value: n,
                    label: `${n}`,
                  }))}
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
        title={
          editingRecord
            ? "Edit Notification Template"
            : "Add Notification Template"
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={editingRecord ? "Save" : "Add"}
        confirmLoading={modalLoading}
        destroyOnHidden
        centered
        width={780}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleModalFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Name"
                rules={[
                  {
                    required: true,
                    message: "Please enter the template's name.",
                  },
                  { max: 200, message: "Maximum 200 characters." },
                ]}
              >
                <Input placeholder="e.g. Invigilator Hall Reminder" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="targetEntity"
                label="Target Entity"
                rules={[
                  { required: true, message: "Please select a target entity." },
                ]}
              >
                <Select
                  options={TARGET_ENTITY_OPTIONS}
                  onChange={handleTargetEntityChange}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="triggerEvents"
                label="Creation Trigger(s)"
                rules={[atLeastOneRule("Please select at least one trigger.")]}
              >
                <Select
                  mode="multiple"
                  placeholder="Select trigger(s)"
                  options={triggerOptions}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="examTypeIds"
                label="Exam Types"
                rules={[
                  atLeastOneRule("Please select at least one exam type."),
                ]}
              >
                <Select
                  mode="multiple"
                  placeholder="Select exam type(s) — select all for 'every exam type'"
                  options={examTypeOptions}
                  showSearch
                  optionFilterProp="label"
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="subject"
                label="Subject"
                rules={[
                  { required: true, message: "Please enter a subject." },
                  { max: 200, message: "Maximum 200 characters." },
                ]}
              >
                <Input placeholder="e.g. Hall Preparation" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="message"
                label="Message"
                tooltip={infoTip(PLACEHOLDER_HINT)}
                rules={[
                  {
                    required: true,
                    message: "Please enter the notification message.",
                  },
                ]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="e.g. Please prepare the seating plan for {{eventName}} on {{eventDate}}."
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="audienceMode"
                label="Audience Mode"
                rules={[
                  {
                    required: true,
                    message: "Please select an audience mode.",
                  },
                ]}
              >
                <Select
                  options={AUDIENCE_MODE_OPTIONS}
                  onChange={handleAudienceModeChange}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              {audienceMode === "role" ? (
                <Form.Item
                  name="audienceRoleIds"
                  label="Target Audience (Roles)"
                  rules={[atLeastOneRule("Please select at least one role.")]}
                >
                  <Select
                    mode="multiple"
                    placeholder="Select role(s)"
                    options={roleOptions}
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="audienceCategories"
                  label="Target Audience"
                  rules={[
                    atLeastOneRule(
                      "Please select at least one audience category.",
                    ),
                  ]}
                >
                  <Select
                    mode="multiple"
                    placeholder="Select audience categor(ies)"
                    options={categoryOptions}
                    onChange={handleAudienceCategoriesChange}
                    maxTagCount="responsive"
                  />
                </Form.Item>
              )}
            </Col>
          </Row>

          {audienceMode === "event" &&
            (audienceCategories.includes("event_staff") ||
              audienceCategories.includes("department_employees")) && (
              <Row gutter={16}>
                {audienceCategories.includes("event_staff") && (
                  <Col
                    span={
                      audienceCategories.includes("department_employees")
                        ? 12
                        : 24
                    }
                  >
                    <Form.Item
                      name="audienceDutyTypes"
                      label="Duty Types (leave empty for all duty types)"
                    >
                      <Select
                        mode="multiple"
                        placeholder="All duty types"
                        options={DUTY_TYPE_OPTIONS}
                        maxTagCount="responsive"
                      />
                    </Form.Item>
                  </Col>
                )}
                {audienceCategories.includes("department_employees") && (
                  <Col
                    span={audienceCategories.includes("event_staff") ? 12 : 24}
                  >
                    <Form.Item
                      name="audienceDesignationIds"
                      label="Designations"
                    >
                      <Select
                        mode="multiple"
                        placeholder="All designations"
                        options={designationOptions}
                        showSearch
                        optionFilterProp="label"
                        maxTagCount="responsive"
                      />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="offsetBasis"
                label="Send Time"
                rules={[
                  { required: true, message: "Please select when to send." },
                ]}
              >
                <Select
                  options={OFFSET_BASIS_OPTIONS}
                  onChange={handleOffsetBasisChange}
                />
              </Form.Item>
            </Col>
            {offsetBasis === "event_time" && (
              <Col span={12}>
                <Form.Item
                  name="eventTimeReference"
                  label="Event Timestamp"
                  rules={[
                    {
                      required: true,
                      message: "Please select which timestamp to offset from.",
                    },
                  ]}
                >
                  <Select
                    placeholder="Select timestamp"
                    options={EVENT_TIME_REFERENCE_OPTIONS}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="offsetValue"
                label="Offset Value"
                rules={[{ required: true, message: "Required." }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: "100%" }}
                  placeholder="e.g. 15"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="offsetUnit"
                label="Offset Unit"
                rules={[{ required: true, message: "Required." }]}
              >
                <Select options={OFFSET_UNIT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="offsetDirection"
                label="Offset Direction"
                rules={[{ required: true, message: "Required." }]}
              >
                <Select options={OFFSET_DIRECTION_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Notification Template Details"
        open={detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        footer={null}
        centered
        width={700}
      >
        {detailsRecord && (
          <Descriptions column={2} size="small" bordered style={{ marginTop: 16 }}>
            <Descriptions.Item label="Name" span={2}>
              {detailsRecord.name}
            </Descriptions.Item>
            <Descriptions.Item label="Target Entity">
              {TARGET_ENTITY_LABELS[detailsRecord.targetEntity]}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={detailsRecord.isActive ? "success" : "default"}>
                {detailsRecord.isActive ? "Active" : "Inactive"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Exam Types" span={2}>
              {examTypeSummary(detailsRecord)}
            </Descriptions.Item>
            <Descriptions.Item label="Trigger(s)" span={2}>
              {detailsRecord.triggerEvents
                .map((t) => TRIGGER_LABELS[t])
                .join(", ")}
            </Descriptions.Item>
            <Descriptions.Item label="Audience Mode">
              {AUDIENCE_MODE_LABELS[detailsRecord.audienceMode]}
            </Descriptions.Item>
            <Descriptions.Item label="Target Audience">
              {detailsRecord.audienceMode === "role"
                ? detailsRecord.roles.map((link) => link.role.name).join(", ") ||
                  "—"
                : detailsRecord.audienceCategories
                    .map((c) => AUDIENCE_CATEGORY_LABELS[c])
                    .join(", ") || "—"}
            </Descriptions.Item>
            {detailsRecord.audienceMode === "event" &&
              detailsRecord.audienceCategories.includes("event_staff") && (
                <Descriptions.Item label="Duty Types" span={2}>
                  {detailsRecord.audienceDutyTypes.length > 0
                    ? detailsRecord.audienceDutyTypes
                        .map((d) => DUTY_TYPE_LABELS[d])
                        .join(", ")
                    : "All duty types"}
                </Descriptions.Item>
              )}
            {detailsRecord.audienceMode === "event" &&
              detailsRecord.audienceCategories.includes(
                "department_employees",
              ) && (
                <Descriptions.Item label="Designations" span={2}>
                  {detailsRecord.designations.length > 0
                    ? detailsRecord.designations
                        .map((link) => link.designation.name)
                        .join(", ")
                    : "All designations"}
                </Descriptions.Item>
              )}
            <Descriptions.Item label="Subject" span={2}>
              {detailsRecord.subject}
            </Descriptions.Item>
            <Descriptions.Item label="Message" span={2}>
              {detailsRecord.message}
            </Descriptions.Item>
            <Descriptions.Item label="Send Time">
              {
                OFFSET_BASIS_OPTIONS.find(
                  (o) => o.value === detailsRecord.offsetBasis,
                )?.label
              }
            </Descriptions.Item>
            {detailsRecord.offsetBasis === "event_time" && (
              <Descriptions.Item label="Event Timestamp">
                {
                  EVENT_TIME_REFERENCE_OPTIONS.find(
                    (o) => o.value === detailsRecord.eventTimeReference,
                  )?.label
                }
              </Descriptions.Item>
            )}
            <Descriptions.Item
              label="Offset"
              span={detailsRecord.offsetBasis === "event_time" ? 2 : 1}
            >
              {offsetSummary(detailsRecord)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </DashboardLayout>
  );
}

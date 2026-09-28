import { useState, useEffect, useMemo } from "react";
import {
  Modal, Tabs, Form, Select, Input, DatePicker, InputNumber, Row, Col, Alert, Tag, Typography,
} from "antd";
import dayjs from "dayjs";
import {
  getTaskExamOptions, getTaskTemplateOptions, createTaskFromTemplate, createOneOffTask, getTaskDesignationOptions,
} from "../../api/tasksApi";
import { OFFSET_UNIT_OPTIONS } from "../../utils/offsets";
import { infoTip } from "../../utils/formTooltip";

const { Text } = Typography;

const examLabel = (e) => `${e.shortName}${e.eventDate ? ` — ${dayjs(e.eventDate).format("DD MMM YYYY")}` : ""}`;

// The admin's way to add a task by hand, two kinds:
//   From a template — one of a workflow's templates, made for a chosen exam
//     with the template's own timing. How an exam created before its workflow
//     gets its tasks.
//   One-off — typed in here with fixed dates, for work no template covers.
// onCreated is told the new task.
export default function NewTaskModal({ open, onClose, onCreated }) {
  const [kind, setKind] = useState("template");
  const [exams, setExams] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [templateForm] = Form.useForm();
  const [oneOffForm] = Form.useForm();
  const examId = Form.useWatch("eventId", templateForm);
  const templateId = Form.useWatch("taskTemplateId", templateForm);

  useEffect(() => {
    if (!open) return;
    setKind("template");
    setError("");
    setTemplates([]);
    templateForm.resetFields();
    oneOffForm.resetFields();
    (async () => {
      try {
        const [{ data: e }, { data: d }] = await Promise.all([getTaskExamOptions(), getTaskDesignationOptions()]);
        setExams(e);
        setDesignations(d);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load the exams and designations.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The templates that apply to the chosen exam.
  useEffect(() => {
    templateForm.setFieldValue("taskTemplateId", undefined);
    setTemplates([]);
    if (!examId) return;
    setTemplatesLoading(true);
    (async () => {
      try {
        const { data } = await getTaskTemplateOptions(examId);
        setTemplates(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load this exam's templates.");
      } finally {
        setTemplatesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const examOptions = useMemo(() => exams.map((e) => ({ value: e.id, label: examLabel(e) })), [exams]);
  const designationOptions = useMemo(() => designations.map((d) => ({ value: d.id, label: d.name })), [designations]);
  const templateOptions = useMemo(
    () =>
      templates.map((t) => ({
        value: t.id,
        disabled: t.hasTask || !!t.unavailable,
        label: t.name,
        render: (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>
              {t.name}
              <Text type="secondary" style={{ fontSize: 12 }}> · {t.activity} · {t.assignee}</Text>
            </span>
            <span>
              {t.scope === "per_series" && <Tag color="geekblue" style={{ marginInlineEnd: 4 }}>Series</Tag>}
              {t.hasTask && <Tag style={{ marginInlineEnd: 0 }}>Already made</Tag>}
              {t.unavailable && <Tag style={{ marginInlineEnd: 0 }}>No series</Tag>}
            </span>
          </div>
        ),
      })),
    [templates]
  );

  const submit = async () => {
    setError("");
    try {
      if (kind === "template") {
        const values = await templateForm.validateFields();
        setSaving(true);
        const { data } = await createTaskFromTemplate(values.eventId, values.taskTemplateId);
        onCreated?.(data);
      } else {
        const values = await oneOffForm.validateFields();
        setSaving(true);
        const { data } = await createOneOffTask({
          title: values.title,
          instructions: values.instructions || undefined,
          assigneeDesignationId: values.assigneeDesignationId,
          eventId: values.eventId || undefined,
          openAt: values.openAt.toISOString(),
          dueAt: values.dueAt.toISOString(),
          gracePeriodValue: values.gracePeriodValue ?? null,
          gracePeriodUnit: values.gracePeriodUnit ?? null,
        });
        onCreated?.(data);
      }
    } catch (err) {
      if (err?.errorFields) return; // the form shows its own messages
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" ") : message || "Could not create the task.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <Modal
      title="New Task"
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText="Create"
      confirmLoading={saving}
      destroyOnHidden
      centered
      width={640}
    >
      {error && <Alert type="error" showIcon message={error} style={{ margin: "12px 0" }} closable onClose={() => setError("")} />}
      <Tabs
        activeKey={kind}
        onChange={setKind}
        items={[
          {
            key: "template",
            label: "From a template",
            children: (
              <Form form={templateForm} layout="vertical" requiredMark={false}>
                <Form.Item
                  name="eventId"
                  label="Exam"
                  tooltip={infoTip("Any exam that isn't cancelled — including exams created before their workflow existed.")}
                  rules={[{ required: true, message: "Choose the exam." }]}
                >
                  <Select showSearch optionFilterProp="label" placeholder="Search exams" options={examOptions} />
                </Form.Item>
                <Form.Item
                  name="taskTemplateId"
                  label="Template"
                  tooltip={infoTip("Templates of the workflows that apply to this exam. The task gets the template's assignee and timing, as if the exam had just been saved. A series template makes the task for the exam's whole series.")}
                  rules={[{ required: true, message: "Choose the template." }]}
                >
                  <Select
                    placeholder={examId ? "Choose a template" : "Choose the exam first"}
                    disabled={!examId}
                    loading={templatesLoading}
                    options={templateOptions}
                    optionRender={(option) => option.data.render}
                    notFoundContent={examId && !templatesLoading ? "No workflow applies to this exam" : null}
                  />
                </Form.Item>
                {selectedTemplate?.scope === "per_series" && (
                  <Alert type="info" showIcon message="This makes one task for every exam of the same class and exam type." />
                )}
              </Form>
            ),
          },
          {
            key: "oneoff",
            label: "One-off",
            children: (
              <Form form={oneOffForm} layout="vertical" requiredMark={false}>
                <Form.Item
                  name="title"
                  label="Task"
                  rules={[{ required: true, message: "Name the task." }, { max: 200, message: "Maximum 200 characters." }]}
                >
                  <Input placeholder="Collect the revised answer keys" />
                </Form.Item>
                <Form.Item name="instructions" label="Instructions">
                  <Input.TextArea rows={2} placeholder="What the assignee is expected to do (optional)" />
                </Form.Item>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="assigneeDesignationId"
                      label="Assigned To"
                      rules={[{ required: true, message: "Choose the designation." }]}
                    >
                      <Select showSearch optionFilterProp="label" placeholder="Select a designation" options={designationOptions} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="eventId"
                      label="Exam"
                      tooltip={infoTip("Optional. A one-off task can stand on its own. Its dates are fixed either way — re-dating the exam doesn't move them.")}
                    >
                      <Select allowClear showSearch optionFilterProp="label" placeholder="None" options={examOptions} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="openAt" label="Opens" rules={[{ required: true, message: "Choose when it opens." }]}>
                      <DatePicker showTime={{ format: "hh:mm A" }} format="DD MMM YYYY, hh:mm A" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="dueAt"
                      label="Due"
                      dependencies={["openAt"]}
                      rules={[
                        { required: true, message: "Choose when it's due." },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const openAt = getFieldValue("openAt");
                            if (!value || !openAt || !value.isBefore(openAt)) return Promise.resolve();
                            return Promise.reject(new Error("It can't be due before it opens."));
                          },
                        }),
                      ]}
                    >
                      <DatePicker showTime={{ format: "hh:mm A" }} format="DD MMM YYYY, hh:mm A" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="gracePeriodValue"
                      label="Grace Period"
                      tooltip={infoTip("How long past the due time it may run before it counts as overdue. Leave both empty for none.")}
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
                  <Col span={12}>
                    <Form.Item name="gracePeriodUnit" label="Unit" dependencies={["gracePeriodValue"]}>
                      <Select allowClear placeholder="None" options={OFFSET_UNIT_OPTIONS} />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}

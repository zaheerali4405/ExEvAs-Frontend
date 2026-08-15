import { useState, useEffect, useMemo } from "react";
import { Modal, Form, Select, DatePicker, TimePicker, Row, Col } from "antd";
import dayjs from "dayjs";
import { createEvent, updateEvent, updateEventTime, updateEventStatus } from "../../api/eventsApi";
import { getExamTypes } from "../../api/examTypesApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { getEventCategories } from "../../api/eventCategoriesApi";
import { useAuth } from "../../context/AuthContext";

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

// Shared Add/Edit Event form, used by both the Events list page and the
// Timetable's "+" quick-add affordance (with the date pre-filled there).
//
// Selection is a 5-step cascade — Session → Program → Degree Level →
// Course/Paper → Exam Type — each narrowed by every prior choice. The first
// four are all derived from the fetched Course/Papers list itself (each one
// already carries its own program/degreeLevel/session), so only
// coursePaperId and examTypeId are ever sent to the backend.
//
// event.update, event.update-time, and event.update-status are all
// separately permission-gated (the SRDD's Scheduler(dates)/Scheduler(time)
// role split, plus status). Each section of the form only renders if the
// user holds the matching permission — an editor with only one of the three
// gets a form containing just that section.
export default function EventFormModal({ open, editingRecord, initialDate, onCancel, onSuccess, onError }) {
  const { can } = useAuth();
  const [examTypes, setExamTypes] = useState([]);
  const [coursePapers, setCoursePapers] = useState([]);
  const [eventCategories, setEventCategories] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedSessionId = Form.useWatch("sessionId", form);
  const selectedProgramId = Form.useWatch("programId", form);
  const selectedDegreeLevelId = Form.useWatch("degreeLevelId", form);
  const selectedCoursePaperId = Form.useWatch("coursePaperId", form);

  const canEditTime = can("event.update-time");
  const canEditMain = can("event.update");
  const canEditStatus = !!editingRecord && can("event.update-status");
  // Main fields (Session→Date) always show when adding; when editing, only
  // if the user holds event.update.
  const showMainFields = !editingRecord || canEditMain;

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (can("exam-type.read-all")) {
        try {
          const { data } = await getExamTypes();
          setExamTypes(data);
        } catch {
          // Non-fatal: the exam type dropdown just stays empty.
        }
      }
      if (can("course-paper.read-all")) {
        try {
          const { data } = await getCoursePapers();
          setCoursePapers(data);
        } catch {
          // Non-fatal: every downstream dropdown just stays empty.
        }
      }
      if (can("event-category.read-all")) {
        try {
          const { data } = await getEventCategories();
          setEventCategories(data);
        } catch {
          // Non-fatal: the event category dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editingRecord) {
      form.setFieldsValue({
        sessionId: editingRecord.sessionId,
        programId: editingRecord.programId,
        degreeLevelId: editingRecord.degreeLevelId,
        coursePaperId: editingRecord.coursePaperId,
        examTypeId: editingRecord.examTypeId,
        eventCategoryId: editingRecord.eventCategoryId,
        eventDate: editingRecord.eventDate ? dayjs(editingRecord.eventDate) : null,
        startTime: editingRecord.startTime ? dayjs(editingRecord.startTime, "HH:mm") : null,
        endTime: editingRecord.endTime ? dayjs(editingRecord.endTime, "HH:mm") : null,
        status: editingRecord.status,
      });
    } else {
      form.resetFields();
      if (initialDate) form.setFieldsValue({ eventDate: initialDate });
    }
  }, [open, editingRecord, initialDate, form]);

  const activeCoursePapers = useMemo(() => coursePapers.filter((c) => c.isActive), [coursePapers]);

  const sessionOptions = useMemo(() => {
    const byId = new Map();
    activeCoursePapers.forEach((c) => { if (c.session) byId.set(c.session.id, c.session); });
    return Array.from(byId.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name }));
  }, [activeCoursePapers]);

  const programOptions = useMemo(() => {
    if (!selectedSessionId) return [];
    const byId = new Map();
    activeCoursePapers
      .filter((c) => c.sessionId === selectedSessionId)
      .forEach((c) => { if (c.program) byId.set(c.program.id, c.program); });
    return Array.from(byId.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((p) => ({ value: p.id, label: p.fullName }));
  }, [activeCoursePapers, selectedSessionId]);

  const degreeLevelOptions = useMemo(() => {
    if (!selectedProgramId) return [];
    const byId = new Map();
    activeCoursePapers
      .filter((c) => c.sessionId === selectedSessionId && c.programId === selectedProgramId)
      .forEach((c) => { if (c.degreeLevel) byId.set(c.degreeLevel.id, c.degreeLevel); });
    return Array.from(byId.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((d) => ({ value: d.id, label: d.fullName }));
  }, [activeCoursePapers, selectedSessionId, selectedProgramId]);

  const coursePaperOptions = useMemo(() => {
    if (!selectedDegreeLevelId) return [];
    return activeCoursePapers
      .filter(
        (c) =>
          c.sessionId === selectedSessionId &&
          c.programId === selectedProgramId &&
          c.degreeLevelId === selectedDegreeLevelId
      )
      .map((c) => ({ value: c.id, label: c.fullName }));
  }, [activeCoursePapers, selectedSessionId, selectedProgramId, selectedDegreeLevelId]);

  const examTypeOptions = useMemo(() => {
    if (!selectedCoursePaperId) return [];
    return examTypes.filter((e) => e.isActive).map((e) => ({ value: e.id, label: e.fullName }));
  }, [examTypes, selectedCoursePaperId]);

  const eventCategoryOptions = useMemo(
    () => eventCategories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [eventCategories]
  );

  const handleFinish = async (values) => {
    setModalLoading(true);
    try {
      let data;
      if (editingRecord) {
        if (canEditMain) {
          ({ data } = await updateEvent(editingRecord.id, {
            coursePaperId: values.coursePaperId,
            examTypeId: values.examTypeId,
            eventCategoryId: values.eventCategoryId,
            eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          }));
        }
        if (canEditTime) {
          ({ data } = await updateEventTime(editingRecord.id, {
            startTime: values.startTime ? values.startTime.format("HH:mm") : undefined,
            endTime: values.endTime ? values.endTime.format("HH:mm") : undefined,
          }));
        }
        if (canEditStatus) {
          ({ data } = await updateEventStatus(editingRecord.id, values.status));
        }
      } else {
        ({ data } = await createEvent({
          coursePaperId: values.coursePaperId,
          examTypeId: values.examTypeId,
          eventCategoryId: values.eventCategoryId,
          eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          startTime: canEditTime && values.startTime ? values.startTime.format("HH:mm") : undefined,
          endTime: canEditTime && values.endTime ? values.endTime.format("HH:mm") : undefined,
        }));
      }
      onSuccess(data, !!editingRecord);
    } catch (err) {
      onError?.(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} event.`);
    } finally {
      setModalLoading(false);
    }
  };

  const title = editingRecord ? "Edit Event" : "Add Event";

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={editingRecord ? "Save" : "Add"}
      confirmLoading={modalLoading}
      destroyOnClose
      centered
      width={showMainFields ? 720 : 420}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        style={{ marginTop: 16 }}
      >
        {showMainFields && (
          <>
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="sessionId"
                  label="Session"
                  rules={[{ required: true, message: "Please select a session." }]}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select session"
                    options={sessionOptions}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ programId: undefined, degreeLevelId: undefined, coursePaperId: undefined, examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="programId"
                  label="Program"
                  rules={[{ required: true, message: "Please select a program." }]}
                  extra={!selectedSessionId ? "Select a session first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select program"
                    options={programOptions}
                    disabled={!selectedSessionId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ degreeLevelId: undefined, coursePaperId: undefined, examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="degreeLevelId"
                  label="Degree Level"
                  rules={[{ required: true, message: "Please select a degree level." }]}
                  extra={!selectedProgramId ? "Select a program first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select degree level"
                    options={degreeLevelOptions}
                    disabled={!selectedProgramId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ coursePaperId: undefined, examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="coursePaperId"
                  label="Course/Paper"
                  rules={[{ required: true, message: "Please select a course/paper." }]}
                  extra={!selectedDegreeLevelId ? "Select a degree level first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select course/paper"
                    options={coursePaperOptions}
                    disabled={!selectedDegreeLevelId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="examTypeId"
                  label="Exam Type"
                  rules={[{ required: true, message: "Please select an exam type." }]}
                  extra={!selectedCoursePaperId ? "Select a course/paper first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select exam type"
                    options={examTypeOptions}
                    disabled={!selectedCoursePaperId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="eventCategoryId"
                  label="Event Category"
                  rules={[{ required: true, message: "Please select an event category." }]}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select event category"
                    options={eventCategoryOptions}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item name="eventDate" label="Date">
                  <DatePicker className="assignment-select" style={{ width: "100%" }} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {canEditTime && (
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="startTime"
                label="Start Time"
                dependencies={["endTime"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const endTime = getFieldValue("endTime");
                      if (!value || !endTime || value.isBefore(endTime)) return Promise.resolve();
                      return Promise.reject(new Error("Start time must be before end time."));
                    },
                  }),
                ]}
              >
                <TimePicker className="assignment-select" style={{ width: "100%" }} format="HH:mm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="endTime"
                label="End Time"
                dependencies={["startTime"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const startTime = getFieldValue("startTime");
                      if (!value || !startTime || value.isAfter(startTime)) return Promise.resolve();
                      return Promise.reject(new Error("End time must be after start time."));
                    },
                  }),
                ]}
              >
                <TimePicker className="assignment-select" style={{ width: "100%" }} format="HH:mm" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {canEditStatus && (
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true, message: "Please select a status." }]}
              >
                <Select className="assignment-select" options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
        )}
      </Form>
    </Modal>
  );
}

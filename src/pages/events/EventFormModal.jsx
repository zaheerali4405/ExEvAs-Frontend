import { useState, useEffect, useMemo } from "react";
import { Modal, Form, Select, DatePicker, TimePicker, Row, Col, Alert, Checkbox } from "antd";
import dayjs from "dayjs";
import { createEvent, updateEvent, updateEventTime, updateEventStatus } from "../../api/eventsApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { getClasses } from "../../api/classesApi";
import { useAuth } from "../../context/AuthContext";

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

// Shared Add/Edit Event form, used by both the Events list page and the
// Datesheet calendar's "+" quick-add affordance (with the date pre-filled
// there). Event is Exam-only — Moderation Meeting was split into its own
// table/form (see [[project_moderation_meeting_split]] memory), so there's
// no event category concept here anymore.
//
// Class → Course/Paper → Exam Type is a 3-step cascade. Class is the single
// entry point for Program + Degree Level + Session — those three are never
// picked separately, they're read off the selected Class. Course/Paper
// options are then narrowed by the Class's program/degreeLevel, and Exam
// Type options are narrowed to only that paper's own assigned exam types
// (CoursePaperExamType — a paper is only examinable under exam types
// explicitly assigned to it, not any globally-defined one).
//
// event.update, event.update-time, and event.update-status are all
// separately permission-gated (the SRDD's Scheduler(dates)/Scheduler(time)
// role split, plus status). Each section of the form only renders if the
// user holds the matching permission — an editor with only one of the three
// gets a form containing just that section.
export default function EventFormModal({ open, editingRecord, initialDate, existingEvents = [], onCancel, onSuccess, onError }) {
  const { can } = useAuth();
  const [coursePapers, setCoursePapers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedClassId = Form.useWatch("classId", form);
  const selectedCoursePaperId = Form.useWatch("coursePaperId", form);
  const selectedExamTypeId = Form.useWatch("examTypeId", form);
  const isRetakeChecked = Form.useWatch("isRetake", form);

  const canEditPastEvents = can("event.update-past");
  // A normal event.update/-time/-status holder can only edit today's or
  // future-dated events — editing a past event requires event.update-past.
  const isPastEvent =
    !!editingRecord?.eventDate && dayjs(editingRecord.eventDate).isBefore(dayjs().startOf("day"), "day");
  const isLocked = isPastEvent && !canEditPastEvents;

  const canEditTime = can("event.update-time") && !isLocked;
  const canEditMain = can("event.update") && !isLocked;
  const canEditStatus = !!editingRecord && can("event.update-status") && !isLocked;
  // Main fields (Class→Date) always show when adding; when editing, only
  // if the user holds event.update (and the event isn't past-locked).
  const showMainFields = !editingRecord || canEditMain;

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (can("course-paper.read-all")) {
        try {
          const { data } = await getCoursePapers();
          setCoursePapers(data);
        } catch {
          // Non-fatal: every downstream dropdown just stays empty.
        }
      }
      if (can("class.read-all")) {
        try {
          const { data } = await getClasses();
          setClasses(data);
        } catch {
          // Non-fatal: the class dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCoursePapers = useMemo(() => coursePapers.filter((c) => c.isActive), [coursePapers]);
  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);
  const selectedClass = useMemo(
    () => activeClasses.find((c) => c.id === selectedClassId) ?? null,
    [activeClasses, selectedClassId]
  );

  useEffect(() => {
    if (!open) return;
    if (editingRecord) {
      // The event only stores programId/degreeLevelId/sessionId directly —
      // back into whichever Class matches that exact triple.
      const matchingClass = classes.find(
        (c) =>
          c.programId === editingRecord.programId &&
          c.degreeLevelId === editingRecord.degreeLevelId &&
          c.sessionId === editingRecord.sessionId
      );
      form.setFieldsValue({
        classId: matchingClass?.id,
        coursePaperId: editingRecord.coursePaperId,
        examTypeId: editingRecord.examTypeId,
        eventDate: editingRecord.eventDate ? dayjs(editingRecord.eventDate) : null,
        startTime: editingRecord.startTime ? dayjs(editingRecord.startTime, "HH:mm") : null,
        endTime: editingRecord.endTime ? dayjs(editingRecord.endTime, "HH:mm") : null,
        status: editingRecord.status,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        eventDate: initialDate || undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRecord, initialDate, classes, form]);

  // Same as Class.fullName, but with the program's short name instead of its
  // full name — keeps the dropdown readable (e.g. "MBBS 1st Year 2025-26").
  const classLabel = (c) =>
    `${c.program?.shortName || c.program?.fullName || ""} ${c.degreeLevel?.fullName || ""} ${c.session?.name || ""}`.replace(/\s+/g, " ").trim();

  // In retake mode, every dropdown is filtered down to "does an original
  // (non-retake) event already exist for this?" instead of the opposite —
  // per [[project — retake]], existence checks for retakes only ever look
  // at non-retake events (an existing retake never blocks/enables anything).
  const classOptions = useMemo(() => {
    const base = activeClasses;
    const filtered = isRetakeChecked
      ? base.filter((c) =>
          existingEvents.some(
            (e) => !e.isRetake && e.programId === c.programId && e.degreeLevelId === c.degreeLevelId && e.sessionId === c.sessionId
          )
        )
      : base;
    return filtered.map((c) => ({ value: c.id, label: classLabel(c) }));
  }, [activeClasses, existingEvents, isRetakeChecked]);

  const coursePaperOptions = useMemo(() => {
    if (!selectedClass) return [];
    const base = activeCoursePapers.filter(
      (c) => c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId
    );
    const filtered = isRetakeChecked
      ? base.filter((c) =>
          existingEvents.some((e) => !e.isRetake && e.coursePaperId === c.id && e.sessionId === selectedClass.sessionId)
        )
      : base;
    return filtered.map((c) => ({ value: c.id, label: c.fullName }));
  }, [activeCoursePapers, selectedClass, existingEvents, isRetakeChecked]);

  const selectedCoursePaper = useMemo(
    () => activeCoursePapers.find((c) => c.id === selectedCoursePaperId) ?? null,
    [activeCoursePapers, selectedCoursePaperId]
  );

  // Exam types this course/paper already has a non-retake (original) event
  // for, in the selected class's session — excluded in normal mode (an Event
  // is unique per coursePaperId+examTypeId+sessionId+isRetake, so a new
  // non-retake event would only ever collide with one of these), and exactly
  // the set retake mode instead requires. Excludes the record being edited
  // itself, so its own current exam type stays selectable there.
  const originalExamTypeIds = useMemo(() => {
    if (!selectedCoursePaperId || !selectedClass) return new Set();
    return new Set(
      existingEvents
        .filter(
          (e) =>
            !e.isRetake &&
            e.coursePaperId === selectedCoursePaperId &&
            e.sessionId === selectedClass.sessionId &&
            e.id !== editingRecord?.id
        )
        .map((e) => e.examTypeId)
    );
  }, [existingEvents, selectedCoursePaperId, selectedClass, editingRecord]);

  const examTypeOptions = useMemo(() => {
    if (!selectedCoursePaper) return [];
    return (selectedCoursePaper.examTypes || [])
      .map((link) => link.examType)
      .filter((et) => et && et.isActive && (isRetakeChecked ? originalExamTypeIds.has(et.id) : !originalExamTypeIds.has(et.id)))
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [selectedCoursePaper, originalExamTypeIds, isRetakeChecked]);

  // The original event being retaken, once class+course/paper+exam type are
  // all selected in retake mode — its date is the floor for the retake's.
  const originalEvent = useMemo(() => {
    if (!isRetakeChecked || !selectedClass || !selectedCoursePaperId || !selectedExamTypeId) return null;
    return (
      existingEvents.find(
        (e) =>
          !e.isRetake &&
          e.coursePaperId === selectedCoursePaperId &&
          e.examTypeId === selectedExamTypeId &&
          e.sessionId === selectedClass.sessionId
      ) ?? null
    );
  }, [existingEvents, isRetakeChecked, selectedClass, selectedCoursePaperId, selectedExamTypeId]);

  const handleFinish = async (values) => {
    if (!selectedClass) {
      onError?.("Please select a class.");
      return;
    }
    setModalLoading(true);
    try {
      let data;
      const payload = {
        coursePaperId: values.coursePaperId,
        examTypeId: values.examTypeId,
        sessionId: selectedClass.sessionId,
      };
      if (editingRecord) {
        if (canEditMain) {
          ({ data } = await updateEvent(editingRecord.id, {
            ...payload,
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
          ...payload,
          eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          startTime: canEditTime && values.startTime ? values.startTime.format("HH:mm") : undefined,
          endTime: canEditTime && values.endTime ? values.endTime.format("HH:mm") : undefined,
          isRetake: !!values.isRetake,
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
      okButtonProps={{ disabled: isLocked }}
      confirmLoading={modalLoading}
      destroyOnClose
      centered
      width={showMainFields ? 720 : 420}
    >
      {isLocked && (
        <Alert
          type="warning"
          showIcon
          message="This event's date has already passed. You do not have permission to edit past events."
          style={{ marginTop: 16 }}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        style={{ marginTop: 16 }}
      >
        {/* Retake mode only applies to Add — an existing event's retake
            status isn't something you flip after the fact. */}
        {!editingRecord && (
          <Form.Item name="isRetake" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox
              onChange={(e) => {
                // The option sets for every downstream dropdown flip meaning
                // entirely (unscheduled vs. already-scheduled) — nothing
                // picked under the old mode is valid under the new one.
                form.setFieldsValue({
                  isRetake: e.target.checked,
                  classId: undefined,
                  coursePaperId: undefined,
                  examTypeId: undefined,
                  eventDate: undefined,
                });
              }}
            >
              Is this a retake?
            </Checkbox>
          </Form.Item>
        )}

        {showMainFields && (
          <>
            <Row gutter={24}>
              <Col span={24}>
                <Form.Item
                  name="classId"
                  label="Class"
                  rules={[{ required: true, message: "Please select a class." }]}
                  extra={
                    isRetakeChecked && classOptions.length === 0
                      ? "No class has an existing event yet — there's nothing to retake."
                      : undefined
                  }
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select class"
                    options={classOptions}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ coursePaperId: undefined, examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="coursePaperId"
                  label="Course/Paper"
                  rules={[{ required: true, message: "Please select a course/paper." }]}
                  extra={
                    !selectedClass
                      ? "Select a class first."
                      : isRetakeChecked && coursePaperOptions.length === 0
                      ? "None of this class's course/papers have an existing event yet."
                      : undefined
                  }
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select course/paper"
                    options={coursePaperOptions}
                    disabled={!selectedClass}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldValue("examTypeId", undefined)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="examTypeId"
                  label="Exam Type"
                  rules={[{ required: true, message: "Please select an exam type." }]}
                  extra={
                    !selectedCoursePaperId
                      ? "Select a course/paper first."
                      : examTypeOptions.length === 0 && isRetakeChecked
                      ? "This course/paper has no exam type with an existing event to retake."
                      : examTypeOptions.length === 0 &&
                        (selectedCoursePaper?.examTypes || []).some((l) => l.examType?.isActive)
                      ? "All exam types for this course/paper already have an event in this session."
                      : undefined
                  }
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
            </Row>

            <Row gutter={24}>
              <Col span={24}>
                <Form.Item
                  name="eventDate"
                  label="Date"
                  extra={
                    isRetakeChecked && originalEvent?.eventDate
                      ? `Must be after the original event's date: ${dayjs(originalEvent.eventDate).format("DD MMM YYYY")}.`
                      : isRetakeChecked && selectedExamTypeId && !originalEvent?.eventDate
                      ? "The original event has no date set yet — set one there first."
                      : undefined
                  }
                >
                  <DatePicker
                    className="assignment-select"
                    style={{ width: "100%" }}
                    format="YYYY-MM-DD"
                    disabledDate={
                      isRetakeChecked && originalEvent?.eventDate
                        ? (date) => !date.isAfter(dayjs(originalEvent.eventDate), "day")
                        : undefined
                    }
                  />
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

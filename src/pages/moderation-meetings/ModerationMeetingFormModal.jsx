import { useState, useEffect, useMemo } from "react";
import { Modal, Form, Select, DatePicker, TimePicker, Row, Col } from "antd";
import dayjs from "dayjs";
import {
  createModerationMeeting, updateModerationMeeting, updateModerationMeetingTime, updateModerationMeetingStatus,
} from "../../api/moderationMeetingsApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { getClasses } from "../../api/classesApi";
import { useAuth } from "../../context/useAuth";

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

// Class → Course/Paper → Subject → Exam Type is a 4-step cascade (one more
// than Event's, since a Moderation Meeting is against a single subject of a
// course/paper, not the whole paper — a paper with 3 subjects can have 3
// meetings). Subject options come from the selected Course/Paper's own
// linked subjects (CoursePaperSubject); the value stored on the form is the
// CoursePaperSubject row's own id, not the bare Subject id — the same
// subject can be linked to different papers, so the pairing matters.
//
// moderation-meeting.update, .update-time, and .update-status are
// separately permission-gated, same split as Event.
//
// No Venue field — every meeting uses whichever Venue is categorized
// "moderation" (there is only ever meant to be one), auto-assigned
// server-side (ModerationMeetingsService.resolveVenueId), not user-selectable.
export default function ModerationMeetingFormModal({ open, editingRecord, initialDate, onCancel, onSuccess, onError }) {
  const { can } = useAuth();
  const [coursePapers, setCoursePapers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedClassId = Form.useWatch("classId", form);
  const selectedCoursePaperId = Form.useWatch("coursePaperId", form);

  const canEditTime = can("moderation-meeting.update-time");
  const canEditMain = can("moderation-meeting.update");
  const canEditStatus = !!editingRecord && can("moderation-meeting.update-status");
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
  }, [open, can]);

  const activeCoursePapers = useMemo(() => coursePapers.filter((c) => c.isActive), [coursePapers]);
  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);
  const selectedClass = useMemo(
    () => activeClasses.find((c) => c.id === selectedClassId) ?? null,
    [activeClasses, selectedClassId]
  );

  useEffect(() => {
    if (!open) return;
    if (editingRecord) {
      // The meeting only stores programId/degreeLevelId/sessionId directly —
      // back into whichever Class matches that exact triple.
      const matchingClass = classes.find(
        (c) =>
          c.programId === editingRecord.programId &&
          c.degreeLevelId === editingRecord.degreeLevelId &&
          c.sessionId === editingRecord.sessionId
      );
      form.setFieldsValue({
        classId: matchingClass?.id,
        coursePaperId: editingRecord.coursePaperSubject?.coursePaperId,
        coursePaperSubjectId: editingRecord.coursePaperSubjectId,
        examTypeId: editingRecord.examTypeId,
        eventDate: editingRecord.eventDate ? dayjs(editingRecord.eventDate) : null,
        startTime: editingRecord.startTime ? dayjs(editingRecord.startTime, "HH:mm") : null,
        endTime: editingRecord.endTime ? dayjs(editingRecord.endTime, "HH:mm") : null,
        status: editingRecord.status,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ eventDate: initialDate || undefined });
    }
  }, [open, editingRecord, initialDate, classes, form]);

  // Same as Class.fullName, but with the program's short name instead of its
  // full name — keeps the dropdown readable (e.g. "MBBS 1st Year 2025-26").
  const classLabel = (c) =>
    `${c.program?.shortName || c.program?.fullName || ""} ${c.degreeLevel?.fullName || ""} ${c.session?.name || ""}`.replace(/\s+/g, " ").trim();

  const classOptions = useMemo(
    () => activeClasses.map((c) => ({ value: c.id, label: classLabel(c) })),
    [activeClasses]
  );

  const coursePaperOptions = useMemo(() => {
    if (!selectedClass) return [];
    return activeCoursePapers
      .filter((c) => c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId)
      .map((c) => ({ value: c.id, label: c.fullName }));
  }, [activeCoursePapers, selectedClass]);

  const selectedCoursePaper = useMemo(
    () => activeCoursePapers.find((c) => c.id === selectedCoursePaperId) ?? null,
    [activeCoursePapers, selectedCoursePaperId]
  );

  const subjectOptions = useMemo(() => {
    if (!selectedCoursePaper) return [];
    return (selectedCoursePaper.subjects || [])
      .filter((link) => link.subject)
      .map((link) => ({ value: link.id, label: link.subject.fullName }));
  }, [selectedCoursePaper]);

  const examTypeOptions = useMemo(() => {
    if (!selectedCoursePaper) return [];
    return (selectedCoursePaper.examTypes || [])
      .map((link) => link.examType)
      .filter((et) => et && et.isActive)
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [selectedCoursePaper]);

  const handleFinish = async (values) => {
    if (!selectedClass) {
      onError?.("Please select a class.");
      return;
    }
    setModalLoading(true);
    try {
      let data;
      const payload = {
        coursePaperSubjectId: values.coursePaperSubjectId,
        examTypeId: values.examTypeId,
        sessionId: selectedClass.sessionId,
      };
      if (editingRecord) {
        if (canEditMain) {
          ({ data } = await updateModerationMeeting(editingRecord.id, {
            ...payload,
            eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          }));
        }
        if (canEditTime) {
          ({ data } = await updateModerationMeetingTime(editingRecord.id, {
            startTime: values.startTime ? values.startTime.format("HH:mm") : undefined,
            endTime: values.endTime ? values.endTime.format("HH:mm") : undefined,
          }));
        }
        if (canEditStatus) {
          ({ data } = await updateModerationMeetingStatus(editingRecord.id, values.status));
        }
      } else {
        ({ data } = await createModerationMeeting({
          ...payload,
          eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          startTime: canEditTime && values.startTime ? values.startTime.format("HH:mm") : undefined,
          endTime: canEditTime && values.endTime ? values.endTime.format("HH:mm") : undefined,
        }));
      }
      onSuccess(data, !!editingRecord);
    } catch (err) {
      onError?.(err.response?.data?.message || `Could not ${editingRecord ? "update" : "create"} moderation meeting.`);
    } finally {
      setModalLoading(false);
    }
  };

  const title = editingRecord ? "Edit Moderation Meeting" : "Add Moderation Meeting";

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={editingRecord ? "Save" : "Add"}
      confirmLoading={modalLoading}
      destroyOnHidden
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
              <Col span={24}>
                <Form.Item
                  name="classId"
                  label="Class"
                  rules={[{ required: true, message: "Please select a class." }]}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select class"
                    options={classOptions}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ coursePaperId: undefined, coursePaperSubjectId: undefined, examTypeId: undefined })}
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
                  extra={!selectedClass ? "Select a class first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select course/paper"
                    options={coursePaperOptions}
                    disabled={!selectedClass}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ coursePaperSubjectId: undefined, examTypeId: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="coursePaperSubjectId"
                  label="Subject"
                  rules={[{ required: true, message: "Please select a subject." }]}
                  extra={!selectedCoursePaperId ? "Select a course/paper first." : undefined}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select subject"
                    options={subjectOptions}
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
            </Row>

            <Row gutter={24}>
              <Col span={24}>
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

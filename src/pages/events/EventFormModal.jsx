import { useState, useEffect, useMemo } from "react";
import { Modal, Form, Select, DatePicker, TimePicker, Row, Col, Alert, Checkbox, Input, InputNumber, Tabs } from "antd";
import dayjs from "dayjs";
import { createEvent, updateEvent, updateEventTime, updateEventStatus } from "../../api/eventsApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { getClasses } from "../../api/classesApi";
import { getPrograms } from "../../api/programsApi";
import { getDepartments } from "../../api/departmentsApi";
import { getExamCategories } from "../../api/examCategoriesApi";
import { getExamCategoryRules } from "../../api/examCategoryRulesApi";
import { rulesForPair, anyScopeAllows } from "../../utils/examRules";
import { infoTip } from "../../utils/formTooltip";
import { getExamTypes } from "../../api/examTypesApi";
import { useAuth } from "../../context/AuthContext";

const { RangePicker } = DatePicker;

const STATUS_OPTIONS = [
  { value: "hold",        label: "Hold" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

// Shared Add/Edit Event form, used by both the Events list page and the
// Datesheet calendar's "+" quick-add affordance (with the date pre-filled
// there). Event is the single master table for every ExamCategory (Theory,
// OSPE, OSCE, Viva, Practical, ...) — this form reads each category's
// capability flags to decide which fields apply, rather than assuming
// Theory's shape.
//
// Class → Exam Category → Exam Type → Course/Paper(s) is the cascade.
// Class is the single entry point for Program + Degree Level + Session.
// Exam Category options are narrowed to whichever categories are actually
// mapped to that class's program/degree level (see Exam Category Mapping).
// Exam Type options are the union of every exam type assigned to any of the
// class's course/papers; Course/Paper options are then narrowed to papers
// examinable under the selected exam type — same cascade OspeOsceList used,
// now shared by every category. Course/Paper is always a multi-select, but
// capped at one pick unless the category's allowsMultiplePapers.
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
  const [examCategories, setExamCategories] = useState([]);
  const [allExamTypes, setAllExamTypes] = useState([]);
  const [pairRules, setPairRules] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  // Which tab is showing while adding: "normal" or "standalone".
  const [formMode, setFormMode] = useState("normal");
  const selectedClassId = Form.useWatch("classId", form);
  const selectedCategoryId = Form.useWatch("examCategoryId", form);
  const selectedExamTypeId = Form.useWatch("examTypeId", form);
  const selectedCoursePaperIds = Form.useWatch("coursePaperIds", form);
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
      try {
        const [categoriesRes, rulesRes] = await Promise.all([
          getExamCategories(), getExamCategoryRules(),
        ]);
        setExamCategories(categoriesRes.data);
        setPairRules(rulesRes.data);
      } catch {
        // Non-fatal: the category dropdown just stays empty.
      }
      try {
        const { data } = await getExamTypes();
        setAllExamTypes(data);
      } catch {
        // Non-fatal: the standalone exam type dropdown just stays empty.
      }
      // Only a standalone exam picks these directly — a normal exam derives
      // both from its course/papers.
      if (can("program.read-all")) {
        try {
          const { data } = await getPrograms();
          setPrograms(data);
        } catch {
          // Non-fatal: the program dropdown just stays empty.
        }
      }
      if (can("department.read-all")) {
        try {
          const { data } = await getDepartments();
          setDepartments(data);
        } catch {
          // Non-fatal: the department dropdown just stays empty.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Kept only so an already-existing non-academic event (created back when
  // Exam Scope carried a Course/Paper-linking flag) still displays and edits
  // correctly — there is no way to create a new one from this form anymore;
  // that distinction is being moved onto Exam Type itself.
  const nonAcademicExamTypeOptions = useMemo(
    () => allExamTypes.filter((et) => et.isActive).map((et) => ({ value: et.id, label: et.fullName })),
    [allExamTypes]
  );

  const isExternalMode = !!editingRecord && !editingRecord.examCategory;

  // A standalone exam — one whose exam type doesn't link course/papers. Sat
  // by people who are not our students, so it has no class and no papers,
  // just a category, a date, a title, and whichever of program and
  // departments applies. When editing, the exam itself says so; when adding,
  // the scheduler chooses at the top of the form.
  const isStandaloneMode = editingRecord
    ? editingRecord.examType?.linksCoursePapers === false
    : formMode === "standalone";

  // Nothing picked under one tab means anything under the other, so the
  // whole cascade is cleared on the way across.
  const switchFormMode = (mode) => {
    setFormMode(mode);
    form.setFieldsValue({
      isRetake: false,
      classId: undefined,
      examCategoryId: undefined,
      coursePaperIds: undefined,
      examTypeId: undefined,
      programId: undefined,
      departmentIds: undefined,
      title: undefined,
      expectedCandidates: undefined,
      eventDate: undefined,
      dateRange: undefined,
    });
  };

  const standaloneExamTypeOptions = useMemo(
    () =>
      allExamTypes
        .filter((et) => et.isActive && et.linksCoursePapers === false)
        .map((et) => ({ value: et.id, label: et.fullName })),
    [allExamTypes]
  );
  const programOptions = useMemo(
    () =>
      programs
        .filter((p) => p.isActive)
        .map((p) => ({ value: p.id, label: p.shortName || p.fullName })),
    [programs]
  );
  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive)
        .map((d) => ({ value: d.id, label: d.name })),
    [departments]
  );

  const activeCoursePapers = useMemo(() => coursePapers.filter((c) => c.isActive), [coursePapers]);
  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);
  const activeCategories = useMemo(() => examCategories.filter((c) => c.isActive), [examCategories]);
  const selectedClass = useMemo(
    () => activeClasses.find((c) => c.id === selectedClassId) ?? null,
    [activeClasses, selectedClassId]
  );
  const selectedCategory = useMemo(
    () => activeCategories.find((c) => c.id === selectedCategoryId) ?? null,
    [activeCategories, selectedCategoryId]
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
        examCategoryId: editingRecord.examCategoryId,
        coursePaperIds: (editingRecord.coursePapers || []).map((cp) => cp.coursePaperId),
        examTypeId: editingRecord.examTypeId,
        title: editingRecord.title ?? undefined,
        programId: editingRecord.programId ?? undefined,
        departmentIds: (editingRecord.eventDepartments || []).map((d) => d.departmentId),
        expectedCandidates: editingRecord.expectedCandidates ?? undefined,
        eventDate: editingRecord.eventDate ? dayjs(editingRecord.eventDate) : null,
        dateRange: editingRecord.eventDate
          ? [dayjs(editingRecord.eventDate), editingRecord.endDate ? dayjs(editingRecord.endDate) : dayjs(editingRecord.eventDate)]
          : undefined,
        startTime: editingRecord.startTime ? dayjs(editingRecord.startTime, "HH:mm") : null,
        endTime: editingRecord.endTime ? dayjs(editingRecord.endTime, "HH:mm") : null,
        status: editingRecord.status,
      });
    } else {
      form.resetFields();
      setFormMode("normal");
      form.setFieldsValue({
        eventDate: initialDate || undefined,
        dateRange: initialDate ? [initialDate, initialDate] : undefined,
      });
    }
  }, [open, editingRecord, initialDate, classes, form]);

  // Same as Class.fullName, but with the program's short name instead of its
  // full name — keeps the dropdown readable (e.g. "MBBS 1st Year 2025-26").
  const classLabel = (c) =>
    `${c.program?.shortName || c.program?.fullName || ""} ${c.degreeLevel?.fullName || ""} ${c.session?.name || ""}`.replace(/\s+/g, " ").trim();

  // In retake mode, every dropdown is filtered down to "does an original
  // (non-retake) event already exist for this?" instead of the opposite —
  // per [[project — retake]], existence checks for retakes only ever look
  // at non-retake events (an existing retake never blocks/enables anything).
  // This first pass is a broad, category-agnostic pre-filter (category
  // itself isn't picked until after Class) — Exam Category options narrow
  // it further once a class is selected.
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

  const classCoursePapers = useMemo(() => {
    if (!selectedClass) return [];
    return activeCoursePapers.filter((c) => c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId);
  }, [activeCoursePapers, selectedClass]);

  // Exam types this class's papers are examinable under, at all (union) —
  // narrowed in retake mode to only exam types the selected category
  // already has an original for, for this class.
  // Categories offered by at least one of this class's own course/papers —
  // the union, since a category is worth offering if any paper is examined
  // under it. Which papers may then be picked is narrowed to that category
  // in coursePaperOptions below. Further narrowed in retake mode to
  // categories that both allow retakes and already have an original for
  // this exact class.
  const mappedCategoryIds = useMemo(() => {
    const ids = new Set();
    classCoursePapers.forEach((cp) =>
      (cp.examCategories || []).forEach((link) => ids.add(link.examCategoryId))
    );
    return ids;
  }, [classCoursePapers]);

  const categoryOptions = useMemo(() => {
    if (!selectedClass) return [];
    const base = activeCategories.filter((c) => mappedCategoryIds.has(c.id));
    const filtered = isRetakeChecked
      ? base.filter(
          (c) =>
            anyScopeAllows(pairRules, c.id, 'allowsRetake') &&
            existingEvents.some(
              (e) =>
                !e.isRetake &&
                e.examCategoryId === c.id &&
                e.programId === selectedClass.programId &&
                e.degreeLevelId === selectedClass.degreeLevelId &&
                e.sessionId === selectedClass.sessionId
            )
        )
      : base;
    return filtered.map((c) => ({ value: c.id, label: c.name }));
  }, [activeCategories, mappedCategoryIds, existingEvents, selectedClass, isRetakeChecked, pairRules]);

  const classOriginalExamTypeIds = useMemo(() => {
    if (!selectedClass || !selectedCategoryId) return new Set();
    return new Set(
      existingEvents
        .filter(
          (e) =>
            !e.isRetake &&
            e.examCategoryId === selectedCategoryId &&
            e.programId === selectedClass.programId &&
            e.degreeLevelId === selectedClass.degreeLevelId &&
            e.sessionId === selectedClass.sessionId
        )
        .map((e) => e.examTypeId)
    );
  }, [existingEvents, selectedClass, selectedCategoryId]);

  const examTypeOptions = useMemo(() => {
    const byId = new Map();
    classCoursePapers.forEach((cp) => {
      (cp.examTypes || []).forEach((link) => {
        const et = link.examType;
        if (et && et.isActive && !byId.has(et.id)) byId.set(et.id, et);
      });
    });
    return Array.from(byId.values())
      .filter((et) => !isRetakeChecked || classOriginalExamTypeIds.has(et.id))
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [classCoursePapers, isRetakeChecked, classOriginalExamTypeIds]);

  // A paper is offered only if it carries BOTH the selected exam type and
  // the selected category — the category no longer being a curriculum-wide
  // fact means a paper in this class may simply not be examined that way.
  const classExamTypeCoursePapers = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classCoursePapers.filter(
      (c) =>
        (c.examTypes || []).some((link) => link.examTypeId === selectedExamTypeId) &&
        (!selectedCategoryId ||
          (c.examCategories || []).some((link) => link.examCategoryId === selectedCategoryId))
    );
  }, [classCoursePapers, selectedExamTypeId, selectedCategoryId]);

  // Course/papers already carrying a non-retake original under the
  // selected category (for this class+exam type) and whether each already
  // has its own retake too — drives which papers retake mode offers. Not
  // used to exclude anything in normal (non-retake) mode — a category that
  // allows a date range routinely gets several separate original batches
  // per paper, and even a single-date category's own uniqueness is
  // enforced server-side rather than pre-filtered here.
  const originalStatusByCoursePaper = useMemo(() => {
    if (!selectedClass || !selectedExamTypeId || !selectedCategoryId) return new Map();
    const map = new Map();
    existingEvents
      .filter(
        (e) =>
          e.examCategoryId === selectedCategoryId &&
          e.programId === selectedClass.programId &&
          e.degreeLevelId === selectedClass.degreeLevelId &&
          e.sessionId === selectedClass.sessionId &&
          e.examTypeId === selectedExamTypeId
      )
      .forEach((e) => {
        (e.coursePapers || []).forEach((cp) => {
          const entry = map.get(cp.coursePaperId) || { hasOriginal: false, hasRetake: false };
          if (e.isRetake) entry.hasRetake = true;
          else entry.hasOriginal = true;
          map.set(cp.coursePaperId, entry);
        });
      });
    return map;
  }, [existingEvents, selectedClass, selectedExamTypeId, selectedCategoryId]);

  const coursePaperOptions = useMemo(() => {
    const base = isRetakeChecked
      ? classExamTypeCoursePapers.filter((cp) => {
          const status = originalStatusByCoursePaper.get(cp.id);
          return status?.hasOriginal && !status.hasRetake;
        })
      : classExamTypeCoursePapers;
    return base.map((cp) => ({ value: cp.id, label: cp.shortName || cp.fullName }));
  }, [classExamTypeCoursePapers, isRetakeChecked, originalStatusByCoursePaper]);

  // In retake mode, the latest original batch's own end (or event) date,
  // across every currently-selected paper — the floor a retake's date must
  // clear. The backend enforces this per paper regardless; this is just the
  // UI hint/date-picker floor.
  const retakeDateFloor = useMemo(() => {
    const paperIds = selectedCoursePaperIds || [];
    if (!isRetakeChecked || !selectedClass || !selectedExamTypeId || paperIds.length === 0) return null;
    let floor = null;
    paperIds.forEach((cpId) => {
      existingEvents
        .filter(
          (e) =>
            !e.isRetake &&
            e.examCategoryId === selectedCategoryId &&
            e.examTypeId === selectedExamTypeId &&
            e.sessionId === selectedClass.sessionId &&
            (e.coursePapers || []).some((cp) => cp.coursePaperId === cpId)
        )
        .forEach((o) => {
          const end = o.endDate ?? o.eventDate;
          if (end && (!floor || dayjs(end).isAfter(floor))) floor = dayjs(end);
        });
    });
    return floor;
  }, [existingEvents, isRetakeChecked, selectedClass, selectedExamTypeId, selectedCategoryId, selectedCoursePaperIds]);

  const handleFinish = async (values) => {
    if (!isExternalMode && !isStandaloneMode && !selectedClass) {
      onError?.("Please select a class.");
      return;
    }
    setModalLoading(true);
    try {
      let data;

      // Standalone — no class, no papers, no session. The session is
      // stamped server-side from whichever one is current.
      if (isStandaloneMode) {
        const allowsRange = !!selectedRules.allowsDateRange;
        const dates = {
          eventDate: allowsRange
            ? values.dateRange?.[0]?.format("YYYY-MM-DD")
            : values.eventDate?.format("YYYY-MM-DD"),
          endDate: allowsRange ? values.dateRange?.[1]?.format("YYYY-MM-DD") : undefined,
        };
        const shared = {
          title: values.title?.trim() || undefined,
          programId: values.programId ?? undefined,
          departmentIds: values.departmentIds ?? [],
          expectedCandidates: values.expectedCandidates ?? undefined,
          ...dates,
        };
        if (editingRecord) {
          if (canEditMain) ({ data } = await updateEvent(editingRecord.id, shared));
          if (canEditTime) {
            ({ data } = await updateEventTime(editingRecord.id, {
              startTime: values.startTime ? values.startTime.format("HH:mm") : null,
              endTime: values.endTime ? values.endTime.format("HH:mm") : null,
            }));
          }
          if (canEditStatus) ({ data } = await updateEventStatus(editingRecord.id, values.status));
        } else {
          ({ data } = await createEvent({
            ...shared,
            examTypeId: values.examTypeId,
            examCategoryId: values.examCategoryId,
            startTime: canEditTime && values.startTime ? values.startTime.format("HH:mm") : undefined,
            endTime: canEditTime && values.endTime ? values.endTime.format("HH:mm") : undefined,
          }));
        }
        onSuccess(data, !!editingRecord);
        return;
      }

      // External/Contract Based — no class/category/papers/session at all,
      // just the exam type (fixed after creation, same as examCategoryId
      // on the academic path) and a date.
      if (isExternalMode) {
        if (editingRecord) {
          if (canEditMain) {
            ({ data } = await updateEvent(editingRecord.id, {
              eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
            }));
          }
          if (canEditStatus) {
            ({ data } = await updateEventStatus(editingRecord.id, values.status));
          }
        } else {
          ({ data } = await createEvent({
            examTypeId: values.examTypeId,
            eventDate: values.eventDate ? values.eventDate.format("YYYY-MM-DD") : undefined,
          }));
        }
        onSuccess(data, !!editingRecord);
        return;
      }

      const allowsDateRange = !!selectedRules.allowsDateRange;
      const payload = {
        coursePaperIds: values.coursePaperIds,
        examTypeId: values.examTypeId,
        sessionId: selectedClass.sessionId,
      };
      if (editingRecord) {
        if (canEditMain) {
          ({ data } = await updateEvent(editingRecord.id, {
            ...payload,
            eventDate: allowsDateRange
              ? values.dateRange?.[0]
                ? values.dateRange[0].format("YYYY-MM-DD")
                : undefined
              : values.eventDate
              ? values.eventDate.format("YYYY-MM-DD")
              : undefined,
            endDate: allowsDateRange && values.dateRange?.[1] ? values.dateRange[1].format("YYYY-MM-DD") : undefined,
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
          examCategoryId: values.examCategoryId,
          eventDate: allowsDateRange
            ? values.dateRange?.[0]
              ? values.dateRange[0].format("YYYY-MM-DD")
              : undefined
            : values.eventDate
            ? values.eventDate.format("YYYY-MM-DD")
            : undefined,
          endDate: allowsDateRange && values.dateRange?.[1] ? values.dateRange[1].format("YYYY-MM-DD") : undefined,
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

  // The capability flags are a property of the (category, scope) pair, and
  // the scope comes from the exam type — so they only resolve once that's
  // picked. Before then the conservative defaults stand in, which is what
  // the fields below already assumed for a not-yet-picked category.
  const selectedScopeId = useMemo(
    () => allExamTypes.find((et) => et.id === selectedExamTypeId)?.examScopeId,
    [allExamTypes, selectedExamTypeId]
  );
  const selectedRules = useMemo(
    () => rulesForPair(pairRules, selectedCategoryId, selectedScopeId),
    [pairRules, selectedCategoryId, selectedScopeId]
  );

  const title = editingRecord ? "Edit Event" : "Add Event";
  // External/Contract Based events have no category and so no time slot,
  // date range, or multi-paper concept at all — a null selectedCategory
  // would otherwise default needsTimeSlot to true (the safe default for the
  // academic path, where a category is always eventually picked).
  const needsTimeSlot = !isExternalMode && selectedRules.needsTimeSlot;
  const allowsDateRange = !isExternalMode && selectedRules.allowsDateRange;
  const allowsMultiplePapers = !isExternalMode && selectedRules.allowsMultiplePapers;

  // Every active category is offered for a standalone exam — there is no
  // class whose curriculum could narrow the list.
  const standaloneCategoryOptions = useMemo(
    () => activeCategories.map((c) => ({ value: c.id, label: c.name })),
    [activeCategories]
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={editingRecord ? "Save" : "Add"}
      okButtonProps={{ disabled: isLocked }}
      confirmLoading={modalLoading}
      destroyOnHidden
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
        {/* Which kind of exam this is. A standalone one is sat by people who
            are not our students, so it takes an entirely different set of
            fields — no class, no papers, no retake. Only offered when at
            least one standalone exam type exists, and only while adding: an
            existing exam's kind is fixed by its own exam type. */}
        {!editingRecord && standaloneExamTypeOptions.length > 0 && (
          <Tabs
            activeKey={formMode}
            onChange={switchFormMode}
            items={[
              { key: "normal", label: "Institutional" },
              { key: "standalone", label: "Standalone" },
            ]}
          />
        )}

        {/* Retake mode only applies to Add, and only to an exam for our own
            students — a standalone exam has no original to retake. */}
        {!editingRecord && !isStandaloneMode && (
          <Form.Item name="isRetake" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox
              onChange={(e) => {
                // The option sets for every downstream dropdown flip meaning
                // entirely (unscheduled vs. already-scheduled) — nothing
                // picked under the old mode is valid under the new one.
                form.setFieldsValue({
                  isRetake: e.target.checked,
                  classId: undefined,
                  examCategoryId: undefined,
                  coursePaperIds: undefined,
                  examTypeId: undefined,
                  eventDate: undefined,
                  dateRange: undefined,
                });
              }}
            >
              Is this a retake?
            </Checkbox>
          </Form.Item>
        )}

        {isExternalMode && showMainFields && (
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="examTypeId"
                label="Exam Type"
                rules={[{ required: true, message: "Please select an exam type." }]}
              >
                <Select
                  className="assignment-select"
                  placeholder="Select exam type"
                  options={nonAcademicExamTypeOptions}
                  disabled={!!editingRecord}
                  showSearch
                  filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="eventDate" label="Date">
                <DatePicker className="assignment-select" style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {isStandaloneMode && showMainFields && (
          <>
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="examTypeId"
                  label="Exam Type"
                  rules={[{ required: true, message: "Please select an exam type." }]}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select exam type"
                    options={standaloneExamTypeOptions}
                    disabled={!!editingRecord}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldValue("examCategoryId", undefined)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="examCategoryId"
                  label="Exam Category"
                  rules={[{ required: true, message: "Please select an exam category." }]}
                  tooltip={infoTip("Decides whether this exam needs a time slot, a venue or equipment, and which colour it takes on the calendar.")}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select exam category"
                    options={standaloneCategoryOptions}
                    disabled={!!editingRecord || !selectedExamTypeId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="programId"
                  label="Program"
                  tooltip={infoTip("Optional. Leave empty if this exam belongs to no program.")}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select program"
                    options={programOptions}
                    allowClear
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="departmentIds"
                  label="Department(s)"
                  tooltip={infoTip("Optional. Also decides who sees this exam under the Department scope filter on the Datesheet.")}
                >
                  <Select
                    mode="multiple"
                    className="assignment-select"
                    placeholder="Select department(s)"
                    options={departmentOptions}
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="title"
                  label="Title"
                  tooltip={infoTip("Goes into the exam's generated name, e.g. Session II.")}
                  rules={[{ max: 150, message: "Maximum 150 characters." }]}
                >
                  <Input placeholder="e.g. Session II" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="expectedCandidates"
                  label="Expected Candidates"
                  tooltip={infoTip("Stands in for class strength: the seat count used when reserving venues.")}
                >
                  <InputNumber min={1} style={{ width: "100%" }} placeholder="e.g. 120" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={24}>
                {allowsDateRange ? (
                  <Form.Item
                    name="dateRange"
                    label="Date Range"
                    tooltip={infoTip("Select the same date twice for a single-day exam.")}
                  >
                    <RangePicker className="assignment-select" style={{ width: "100%" }} format="YYYY-MM-DD" />
                  </Form.Item>
                ) : (
                  <Form.Item name="eventDate" label="Date">
                    <DatePicker className="assignment-select" style={{ width: "100%" }} format="YYYY-MM-DD" />
                  </Form.Item>
                )}
              </Col>
            </Row>
          </>
        )}

        {!isExternalMode && !isStandaloneMode && showMainFields && (
          <>
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  name="classId"
                  label="Class"
                  rules={[{ required: true, message: "Please select a class." }]}
                  tooltip={infoTip(
                    isRetakeChecked && classOptions.length === 0
                      ? "No class has an existing event yet — there's nothing to retake."
                      : "Program, degree level and session all come from the class."
                  )}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select class"
                    options={classOptions}
                    disabled={!!editingRecord}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() =>
                      form.setFieldsValue({ examCategoryId: undefined, coursePaperIds: undefined, examTypeId: undefined })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="examCategoryId"
                  label="Exam Category"
                  rules={[{ required: true, message: "Please select an exam category." }]}
                  tooltip={infoTip(
                    !selectedClassId
                      ? "Select a class first."
                      : categoryOptions.length === 0
                      ? "No exam category is mapped to this class yet — see Exam Category Mapping."
                      : "Only the categories this class's own course/papers are examined under."
                  )}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select exam category"
                    options={categoryOptions}
                    disabled={!!editingRecord || !selectedClassId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldsValue({ coursePaperIds: undefined, examTypeId: undefined })}
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
                  tooltip={infoTip(
                    !selectedCategoryId
                      ? "Select an exam category first."
                      : "Only the exam types this class's course/papers are examinable under."
                  )}
                >
                  <Select
                    className="assignment-select"
                    placeholder="Select exam type"
                    options={examTypeOptions}
                    disabled={!selectedCategoryId}
                    showSearch
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    onChange={() => form.setFieldValue("coursePaperIds", undefined)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="coursePaperIds"
                  label="Course/Paper(s)"
                  rules={[{ required: true, message: "Please select at least one course/paper." }]}
                  tooltip={infoTip(
                    !selectedExamTypeId
                      ? "Select an exam type first."
                      : allowsMultiplePapers
                      ? "One or more course/papers combined into a single occurrence."
                      : "This category takes exactly one course/paper."
                  )}
                >
                  <Select
                    mode="multiple"
                    className="assignment-select"
                    placeholder="Select course/paper(s)"
                    options={coursePaperOptions}
                    disabled={!selectedExamTypeId}
                    maxCount={allowsMultiplePapers ? undefined : 1}
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col span={24}>
                {allowsDateRange ? (
                  <Form.Item
                    name="dateRange"
                    label="Date Range"
                    tooltip={infoTip(
                      isRetakeChecked && retakeDateFloor
                        ? `Must be after the latest original's date: ${retakeDateFloor.format("DD MMM YYYY")}.`
                        : "Select the same date twice for a single-day occurrence."
                    )}
                  >
                    <RangePicker
                      className="assignment-select"
                      style={{ width: "100%" }}
                      format="YYYY-MM-DD"
                      disabledDate={isRetakeChecked && retakeDateFloor ? (date) => !date.isAfter(retakeDateFloor, "day") : undefined}
                    />
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="eventDate"
                    label="Date"
                    tooltip={infoTip(
                      isRetakeChecked && retakeDateFloor
                        ? `Must be after the original event's date: ${retakeDateFloor.format("DD MMM YYYY")}.`
                        : isRetakeChecked && selectedExamTypeId && !retakeDateFloor
                        ? "The original event has no date set yet — set one there first."
                        : undefined
                    )}
                  >
                    <DatePicker
                      className="assignment-select"
                      style={{ width: "100%" }}
                      format="YYYY-MM-DD"
                      disabledDate={isRetakeChecked && retakeDateFloor ? (date) => !date.isAfter(retakeDateFloor, "day") : undefined}
                    />
                  </Form.Item>
                )}
              </Col>
            </Row>
          </>
        )}

        {canEditTime && needsTimeSlot && (
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

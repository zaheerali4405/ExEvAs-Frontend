import { useState, useEffect, useMemo } from "react";
import { Modal, Select, DatePicker, Button, Tag, Typography, Alert, Empty, Checkbox } from "antd";
import { LeftOutlined, RightOutlined, CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getClasses } from "../../api/classesApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { createEvent } from "../../api/eventsApi";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mondayOf(date) {
  const dow = date.day(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  return date.subtract(offset, "day").startOf("day");
}

// Bulk "Add Exams" flow — a scheduler picks one Class + one Exam Type, then
// drags each of that class's Course/Papers (shown as a pool of tags) onto a
// day in a single-week grid to stage its date. Nothing is created until
// Save, which fires the normal create-event call once per staged item and
// reports per-item success/failure (best-effort, not all-or-nothing).
export default function AddExamsModal({ open, existingEvents = [], onCancel, onSuccess, onError }) {
  const { can } = useAuth();
  const canScheduleWeekend = can("event.schedule-weekend");

  const [classes, setClasses] = useState([]);
  const [coursePapers, setCoursePapers] = useState([]);

  const [isRetakeMode, setIsRetakeMode] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const [assignments, setAssignments] = useState([]); // [{ coursePaperId, date }]
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null); // { succeededCount, failed: [{ label, message }] }

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (can("class.read-all")) {
        try { const { data } = await getClasses(); setClasses(data); } catch { /* dropdown stays empty */ }
      }
      if (can("course-paper.read-all")) {
        try { const { data } = await getCoursePapers(); setCoursePapers(data); } catch { /* pool stays empty */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fresh state every time the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setIsRetakeMode(false);
    setSelectedClassId(null);
    setSelectedExamTypeId(null);
    setWeekStart(mondayOf(dayjs()));
    setAssignments([]);
    setResults(null);
  }, [open]);

  // Retake mode flips what every dropdown/pool means (unscheduled vs.
  // already-scheduled) — nothing picked under the old mode is valid under
  // the new one.
  const handleRetakeModeChange = (checked) => {
    setIsRetakeMode(checked);
    setSelectedClassId(null);
    setSelectedExamTypeId(null);
    setAssignments([]);
  };

  // Course/Papers are tied to a specific Class's program+degreeLevel — a
  // class change invalidates any already-staged assignments, and possibly
  // the selected exam type too (it's now scoped to the new class's papers).
  useEffect(() => {
    setAssignments([]);
    setSelectedExamTypeId(null);
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId && c.isActive) ?? null,
    [classes, selectedClassId]
  );

  // Same as Class.fullName, but with the program's short name instead of its
  // full name — keeps the dropdown readable (e.g. "MBBS 1st Year 2025-26").
  const classLabel = (c) =>
    `${c.program?.shortName || c.program?.fullName || ""} ${c.degreeLevel?.fullName || ""} ${c.session?.name || ""}`.replace(/\s+/g, " ").trim();

  // Retake mode only offers classes that already have at least one original
  // (non-retake) event — nothing to retake otherwise.
  const classOptions = useMemo(() => {
    const base = classes.filter((c) => c.isActive);
    const filtered = isRetakeMode
      ? base.filter((c) =>
          existingEvents.some(
            (e) => !e.isRetake && e.programId === c.programId && e.degreeLevelId === c.degreeLevelId && e.sessionId === c.sessionId
          )
        )
      : base;
    return filtered.map((c) => ({ value: c.id, label: classLabel(c) }));
  }, [classes, existingEvents, isRetakeMode]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.coursePaperId)), [assignments]);

  // All active course/papers for the selected class, before the exam-type
  // filter — used both to derive the Exam Type dropdown's options and to
  // give a more specific empty-pool message.
  const classCoursePapers = useMemo(() => {
    if (!selectedClass) return [];
    return coursePapers.filter(
      (c) => c.isActive && c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId
    );
  }, [coursePapers, selectedClass]);

  // Exam types this class already has at least one original (non-retake)
  // event for — the set retake mode narrows the Exam Type dropdown to.
  const classOriginalExamTypeIds = useMemo(() => {
    if (!selectedClass) return new Set();
    const paperIds = new Set(classCoursePapers.map((cp) => cp.id));
    return new Set(
      existingEvents
        .filter((e) => !e.isRetake && e.sessionId === selectedClass.sessionId && paperIds.has(e.coursePaperId))
        .map((e) => e.examTypeId)
    );
  }, [existingEvents, selectedClass, classCoursePapers]);

  // Exam Type is scoped to the selected class — only exam types actually
  // assigned (via CoursePaperExamType) to one of this class's course/papers
  // are offered, not every exam type in the system. Retake mode narrows
  // further to only exam types that already have an original event here.
  const examTypeOptions = useMemo(() => {
    const byId = new Map();
    classCoursePapers.forEach((cp) => {
      (cp.examTypes || []).forEach((link) => {
        const et = link.examType;
        if (et && et.isActive && !byId.has(et.id)) byId.set(et.id, et);
      });
    });
    return Array.from(byId.values())
      .filter((et) => !isRetakeMode || classOriginalExamTypeIds.has(et.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [classCoursePapers, isRetakeMode, classOriginalExamTypeIds]);

  const classExamTypeCoursePapers = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classCoursePapers.filter((c) => (c.examTypes || []).some((link) => link.examTypeId === selectedExamTypeId));
  }, [classCoursePapers, selectedExamTypeId]);

  // Course/papers that already have an original (non-retake) Event for this
  // exact exam type AND session (an Event is unique per coursePaperId+
  // examTypeId+sessionId+isRetake — the same paper's exam recurs every
  // session, so a different session's already-scheduled exam must not block
  // this one) — in normal mode these must never be offered to drag again
  // (the backend would just reject the duplicate at save time); in retake
  // mode this is exactly the set that's eligible to retake.
  const alreadyScheduled = useMemo(() => {
    if (!selectedExamTypeId || !selectedClass) return [];
    return classExamTypeCoursePapers
      .map((cp) => ({
        coursePaper: cp,
        event: existingEvents.find(
          (e) => !e.isRetake && e.coursePaperId === cp.id && e.examTypeId === selectedExamTypeId && e.sessionId === selectedClass.sessionId
        ),
        retake: existingEvents.find(
          (e) => e.isRetake && e.coursePaperId === cp.id && e.examTypeId === selectedExamTypeId && e.sessionId === selectedClass.sessionId
        ),
      }))
      .filter((x) => !!x.event);
  }, [classExamTypeCoursePapers, existingEvents, selectedExamTypeId, selectedClass]);

  const alreadyScheduledIds = useMemo(
    () => new Set(alreadyScheduled.map((x) => x.coursePaper.id)),
    [alreadyScheduled]
  );

  const allAlreadyScheduled = classExamTypeCoursePapers.length > 0 && alreadyScheduled.length === classExamTypeCoursePapers.length;

  // Course/papers eligible for a retake — already have an original, don't
  // already have a retake, and aren't already staged locally.
  const retakeEligibleIds = useMemo(
    () => new Set(alreadyScheduled.filter((x) => !x.retake).map((x) => x.coursePaper.id)),
    [alreadyScheduled]
  );

  const originalDateByCoursePaperId = useMemo(() => {
    const map = new Map();
    alreadyScheduled.forEach((x) => { if (x.event?.eventDate) map.set(x.coursePaper.id, x.event.eventDate); });
    return map;
  }, [alreadyScheduled]);

  const earliestScheduledDate = useMemo(() => {
    const dates = alreadyScheduled.map((x) => x.event.eventDate).filter(Boolean).sort();
    return dates.length ? dayjs(dates[0]) : null;
  }, [alreadyScheduled]);

  // Jump the week grid to wherever the class's already-scheduled (normal
  // mode) or original (retake mode) exams for this exam type are, so the
  // scheduler sees them immediately instead of whatever week happened to be
  // showing before.
  useEffect(() => {
    if (earliestScheduledDate) setWeekStart(mondayOf(earliestScheduledDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedExamTypeId]);

  const pool = useMemo(() => {
    if (isRetakeMode) {
      return classExamTypeCoursePapers.filter((c) => !assignedIds.has(c.id) && retakeEligibleIds.has(c.id));
    }
    return classExamTypeCoursePapers.filter((c) => !assignedIds.has(c.id) && !alreadyScheduledIds.has(c.id));
  }, [isRetakeMode, classExamTypeCoursePapers, assignedIds, alreadyScheduledIds, retakeEligibleIds]);

  const coursePaperById = (id) => coursePapers.find((c) => c.id === id);

  // Same dash-joined format as the calendar's own Event.shortName (see
  // buildEventNames in events.service.ts) — program short form, degree
  // level, course/paper, exam type, session year — so a freshly-dropped
  // course/paper reads identically to an already-scheduled exam.
  const coursePaperShortLabel = (cp) => {
    if (!cp) return "";
    const program = cp.program?.code || cp.program?.shortName || cp.program?.fullName || "";
    const degreeLevel = cp.degreeLevel?.shortName || cp.degreeLevel?.fullName || "";
    const paper = cp.shortName || cp.fullName || "";
    const examTypeLink = (cp.examTypes || []).find((l) => l.examTypeId === selectedExamTypeId);
    const examType = examTypeLink?.examType?.shortName || examTypeLink?.examType?.fullName || "";
    const session = selectedClass?.session?.profYear ?? selectedClass?.session?.name ?? "";
    return [program, degreeLevel, paper, examType, session].filter(Boolean).join("-");
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day")), [weekStart]);

  const isWeekend = (day) => day.day() === 0 || day.day() === 6;
  const canDropOnDay = (day) => !isWeekend(day) || canScheduleWeekend;

  // A retake must land after its own original's date — each dragged
  // course/paper can have a different original date, so this is checked
  // per-item, not once for the whole modal.
  const isValidRetakeDrop = (coursePaperId, day) => {
    if (!isRetakeMode || coursePaperId == null) return true;
    const originalDate = originalDateByCoursePaperId.get(coursePaperId);
    if (!originalDate) return false;
    return day.isAfter(dayjs(originalDate), "day");
  };

  const onDragStartTag = (coursePaperId) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(coursePaperId);
  };

  const onDragOverDay = (day) => (e) => {
    if (!canDropOnDay(day) || !isValidRetakeDrop(draggedId, day)) return;
    e.preventDefault();
    setDragOverKey(day.format("YYYY-MM-DD"));
  };

  const onDragLeaveDay = (day) => () => {
    setDragOverKey((prev) => (prev === day.format("YYYY-MM-DD") ? null : prev));
  };

  const onDropOnDay = (day) => (e) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!canDropOnDay(day) || draggedId == null) return;
    if (!isValidRetakeDrop(draggedId, day)) {
      const originalDate = originalDateByCoursePaperId.get(draggedId);
      onError?.(
        originalDate
          ? `A retake must be scheduled after the original event's date (${dayjs(originalDate).format("DD MMM YYYY")}).`
          : "The original event has no date set yet — set one there before adding a retake."
      );
      setDraggedId(null);
      return;
    }
    setAssignments((prev) => [...prev, { coursePaperId: draggedId, date: day.format("YYYY-MM-DD") }]);
    setDraggedId(null);
  };

  const removeAssignment = (coursePaperId) => {
    setAssignments((prev) => prev.filter((a) => a.coursePaperId !== coursePaperId));
  };

  const assignmentsForDay = (dateStr) => assignments.filter((a) => a.date === dateStr);

  // Exams already on the calendar for a given day — shown for context so the
  // scheduler can see the day is already busy before staging a new one there.
  const existingEventsByDate = useMemo(() => {
    const map = {};
    existingEvents.forEach((e) => {
      if (!e.eventDate) return;
      const key = dayjs(e.eventDate).format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [existingEvents]);

  // Every course/paper that appeared in the pool must be placed on a day
  // before saving is allowed — pool.length === 0 once they all are (it
  // already excludes anything already-scheduled). Retake mode is selective —
  // adding a retake for just one or two papers is fine, no all-or-nothing rule.
  const canSave =
    !!selectedClass && !!selectedExamTypeId && assignments.length > 0 && (isRetakeMode || pool.length === 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setResults(null);
    const succeeded = [];
    const failed = [];
    const createdEvents = [];

    for (const a of assignments) {
      try {
        const { data } = await createEvent({
          coursePaperId: a.coursePaperId,
          examTypeId: selectedExamTypeId,
          sessionId: selectedClass.sessionId,
          eventDate: a.date,
          isRetake: isRetakeMode,
        });
        succeeded.push(a);
        createdEvents.push(data);
      } catch (err) {
        failed.push({
          assignment: a,
          label: coursePaperById(a.coursePaperId)?.fullName ?? `Course/Paper #${a.coursePaperId}`,
          message: err.response?.data?.message || "Could not create this exam.",
        });
      }
    }

    setSaving(false);
    setResults({ succeededCount: succeeded.length, failed });
    setAssignments(failed.map((f) => f.assignment));

    if (createdEvents.length) onSuccess(createdEvents);
    if (failed.length === 0) onCancel();
    else onError?.(`${succeeded.length} exam(s) created, ${failed.length} failed — see details below.`);
  };

  return (
    <Modal
      title="Add Exams"
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      okText="Save"
      okButtonProps={{ disabled: !canSave, loading: saving }}
      width={880}
      centered
      destroyOnClose
    >
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {results && results.failed.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${results.succeededCount} exam(s) created, ${results.failed.length} failed.`}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {results.failed.map((f) => (
                  <li key={f.assignment.coursePaperId}>{f.label}: {f.message}</li>
                ))}
              </ul>
            }
          />
        )}

        <Checkbox checked={isRetakeMode} onChange={(e) => handleRetakeModeChange(e.target.checked)}>
          Is this a retake?
        </Checkbox>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ display: "block", marginBottom: 4 }}>Class</Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Select class"
              options={classOptions}
              value={selectedClassId}
              onChange={setSelectedClassId}
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ display: "block", marginBottom: 4 }}>Exam Type</Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Select exam type"
              options={examTypeOptions}
              value={selectedExamTypeId}
              onChange={setSelectedExamTypeId}
              disabled={!selectedClass}
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            />
            {selectedClass && examTypeOptions.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isRetakeMode
                  ? "None of this class's course/papers have an existing event to retake."
                  : "No exam types are assigned to this class's course/papers."}
              </Text>
            )}
            {!selectedClass && (
              <Text type="secondary" style={{ fontSize: 12 }}>Select a class first.</Text>
            )}
          </div>
        </div>

        {!isRetakeMode && selectedClass && selectedExamTypeId && alreadyScheduled.length > 0 && (
          <Text type="warning" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
            {allAlreadyScheduled
              ? "Exams are already scheduled for the selected class and exam type."
              : `${alreadyScheduled.length} of ${classExamTypeCoursePapers.length} course/paper(s) are already scheduled for the selected class and exam type.`}{" "}
            You can change their dates by drag and drop on the calendar.
          </Text>
        )}

        {/* Once every matching course/paper already has an exam scheduled,
            there's nothing left to drag — skip the pool entirely per the
            Alert above, and go straight to the week grid at its date. */}
        {selectedClass && selectedExamTypeId && (isRetakeMode || !allAlreadyScheduled) && (
          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {isRetakeMode ? "Course/Papers eligible for retake" : "Course/Papers"}{" "}
              <Text type="secondary" style={{ fontWeight: 400 }}>(drag onto a day below)</Text>
            </Text>
            {pool.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {classCoursePapers.length === 0
                  ? "No course/papers found for this class."
                  : classExamTypeCoursePapers.length === 0
                  ? "None of this class's course/papers are assigned this exam type."
                  : isRetakeMode
                  ? "All retake-eligible course/papers already have a retake, or have been placed on the week grid below."
                  : "All matching course/papers have been placed on the week grid."}
              </Text>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {pool.map((c) => (
                    <Tag
                      key={c.id}
                      draggable
                      onDragStart={onDragStartTag(c.id)}
                      style={{ cursor: "grab", padding: "4px 10px", fontSize: 13 }}
                      color="blue"
                    >
                      {c.fullName}
                    </Tag>
                  ))}
                </div>
                {!isRetakeMode && (
                  <Text type="warning" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                    {pool.length} course/paper(s) still need to be scheduled below before you can save.
                  </Text>
                )}
              </>
            )}
          </div>
        )}

        {!selectedClass || !selectedExamTypeId ? (
          <Empty
            description="Select a class and exam type to begin."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: 0 }}
          />
        ) : (
          <>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>Month</Text>
                <DatePicker
                  picker="month"
                  style={{ width: "100%" }}
                  format="MMMM YYYY"
                  value={weekStart}
                  allowClear={false}
                  onChange={(val) => { if (val) setWeekStart(mondayOf(val.startOf("month"))); }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>Week</Text>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  <Button icon={<LeftOutlined />} onClick={() => setWeekStart((w) => w.subtract(7, "day"))} />
                  <div style={{ flex: 1, textAlign: "center", fontWeight: 600, fontSize: 14 }}>
                    {weekStart.format("DD MMM")} – {weekStart.add(6, "day").format("DD MMM YYYY")}
                  </div>
                  <Button icon={<RightOutlined />} onClick={() => setWeekStart((w) => w.add(7, "day"))} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {weekDays.map((day, i) => {
                const dateStr = day.format("YYYY-MM-DD");
                const weekend = isWeekend(day);
                const dropAllowed = canDropOnDay(day);
                const dayAssignments = assignmentsForDay(dateStr);
                const isDragOver = dragOverKey === dateStr;

                const dayExisting = existingEventsByDate[dateStr] || [];

                return (
                  <div
                    key={dateStr}
                    onDragOver={onDragOverDay(day)}
                    onDragLeave={onDragLeaveDay(day)}
                    onDrop={onDropOnDay(day)}
                    style={{
                      minHeight: 110,
                      border: "1px solid #f0f0f0",
                      borderRadius: 6,
                      padding: 6,
                      background: isDragOver ? "#e8f7f4" : weekend ? "#f5f5f5" : "#fff",
                      opacity: !dropAllowed && weekend ? 0.6 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: weekend ? "#8c8c8c" : "#595959",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {WEEKDAY_NAMES[i]}, {day.format("DD MMM")}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {dayExisting.map((ev) => (
                        <div
                          key={ev.id}
                          title={ev.fullName}
                          style={{
                            // No per-exam coloring — same neutral outlined style everywhere.
                            background: "transparent",
                            color: "#262626",
                            border: "1px solid #d9d9d9",
                            fontSize: 10,
                            lineHeight: "16px",
                            borderRadius: 3,
                            padding: "0 6px",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
                          {ev.shortName}
                        </div>
                      ))}

                      {dayAssignments.map((a) => {
                        const cp = coursePaperById(a.coursePaperId);
                        return (
                          <Tag
                            key={a.coursePaperId}
                            color="blue"
                            closeIcon={<CloseOutlined style={{ fontSize: 9 }} />}
                            onClose={() => removeAssignment(a.coursePaperId)}
                            style={{ fontSize: 10, margin: 0, whiteSpace: "normal" }}
                          >
                            {coursePaperShortLabel(cp) || `#${a.coursePaperId}`}
                            {isRetakeMode ? "-RT" : ""}
                          </Tag>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

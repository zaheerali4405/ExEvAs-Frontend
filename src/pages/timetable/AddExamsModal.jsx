import { useState, useEffect, useMemo } from "react";
import { Modal, Select, DatePicker, Button, Tag, Typography, Alert, Empty } from "antd";
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
    setSelectedClassId(null);
    setSelectedExamTypeId(null);
    setWeekStart(mondayOf(dayjs()));
    setAssignments([]);
    setResults(null);
  }, [open]);

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

  const classOptions = useMemo(
    () => classes.filter((c) => c.isActive).map((c) => ({ value: c.id, label: classLabel(c) })),
    [classes]
  );

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

  // Exam Type is scoped to the selected class — only exam types actually
  // assigned (via CoursePaperExamType) to one of this class's course/papers
  // are offered, not every exam type in the system.
  const examTypeOptions = useMemo(() => {
    const byId = new Map();
    classCoursePapers.forEach((cp) => {
      (cp.examTypes || []).forEach((link) => {
        const et = link.examType;
        if (et && et.isActive && !byId.has(et.id)) byId.set(et.id, et);
      });
    });
    return Array.from(byId.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((et) => ({ value: et.id, label: et.fullName }));
  }, [classCoursePapers]);

  const classExamTypeCoursePapers = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classCoursePapers.filter((c) => (c.examTypes || []).some((link) => link.examTypeId === selectedExamTypeId));
  }, [classCoursePapers, selectedExamTypeId]);

  const pool = useMemo(
    () => classExamTypeCoursePapers.filter((c) => !assignedIds.has(c.id)),
    [classExamTypeCoursePapers, assignedIds]
  );

  const coursePaperById = (id) => coursePapers.find((c) => c.id === id);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day")), [weekStart]);

  const isWeekend = (day) => day.day() === 0 || day.day() === 6;
  const canDropOnDay = (day) => !isWeekend(day) || canScheduleWeekend;

  const onDragStartTag = (coursePaperId) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(coursePaperId);
  };

  const onDragOverDay = (day) => (e) => {
    if (!canDropOnDay(day)) return;
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

  const canSave = !!selectedClass && !!selectedExamTypeId && assignments.length > 0;

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
                No exam types are assigned to this class's course/papers.
              </Text>
            )}
            {!selectedClass && (
              <Text type="secondary" style={{ fontSize: 12 }}>Select a class first.</Text>
            )}
          </div>
        </div>

        {selectedClass && selectedExamTypeId && (
          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Course/Papers <Text type="secondary" style={{ fontWeight: 400 }}>(drag onto a day below)</Text>
            </Text>
            {pool.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {classCoursePapers.length === 0
                  ? "No course/papers found for this class."
                  : classExamTypeCoursePapers.length === 0
                  ? "None of this class's course/papers are assigned this exam type."
                  : "All matching course/papers have been placed on the week grid."}
              </Text>
            ) : (
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
                            {cp?.shortName || cp?.fullName || `#${a.coursePaperId}`}
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

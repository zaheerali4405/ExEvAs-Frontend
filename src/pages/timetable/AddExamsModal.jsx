import { useState, useEffect, useMemo, useRef } from "react";
import { Modal, Select, DatePicker, Button, Tag, Typography, Alert, Checkbox } from "antd";
import { LeftOutlined, RightOutlined, CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getClasses } from "../../api/classesApi";
import { getCoursePapers } from "../../api/coursePapersApi";
import { createEvent } from "../../api/eventsApi";
import { getExamCategories } from "../../api/examCategoriesApi";
import { getExamCategoryColors } from "../../api/examCategoryColorsApi";
import { getExamCategoryRules } from "../../api/examCategoryRulesApi";
import { rulesForPair, anyScopeAllows } from "../../utils/examRules";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// One color per lane/category, cycled by position — stable for a given
// mapped-categories list (sorted the same way every render).
const CATEGORY_PALETTE = [
  { bg: "#e6f4ff", border: "#1677ff" },
  { bg: "#fff0f6", border: "#eb2f96" },
  { bg: "#f6ffed", border: "#52c41a" },
  { bg: "#fff7e6", border: "#fa8c16" },
  { bg: "#f9f0ff", border: "#722ed1" },
  { bg: "#e6fffb", border: "#13a8a8" },
  { bg: "#fffbe6", border: "#d4b106" },
  { bg: "#fff1f0", border: "#f5222d" },
];

function mondayOf(date) {
  const dow = date.day(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  return date.subtract(offset, "day").startOf("day");
}

let idCounter = 0;
const nextLocalId = () => `local-${++idCounter}`;

// Bulk "Add Exams" flow — a scheduler picks one Class + one Exam Type, and
// every exam category mapped to that class's curriculum shows as its own
// lane underneath, each with its own pool of eligible course/papers (already
// scoped by exam type, retake mode, and per-category scheduling history).
//
// A lane whose category allows combining (allowsMultiplePapers) lets papers
// be dragged onto one another to build a combined stack, which then drags
// onto a day as one occurrence. A lane whose category allows a date range
// (allowsDateRange) renders its dropped occurrences as a resizable bar
// spanning the days it covers. Separately, a lane whose category allows
// splitting into several batches (allowsDateSplit) never removes a dropped
// paper/stack from its pool — it's expected to be scheduled again for
// another batch/round — while a category without it is used up after one
// drop, same as Theory always was.
//
// Nothing is created until Save, which fires the normal create-event call
// once per staged occurrence and reports per-item success/failure
// (best-effort, not all-or-nothing).
export default function AddExamsModal({ open, existingEvents = [], onCancel, onSuccess, onError }) {
  const { can } = useAuth();
  const canScheduleWeekend = can("event.schedule-weekend");

  const [classes, setClasses] = useState([]);
  const [coursePapers, setCoursePapers] = useState([]);
  const [examCategories, setExamCategories] = useState([]);
  const [pairColors, setPairColors] = useState([]);
  const [pairRules, setPairRules] = useState([]);

  const [isRetakeMode, setIsRetakeMode] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  // { [categoryId]: [{ id, coursePaperIds: number[] }] } — the pool's current
  // grouping (one group per paper until the scheduler combines some).
  const [groupsByCategory, setGroupsByCategory] = useState({});
  // [{ id, categoryId, coursePaperIds, startDate, endDate }]
  const [assignments, setAssignments] = useState([]);
  // Either a pool group being placed ({ kind: "group", categoryId, groupId })
  // or an already-staged single-date block being moved to another day
  // ({ kind: "assignment", categoryId, assignmentId }).
  const [dragged, setDragged] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null); // { succeededCount, failed: [{ label, message }] }

  const weekGridRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (can("class.read-all")) {
        try { const { data } = await getClasses(); setClasses(data); } catch { /* dropdown stays empty */ }
      }
      if (can("course-paper.read-all")) {
        try { const { data } = await getCoursePapers(); setCoursePapers(data); } catch { /* pool stays empty */ }
      }
      try {
        const [categoriesRes, colorsRes, rulesRes] = await Promise.all([
          getExamCategories(), getExamCategoryColors(), getExamCategoryRules(),
        ]);
        setExamCategories(categoriesRes.data);
        setPairColors(colorsRes.data);
        setPairRules(rulesRes.data);
      } catch { /* lanes stay empty */ }
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
    setGroupsByCategory({});
    setAssignments([]);
    setResults(null);
  }, [open]);

  const handleRetakeModeChange = (checked) => {
    setIsRetakeMode(checked);
    setSelectedClassId(null);
    setSelectedExamTypeId(null);
  };

  useEffect(() => {
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

  const classCoursePapers = useMemo(() => {
    if (!selectedClass) return [];
    return coursePapers.filter(
      (c) => c.isActive && c.programId === selectedClass.programId && c.degreeLevelId === selectedClass.degreeLevelId
    );
  }, [coursePapers, selectedClass]);

  // A lane exists for any category at least one of this class's own
  // course/papers is examined under — the union, not a curriculum-wide
  // declaration. Each lane's own pool is then narrowed to just the papers
  // carrying that category (see eligiblePapersForCategory), so a lane never
  // offers a paper that isn't examined that way. Narrowed in retake mode to
  // categories that allow retakes and already have at least one original
  // here. Sorted the same way ExamCategoriesService does, so lane colors
  // stay stable.
  const mappedCategories = useMemo(() => {
    if (!selectedClass) return [];
    const mappedIds = new Set();
    classCoursePapers.forEach((cp) =>
      (cp.examCategories || []).forEach((link) => mappedIds.add(link.examCategoryId))
    );
    const base = examCategories.filter((c) => c.isActive && mappedIds.has(c.id));
    const filtered = isRetakeMode
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
    return filtered.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }, [examCategories, classCoursePapers, existingEvents, selectedClass, isRetakeMode, pairRules]);

  // Exam types assigned (via CoursePaperExamType) to any of this class's
  // course/papers — retake mode narrows to exam types that already have an
  // original event, under any mapped category, for this class.
  const classOriginalExamTypeIds = useMemo(() => {
    if (!selectedClass) return new Set();
    const paperIds = new Set(classCoursePapers.map((cp) => cp.id));
    const mappedCategoryIds = new Set(mappedCategories.map((c) => c.id));
    return new Set(
      existingEvents
        .filter(
          (e) =>
            !e.isRetake &&
            mappedCategoryIds.has(e.examCategoryId) &&
            e.sessionId === selectedClass.sessionId &&
            (e.coursePapers || []).some((cp) => paperIds.has(cp.coursePaperId))
        )
        .map((e) => e.examTypeId)
    );
  }, [existingEvents, selectedClass, classCoursePapers, mappedCategories]);

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

  // Per-paper original/retake history for one category — used both to build
  // each lane's eligible pool and to find a retake's date floor.
  const historyForCategory = (categoryId, coursePaperId) => {
    if (!selectedClass || !selectedExamTypeId) return { originals: [], retakes: [] };
    const entries = existingEvents.filter(
      (e) =>
        e.examCategoryId === categoryId &&
        e.examTypeId === selectedExamTypeId &&
        e.sessionId === selectedClass.sessionId &&
        (e.coursePapers || []).some((p) => p.coursePaperId === coursePaperId)
    );
    return { originals: entries.filter((e) => !e.isRetake), retakes: entries.filter((e) => e.isRetake) };
  };

  // A category's eligible papers for the current class+exam type+retake
  // mode. Normal mode: a split-batch category never excludes an already-
  // scheduled paper (repeated original batches are expected); a category
  // without that excludes one that already has a non-retake original.
  // Retake mode: only papers with an original and no retake yet.
  const eligiblePapersForCategory = (category) =>
    classExamTypeCoursePapers.filter((cp) => {
      if (!(cp.examCategories || []).some((link) => link.examCategoryId === category.id)) return false;
      const { originals, retakes } = historyForCategory(category.id, cp.id);
      if (isRetakeMode) return originals.length > 0 && retakes.length === 0;
      return rulesFor(category.id).allowsDateSplit || originals.length === 0;
    });

  // Latest original batch's own end (or start) date, across every paper in
  // a group — the floor a retake must clear. Returns null if any paper has
  // no original date set yet.
  const retakeFloorForGroup = (categoryId, coursePaperIds) => {
    let floor = null;
    for (const cpId of coursePaperIds) {
      const { originals } = historyForCategory(categoryId, cpId);
      let paperFloor = null;
      originals.forEach((o) => {
        const end = o.endDate ?? o.eventDate;
        if (end && (!paperFloor || dayjs(end).isAfter(paperFloor))) paperFloor = dayjs(end);
      });
      if (!paperFloor) return null;
      if (!floor || paperFloor.isAfter(floor)) floor = paperFloor;
    }
    return floor;
  };

  // Rebuild every lane's groups (one per eligible paper) whenever the
  // class/exam type/retake mode changes — same reset moment the old single-
  // pool version cleared its staged assignments on.
  useEffect(() => {
    if (!selectedClass || !selectedExamTypeId) {
      setGroupsByCategory({});
      setAssignments([]);
      return;
    }
    const next = {};
    mappedCategories.forEach((category) => {
      next[category.id] = eligiblePapersForCategory(category).map((cp) => ({ id: nextLocalId(), coursePaperIds: [cp.id] }));
    });
    setGroupsByCategory(next);
    setAssignments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedExamTypeId, isRetakeMode]);

  // The week grid opens on the running week and stays there until the
  // scheduler moves it. It used to jump to the week of the class's earliest
  // existing exam once a class and exam type were picked, which moved the
  // grid out from under someone who had already paged to the week they
  // wanted.

  const coursePaperById = (id) => coursePapers.find((c) => c.id === id);

  // Joined short names for a group's papers, e.g. "ENT" or "ENT | EYE".
  const groupLabel = (coursePaperIds) =>
    coursePaperIds.map((id) => coursePaperById(id)?.shortName || coursePaperById(id)?.fullName || `#${id}`).join(" | ");

  // Integration is a property of the course/paper — an integrated paper
  // examines several subjects in one paper, a non-integrated one covers
  // exactly one. Each lane keeps the two kinds in separate rows so a
  // scheduler can tell them apart at a glance. A combined group counts as
  // integrated the moment any of its papers is, since the occurrence it
  // becomes then spans more than one subject either way.
  const groupIsIntegrated = (group) =>
    group.coursePaperIds.some((id) => coursePaperById(id)?.isIntegrated);

  // Integrated first, and a row with nothing in it is dropped rather than
  // shown empty.
  const laneSections = (groups) =>
    [
      { key: "integrated", label: "Integrated", items: groups.filter((g) => groupIsIntegrated(g)) },
      { key: "nonIntegrated", label: "Non-Integrated", items: groups.filter((g) => !groupIsIntegrated(g)) },
    ].filter((section) => section.items.length > 0);

  // The exam type object itself (examTypeOptions only carries {value,label})
  // — needed for its own shortName, same as previewShortName below needs it.
  const selectedExamType = useMemo(() => {
    for (const cp of classExamTypeCoursePapers) {
      const link = (cp.examTypes || []).find((l) => l.examTypeId === selectedExamTypeId);
      if (link?.examType) return link.examType;
    }
    return null;
  }, [classExamTypeCoursePapers, selectedExamTypeId]);

  // A lane is colored with the same (category × exam scope) pair its events
  // will actually be drawn with once created — the scope comes from the exam
  // type being scheduled, so switching exam type can recolor the lanes. The
  // cycled palette is only a fallback for a pair that has no colors set.
  // Rules for one category under the exam type being scheduled. Class and
  // Exam Type are both chosen before any lane renders, so the scope — and
  // therefore the pair — is always known by the time this is read.
  const rulesFor = (categoryId) =>
    rulesForPair(pairRules, categoryId, selectedExamType?.examScopeId);

  const categoryColor = useMemo(() => {
    const map = new Map();
    const scopeId = selectedExamType?.examScopeId;
    mappedCategories.forEach((c, i) => {
      const row = scopeId
        ? pairColors.find((p) => p.examCategoryId === c.id && p.examScopeId === scopeId)
        : null;
      const fallback = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
      map.set(c.id, {
        bg: row?.backgroundColor || fallback.bg,
        text: row?.textColor || "#262626",
        border: row?.borderColor || fallback.border,
      });
    });
    return map;
  }, [mappedCategories, pairColors, selectedExamType]);

  // Mirrors buildEventNames' shortName format in events.service.ts exactly,
  // so a staged single-date assignment previews under the same name it will
  // actually get once saved (e.g. "D-Y4-OD-PASU-2026-Theory").
  const previewShortName = (category, coursePaperIds) => {
    if (!selectedClass || !selectedExamType) return groupLabel(coursePaperIds);
    const { program, degreeLevel, session } = selectedClass;
    const papersShort = coursePaperIds
      .map((id) => coursePaperById(id)?.shortName || coursePaperById(id)?.fullName || `#${id}`)
      .join("+");
    let shortName = [
      program?.code || program?.shortName || program?.fullName || "",
      degreeLevel?.shortName || degreeLevel?.fullName || "",
      papersShort,
      selectedExamType.shortName || selectedExamType.fullName,
      session?.profYear ?? "",
      category?.shortName || category?.name || "",
    ].join("-");
    if (isRetakeMode) shortName += "-RT";
    return shortName;
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day")), [weekStart]);
  const dayIndexOf = (dateStr) => weekDays.findIndex((d) => d.format("YYYY-MM-DD") === dateStr);

  const isWeekend = (day) => day.day() === 0 || day.day() === 6;
  const canDropOnDay = (day) => !isWeekend(day) || canScheduleWeekend;

  // ── Combining (drag one pool tag onto another, same category) ──────────
  const onDragStartGroup = (categoryId, groupId) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
    setDragged({ kind: "group", categoryId, groupId });
  };

  // Moving a block that's already been staged. Only single-date blocks are
  // draggable — which end of a date-range bar a drop would move is
  // ambiguous, so a bar is resized by its grips instead.
  const onDragStartAssignment = (assignment) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
    setDragged({ kind: "assignment", categoryId: assignment.categoryId, assignmentId: assignment.id });
  };

  const mergeGroups = (categoryId, sourceGroupId, targetGroupId) => {
    setGroupsByCategory((prev) => {
      const list = prev[categoryId] || [];
      const source = list.find((g) => g.id === sourceGroupId);
      const target = list.find((g) => g.id === targetGroupId);
      if (!source || !target || source.id === target.id) return prev;
      const merged = { id: target.id, coursePaperIds: [...target.coursePaperIds, ...source.coursePaperIds] };
      return { ...prev, [categoryId]: [...list.filter((g) => g.id !== source.id && g.id !== target.id), merged] };
    });
  };

  const splitPaperFromGroup = (categoryId, groupId, coursePaperId) => {
    setGroupsByCategory((prev) => {
      const list = prev[categoryId] || [];
      const group = list.find((g) => g.id === groupId);
      if (!group || group.coursePaperIds.length <= 1) return prev;
      const remaining = { id: group.id, coursePaperIds: group.coursePaperIds.filter((id) => id !== coursePaperId) };
      const split = { id: nextLocalId(), coursePaperIds: [coursePaperId] };
      return { ...prev, [categoryId]: [...list.filter((g) => g.id !== group.id), remaining, split] };
    });
  };

  const onDropOnGroupTag = (category, targetGroupId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragged || dragged.kind !== "group") return;
    if (!rulesFor(category.id).allowsMultiplePapers) return;
    if (dragged.categoryId !== category.id) return; // combining only within the same lane
    mergeGroups(category.id, dragged.groupId, targetGroupId);
    setDragged(null);
  };

  // ── Dropping a group onto a day ──────────────────────────────────────
  const onDragOverDay = (day) => (e) => {
    if (!dragged || !canDropOnDay(day)) return;
    e.preventDefault();
    setDragOverKey(day.format("YYYY-MM-DD"));
  };

  const onDragLeaveDay = (day) => () => {
    setDragOverKey((prev) => (prev === day.format("YYYY-MM-DD") ? null : prev));
  };

  // Shared by both drop kinds — a moved block has to clear the same retake
  // floor as a newly placed one.
  const retakeDropRefused = (categoryId, coursePaperIds, day) => {
    if (!isRetakeMode) return false;
    const floor = retakeFloorForGroup(categoryId, coursePaperIds);
    if (!floor) {
      onError?.("The original event has no date set yet — set one there before adding a retake.");
      return true;
    }
    if (!day.isAfter(floor, "day")) {
      onError?.(`A retake must be scheduled after the original event's date (${floor.format("DD MMM YYYY")}).`);
      return true;
    }
    return false;
  };

  const onDropOnDay = (day) => (e) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!dragged || !canDropOnDay(day)) return;
    const dateStr = day.format("YYYY-MM-DD");

    // Re-dating a block already staged on another day. Start and end both
    // move to the dropped day, since only single-date blocks are draggable.
    if (dragged.kind === "assignment") {
      const moving = assignments.find((a) => a.id === dragged.assignmentId);
      setDragged(null);
      if (!moving || moving.startDate === dateStr) return;
      if (retakeDropRefused(moving.categoryId, moving.coursePaperIds, day)) return;
      setAssignments((prev) =>
        prev.map((a) => (a.id === moving.id ? { ...a, startDate: dateStr, endDate: dateStr } : a))
      );
      return;
    }

    const category = mappedCategories.find((c) => c.id === dragged.categoryId);
    const group = (groupsByCategory[dragged.categoryId] || []).find((g) => g.id === dragged.groupId);
    setDragged(null);
    if (!category || !group) return;

    if (retakeDropRefused(category.id, group.coursePaperIds, day)) return;

    setAssignments((prev) => [
      ...prev,
      { id: nextLocalId(), categoryId: category.id, coursePaperIds: group.coursePaperIds, startDate: dateStr, endDate: dateStr },
    ]);
    // A split-batch category is expected to repeat across several separate
    // batches for the same paper(s) — leave the group in the pool so it can
    // be dropped again. A category without that can't repeat, so it's used up.
    if (!rulesFor(category.id).allowsDateSplit) {
      setGroupsByCategory((prev) => ({ ...prev, [category.id]: (prev[category.id] || []).filter((g) => g.id !== group.id) }));
    }
  };

  const removeAssignment = (assignmentId) => {
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    // Give the paper(s) back to the pool as individual groups — the
    // scheduler can re-combine them if they want the same stack again.
    setGroupsByCategory((prev) => {
      const list = prev[assignment.categoryId] || [];
      const alreadyThere = new Set(list.flatMap((g) => g.coursePaperIds));
      const toRestore = assignment.coursePaperIds.filter((id) => !alreadyThere.has(id));
      if (toRestore.length === 0) return prev;
      return { ...prev, [assignment.categoryId]: [...list, ...toRestore.map((id) => ({ id: nextLocalId(), coursePaperIds: [id] }))] };
    });
  };

  // ── Resizing a date-range assignment's bar (left/right handles) ───────
  // Constrained to the currently visible week — dragging a handle past its
  // edge simply stops at that edge, it doesn't page to another week.
  const startResize = (assignmentId, edge) => (downEvent) => {
    downEvent.preventDefault();
    downEvent.stopPropagation();
    const gridEl = weekGridRef.current;
    if (!gridEl) return;
    const colWidth = gridEl.getBoundingClientRect().width / 7;
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    const startIdx0 = dayIndexOf(assignment.startDate);
    const endIdx0 = dayIndexOf(assignment.endDate);
    if (startIdx0 === -1 || endIdx0 === -1) return;
    const startX = downEvent.clientX;
    setResizingId(assignmentId);

    const onMove = (moveEvent) => {
      const deltaDays = Math.round((moveEvent.clientX - startX) / colWidth);
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          if (edge === "left") {
            const newIdx = Math.min(Math.max(startIdx0 + deltaDays, 0), endIdx0);
            return { ...a, startDate: weekDays[newIdx].format("YYYY-MM-DD") };
          }
          const newIdx = Math.max(Math.min(endIdx0 + deltaDays, 6), startIdx0);
          return { ...a, endDate: weekDays[newIdx].format("YYYY-MM-DD") };
        })
      );
    };
    const onUp = () => {
      setResizingId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Already-scheduled single-day exams, by day — shown for context so the
  // scheduler can see the day is already busy before staging a new one
  // there. A multi-day exam is not here: it draws as a bar, below.
  const existingEventsByDate = useMemo(() => {
    const map = {};
    existingEvents.forEach((e) => {
      if (!e.eventDate) return;
      const start = dayjs(e.eventDate).startOf("day");
      const end = e.rules?.allowsDateRange && e.endDate ? dayjs(e.endDate).startOf("day") : start;
      if (end.isAfter(start, "day")) return;
      const key = start.format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [existingEvents]);

  // Staged single-date blocks for one day. A date-range occurrence never
  // appears here — it draws as a bar, below.
  const singleAssignmentsForDay = (dateStr) =>
    assignments.filter((a) => {
      const category = mappedCategories.find((c) => c.id === a.categoryId);
      if (category && rulesFor(category.id).allowsDateRange) return false;
      return a.startDate === dateStr;
    });

  // Every bar shown across the visible week: an already-scheduled multi-day
  // exam, or a staged date-range occurrence. Both are packed into horizontal
  // lanes exactly as the calendar's month view does it — each run takes the
  // lowest lane free for every day it covers, so a run keeps one vertical
  // slot all the way across and two runs sharing a day can never land on
  // each other's line. An already-scheduled run is clamped to the week;
  // a staged one can't leave it in the first place, since both dropping and
  // resizing are confined to the visible week.
  const weekBarLanes = useMemo(() => {
    const bars = [];

    existingEvents.forEach((ev) => {
      if (!ev.eventDate) return;
      const start = dayjs(ev.eventDate).startOf("day");
      const end = ev.rules?.allowsDateRange && ev.endDate ? dayjs(ev.endDate).startOf("day") : start;
      if (!end.isAfter(start, "day")) return;
      // Looked up in the week itself rather than by date arithmetic, so a
      // DST boundary can't shift a segment by a day.
      const startIdx = start.isBefore(weekDays[0], "day") ? 0 : weekDays.findIndex((d) => d.isSame(start, "day"));
      const endIdx = end.isAfter(weekDays[6], "day") ? 6 : weekDays.findIndex((d) => d.isSame(end, "day"));
      if (startIdx === -1 || endIdx === -1) return;
      bars.push({ key: `event-${ev.id}`, kind: "existing", ev, start, end, startIdx, endIdx });
    });

    assignments.forEach((a) => {
      const category = mappedCategories.find((c) => c.id === a.categoryId);
      if (!category || !rulesFor(category.id).allowsDateRange) return;
      const startIdx = dayIndexOf(a.startDate);
      const endIdx = dayIndexOf(a.endDate);
      if (startIdx === -1 || endIdx === -1) return;
      bars.push({ key: `staged-${a.id}`, kind: "staged", assignment: a, category, startIdx, endIdx });
    });

    // Earliest first, then longest, so the runs covering the most days
    // settle into the top lanes and short ones fill in beneath. Staged bars
    // sort after already-scheduled ones on a tie, keeping what's being built
    // now closest to the bottom of the cell.
    bars.sort(
      (a, b) =>
        a.startIdx - b.startIdx ||
        (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx) ||
        (a.kind === b.kind ? 0 : a.kind === "existing" ? -1 : 1) ||
        a.key.localeCompare(b.key)
    );

    const lanes = [];
    bars.forEach((bar) => {
      let laneIdx = lanes.findIndex((lane) =>
        lane.every((other) => bar.endIdx < other.startIdx || bar.startIdx > other.endIdx)
      );
      if (laneIdx === -1) {
        lanes.push([]);
        laneIdx = lanes.length - 1;
      }
      lanes[laneIdx].push(bar);
      bar.lane = laneIdx;
    });

    return { laneCount: lanes.length, bars };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEvents, assignments, mappedCategories, pairRules, selectedExamType, weekDays]);

  // One lane slot per bar line, null where that lane has nothing on this day
  // — the empty slots are what keep every bar on a straight line.
  const dayBarLanes = (dateStr) => {
    const dayIdx = dayIndexOf(dateStr);
    const slots = Array.from({ length: weekBarLanes.laneCount }, () => null);
    if (dayIdx === -1) return slots;
    weekBarLanes.bars.forEach((bar) => {
      if (dayIdx < bar.startIdx || dayIdx > bar.endIdx) return;
      slots[bar.lane] = {
        ...bar,
        isStart: dayIdx === bar.startIdx,
        isEnd: dayIdx === bar.endIdx,
        // For an already-scheduled run clamped to this week, the rounded cap
        // belongs to the real range end, not to the week's edge.
        isRangeStart: bar.kind === "existing" ? weekDays[dayIdx].isSame(bar.start, "day") : dayIdx === bar.startIdx,
        isRangeEnd: bar.kind === "existing" ? weekDays[dayIdx].isSame(bar.end, "day") : dayIdx === bar.endIdx,
        // Day span of this week's run — the opening segment's label lays out
        // across the whole bar rather than just its own cell.
        runDays: bar.endIdx - bar.startIdx + 1,
      };
    });
    return slots;
  };

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
          examCategoryId: a.categoryId,
          coursePaperIds: a.coursePaperIds,
          examTypeId: selectedExamTypeId,
          sessionId: selectedClass.sessionId,
          eventDate: a.startDate,
          endDate: a.startDate !== a.endDate ? a.endDate : undefined,
          isRetake: isRetakeMode,
        });
        succeeded.push(a);
        createdEvents.push(data);
      } catch (err) {
        failed.push({
          assignment: a,
          label: groupLabel(a.coursePaperIds) || `Assignment #${a.id}`,
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
      width={1180}
      centered
      destroyOnHidden
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
                  <li key={f.assignment.id}>{f.label}: {f.message}</li>
                ))}
              </ul>
            }
          />
        )}

        {/* CSS Grid (not flex) so the Exam Type column's helper text — which
            only sometimes renders — lives in its own grid row and never
            grows that column's box, which would otherwise pull its select
            out of line with Class's and the checkbox's (a shared flex row
            bottom-aligns to whichever column is tallest). */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 16, alignItems: "end" }}>
          <div>
            <div style={{ height: 22 }} />
            <Checkbox checked={isRetakeMode} onChange={(e) => handleRetakeModeChange(e.target.checked)}>
              Is this Retake?
            </Checkbox>
          </div>
          <div>
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
          <div>
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
          </div>

          <div />
          <div />
          <div>
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

        {selectedClass && selectedExamTypeId && mappedCategories.length === 0 && (
          <Alert type="info" showIcon message="No exam category is mapped to this class yet — see Exam Category Mapping." />
        )}

        {selectedClass && selectedExamTypeId && mappedCategories.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mappedCategories.map((category) => {
              const color = categoryColor.get(category.id);
              const groups = groupsByCategory[category.id] || [];
              return (
                <div key={category.id}>
                  <Text strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color.border, display: "inline-block" }} />
                    <span title={category.name}>{category.shortName || category.name}</span>
                  </Text>
                  {groups.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {classExamTypeCoursePapers.length === 0
                        ? "None of this class's course/papers are assigned this exam type."
                        : isRetakeMode
                        ? "Nothing eligible for retake, or everything eligible has already been placed below."
                        : "Everything for this category has already been placed below."}
                    </Text>
                  ) : (
                    (() => {
                      const sections = laneSections(groups);
                      const paperTags = (items) => (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
                          {items.map((group) => (
                            <Tag
                              key={group.id}
                              draggable
                              onDragStart={onDragStartGroup(category.id, group.id)}
                              onDragOver={(e) => { if (rulesFor(category.id).allowsMultiplePapers) e.preventDefault(); }}
                              onDrop={onDropOnGroupTag(category, group.id)}
                              style={{
                                cursor: "grab",
                                padding: "5px 10px",
                                fontSize: 13,
                                background: color.bg,
                                color: color.text,
                                borderColor: color.border,
                              }}
                            >
                              {group.coursePaperIds.length === 1 ? (
                                groupLabel(group.coursePaperIds)
                              ) : (
                                group.coursePaperIds.map((cpId, i) => (
                                  <span key={cpId}>
                                    {i > 0 && " | "}
                                    {coursePaperById(cpId)?.shortName || coursePaperById(cpId)?.fullName || `#${cpId}`}
                                    <CloseOutlined
                                      style={{ fontSize: 9, marginLeft: 3, cursor: "pointer" }}
                                      onClick={(e) => { e.stopPropagation(); splitPaperFromGroup(category.id, group.id, cpId); }}
                                    />
                                  </span>
                                ))
                              )}
                            </Tag>
                          ))}
                        </div>
                      );

                      // Only one kind present: no sub-heading at all, the
                      // papers sit straight under the lane's own name.
                      if (sections.length === 1) return paperTags(sections[0].items);

                      // Both kinds: side by side in equal halves, Integrated
                      // first, each headed by its own label. Equal halves
                      // rather than content-sized so the divider lands in the
                      // same place in every category's lane.
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          {sections.map((section, i) => (
                            <div
                              key={section.key}
                              style={{
                                minWidth: 0,
                                borderLeft: i === 0 ? "none" : "1px solid #f0f0f0",
                                paddingLeft: i === 0 ? 0 : 12,
                              }}
                            >
                              <Text
                                type="secondary"
                                style={{ display: "block", fontSize: 11, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}
                              >
                                {section.label}
                              </Text>
                              {paperTags(section.items)}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* The week row is always here, opened on the running week, so the
            calendar reads as context from the moment the modal opens rather
            than appearing only once a class and exam type are picked. With
            nothing selected it still shows what is already scheduled. */}
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

            {/* gap:0 + a -1px left margin on every cell but the first collapses
                adjacent 1px borders into one shared line — needed so a
                spanning assignment's bar can bleed across that seam and read
                as continuous instead of doubled. */}
            <div ref={weekGridRef} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
              {weekDays.map((day, i) => {
                const dateStr = day.format("YYYY-MM-DD");
                const weekend = isWeekend(day);
                const dropAllowed = canDropOnDay(day);
                // Bottom-anchoring + border-bleed is only for a bar — a
                // single-date block (e.g. Theory) renders inline like any
                // other event, right where it naturally falls.
                const singleAssignments = singleAssignmentsForDay(dateStr);
                const barLanes = dayBarLanes(dateStr);
                const isDragOver = dragOverKey === dateStr;
                const cellBg = isDragOver ? "#e8f7f4" : weekend ? "#f5f5f5" : "#fff";

                const dayExisting = existingEventsByDate[dateStr] || [];

                return (
                  <div
                    key={dateStr}
                    onDragOver={onDragOverDay(day)}
                    onDragLeave={onDragLeaveDay(day)}
                    onDrop={onDropOnDay(day)}
                    style={{
                      minHeight: 190,
                      // Without this a wide label sets the grid track's
                      // automatic minimum and the seven columns stop being
                      // equal — names are trimmed instead, as on the
                      // calendar's own month grid.
                      minWidth: 0,
                      marginLeft: i === 0 ? 0 : -1,
                      border: "1px solid #000",
                      padding: 8,
                      background: cellBg,
                      opacity: !dropAllowed && weekend ? 0.6 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: weekend ? "#8c8c8c" : "#595959",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {WEEKDAY_NAMES[i]}, {day.format("DD MMM")}
                    </div>

                    {/* Existing events and single-date staged assignments
                        stay right below the header, in normal flow — a
                        single-date category's box (e.g. Theory) has always
                        rendered here. Date-range assignments alone live in a
                        separate block pinned to the bottom (marginTop: auto)
                        — since every cell in this single CSS-Grid row
                        stretches to the tallest cell's height, that bottom
                        edge lines up across all 7 days regardless of how
                        much existing content sits above it in any one of
                        them, so a busy day's layout is never disturbed. */}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {dayExisting.map((ev) => (
                          <div
                            key={ev.id}
                            title={ev.fullName}
                            style={{
                              background: ev.colors?.backgroundColor || "#f0f0f0",
                              color: ev.colors?.textColor || "#262626",
                              border: `1px solid ${ev.colors?.borderColor || "#bfbfbf"}`,
                              fontSize: 11,
                              lineHeight: "18px",
                              borderRadius: 3,
                              padding: "0 6px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                            }}
                          >
                            {ev.shortName}
                          </div>
                        ))}

                        {singleAssignments.map((a) => {
                          const category = mappedCategories.find((c) => c.id === a.categoryId);
                          const color = categoryColor.get(a.categoryId) || CATEGORY_PALETTE[0];
                          return (
                            <div
                              key={a.id}
                              // A staged block can be moved to another day by
                              // dragging it, same gesture as placing it from
                              // the pool. Nothing is written until Save, so
                              // this only re-dates the staged occurrence.
                              draggable
                              onDragStart={onDragStartAssignment(a)}
                              title="Drag to another day to change its date"
                              style={{
                                display: "flex",
                                alignItems: "stretch",
                                fontSize: 11,
                                lineHeight: "18px",
                                background: color.bg,
                                color: color.text,
                                border: `1px solid ${color.border}`,
                                borderRadius: 3,
                                minWidth: 0,
                                overflow: "hidden",
                                cursor: "grab",
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0, padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden" }}>
                                {previewShortName(category, a.coursePaperIds)}
                              </div>
                              <CloseOutlined
                                style={{ fontSize: 9, alignSelf: "center", marginRight: 4, cursor: "pointer" }}
                                onClick={() => removeAssignment(a.id)}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Bars — already-scheduled multi-day exams and staged
                          date-range occurrences alike — pinned to the bottom
                          of every cell, one slot per lane in the same order
                          in every cell of the week. Two runs sharing a day
                          therefore sit on separate lines, and a lane with
                          nothing on this day holds an empty spacer exactly
                          one bar high so the bars either side stay on one
                          straight line. */}
                      {barLanes.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
                          {barLanes.map((bar, laneIdx) => {
                            if (!bar) return <div key={`lane-${laneIdx}`} style={{ height: 20, flexShrink: 0 }} />;

                            const color =
                              bar.kind === "existing"
                                ? {
                                    bg: bar.ev.colors?.backgroundColor || "#f0f0f0",
                                    text: bar.ev.colors?.textColor || "#262626",
                                    border: bar.ev.colors?.borderColor || "#bfbfbf",
                                  }
                                : categoryColor.get(bar.assignment.categoryId) || CATEGORY_PALETTE[0];
                            // This segment bleeds into whichever neighboring
                            // cell(s) it continues into — losing its
                            // border/radius on that side and overlapping the
                            // shared cell border by exactly padding+border
                            // (8+1px) — so the same-colored segments in adjacent
                            // cells visually fuse into one continuous bar
                            // instead of reading as separate same-label tags.
                            // position:relative + a z-index lifts it above the
                            // next cell's own (later-painted, non-positioned)
                            // background/border at that seam.
                            const bleedLeft = !bar.isStart;
                            const bleedRight = !bar.isEnd;
                            const frame = {
                              position: "relative",
                              // The opening segment paints above the
                              // continuation ones so its label — which
                              // overflows into them — isn't covered by
                              // their background.
                              zIndex: bar.isStart ? 2 : 1,
                              overflow: bar.isStart ? "visible" : "hidden",
                              display: "flex",
                              alignItems: "stretch",
                              fontSize: 11,
                              lineHeight: "18px",
                              // Explicit height: now that the name is drawn
                              // once, a middle segment carries no content at
                              // all and would collapse to nothing — the bar's
                              // background would vanish mid-run and leave the
                              // label sitting on bare cell. 20 = the 18px
                              // line box the labelled segment works out to
                              // plus its two borders (box-sizing is
                              // border-box), so every segment is the same
                              // height and the seams don't step.
                              minHeight: 20,
                              // A palette color can carry an alpha channel, so
                              // the tint is painted over an opaque copy of the
                              // cell's own background — otherwise the cell
                              // border the bar bleeds across shows through it.
                              backgroundColor: cellBg,
                              backgroundImage: `linear-gradient(${color.bg}, ${color.bg})`,
                              color: color.text,
                              borderTop: `1px solid ${color.border}`,
                              borderBottom: `1px solid ${color.border}`,
                              borderLeft: bleedLeft ? "none" : `1px solid ${color.border}`,
                              borderRight: bleedRight ? "none" : `1px solid ${color.border}`,
                              borderTopLeftRadius: bar.isRangeStart ? 3 : 0,
                              borderBottomLeftRadius: bar.isRangeStart ? 3 : 0,
                              borderTopRightRadius: bar.isRangeEnd ? 3 : 0,
                              borderBottomRightRadius: bar.isRangeEnd ? 3 : 0,
                              marginLeft: bleedLeft ? -9 : 0,
                              marginRight: bleedRight ? -9 : 0,
                            };

                            // Already scheduled: read-only, no grips and no
                            // remove ✕ — it isn't part of what Save creates.
                            if (bar.kind === "existing") {
                              return (
                                <div key={bar.key} title={bar.ev.fullName} style={frame}>
                                  <div style={{ flex: 1, minWidth: 0, display: "flex", padding: bar.isStart ? "0 6px" : 0 }}>
                                    {bar.isStart && (
                                      <span
                                        style={{
                                          flexShrink: 0,
                                          maxWidth: `calc(${bar.runDays} * 100% + ${(bar.runDays - 1) * 13}px)`,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                        }}
                                      >
                                        {bar.ev.shortName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            const a = bar.assignment;
                            const category = bar.category;
                            return (
                              <div
                                key={bar.key}
                                style={{ ...frame, opacity: resizingId === a.id ? 0.8 : 1 }}
                              >
                                {bar.isStart && (
                                  <div
                                    onMouseDown={startResize(a.id, "left")}
                                    title="Drag to change the start date"
                                    style={{ width: 6, cursor: "ew-resize", borderRight: `2px solid ${color.border}` }}
                                  />
                                )}
                                {/* Drawn once, on the segment that opens the
                                    run — a continuation is a bare bar. Given the
                                    bar's full width to lay out in, and the same
                                    full preview name the single-date blocks use
                                    rather than just the paper labels. */}
                                <div style={{ flex: 1, minWidth: 0, display: "flex", padding: bar.isStart ? "0 6px" : 0 }}>
                                  {bar.isStart && (
                                    <span
                                      style={{
                                        // A flex item sized from its content, so
                                        // it can grow past this one cell and run
                                        // along the bar. As a block it would just
                                        // fill the cell and clip there instead.
                                        // Capped with maxWidth rather than width:
                                        // a definite width contributes to the
                                        // cell's min-content and pushes the grid
                                        // columns out of alignment.
                                        flexShrink: 0,
                                        // Bounded to the bar's real length. 100%
                                        // here is this wrapper's content box —
                                        // the opening cell minus its padding and
                                        // the left resize grip — so each extra
                                        // day adds back that 27px on top of its
                                        // own 100%, and 26px is held at the far
                                        // end for the remove ✕ and right grip.
                                        maxWidth: `calc(${bar.runDays} * 100% + ${(bar.runDays - 1) * 27}px - 26px)`,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {previewShortName(category, a.coursePaperIds)}
                                    </span>
                                  )}
                                </div>
                                {bar.isEnd && (
                                  <CloseOutlined
                                    style={{ fontSize: 9, alignSelf: "center", marginRight: 4, cursor: "pointer", position: "relative", zIndex: 3 }}
                                    onClick={() => removeAssignment(a.id)}
                                  />
                                )}
                                {bar.isEnd && (
                                  <div
                                    onMouseDown={startResize(a.id, "right")}
                                    title="Drag to change the end date"
                                    style={{ width: 6, cursor: "ew-resize", borderLeft: `2px solid ${color.border}`, position: "relative", zIndex: 3 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
      </div>
    </Modal>
  );
}

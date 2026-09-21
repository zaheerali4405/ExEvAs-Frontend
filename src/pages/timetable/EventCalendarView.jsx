import { useState, useEffect, useMemo, useRef } from "react";
import {
  Button, Alert, Typography, Spin, Empty, Modal, Tag, Segmented, Table, Space,
  Select, InputNumber, Form, Tooltip, DatePicker, TimePicker, Dropdown, Switch, Input, Badge,
} from "antd";
import {
  LeftOutlined, RightOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined,
  DoubleLeftOutlined, DoubleRightOutlined, SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getEvents, getEvent, updateEvent, updateEventTime } from "../../api/eventsApi";
import {
  getEventVenues, assignEventVenue, updateEventVenue, unassignEventVenue, getEventVenueAvailability,
} from "../../api/eventVenuesApi";
import {
  getEventEquipment, assignEventEquipment, updateEventEquipment, unassignEventEquipment, getEventEquipmentAvailability,
} from "../../api/eventEquipmentApi";
import {
  getEventStaff, assignEventStaff, updateEventStaff, unassignEventStaff, getEventStaffDutyLimits,
} from "../../api/eventStaffApi";
import { getEventDepartments } from "../../api/eventDepartmentsApi";
import { getVenues } from "../../api/venuesApi";
import { getEquipment } from "../../api/equipmentApi";
import { getEmployees } from "../../api/employeesApi";
import { getDepartments } from "../../api/departmentsApi";
import { getSessions } from "../../api/sessionsApi";
import { useAuth } from "../../context/AuthContext";
import EventFormModal from "../events/EventFormModal";
import AddExamsModal from "./AddExamsModal";
import VenueAllocationModal from "./VenueAllocationModal";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const VIEW_OPTIONS = [
  { label: "Year", value: "year" },
  { label: "Month", value: "month" },
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_LABELS = {
  hold:        "Hold",
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const STATUS_TAG_COLORS = {
  hold:        "default",
  scheduled:   "processing",
  in_progress: "warning",
  completed:   "success",
  cancelled:   "error",
};

const DUTY_TYPE_OPTIONS = [
  { value: "superintendent",        label: "Superintendent" },
  { value: "deputy_superintendent", label: "Deputy Superintendent" },
  { value: "invigilator",           label: "Invigilator" },
  { value: "nomes_admin",           label: "NOMES Admin" },
  { value: "facilitator",           label: "Facilitator" },
  { value: "water_man",             label: "Water Man" },
  { value: "janitorial",            label: "Janitorial" },
];
const DUTY_TYPE_LABELS = Object.fromEntries(DUTY_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const employeeLabel = (e) =>
  `${e.firstName}${e.lastName ? ` ${e.lastName}` : ""} (${e.department?.name ?? "—"})`;

// A normal event.update/-time/-status/event-*.assign/unassign holder can
// only act on today's or future-dated events — a past event requires
// event.update-past. An event with no date yet is never "past".
const isPastEvent = (ev) => !!ev?.eventDate && dayjs(ev.eventDate).isBefore(dayjs().startOf("day"), "day");

// Same as Event.fullName, but with the program and the exam category
// abbreviated to their short names — reads cleaner as a modal title than the
// fully spelled-out versions. Joins every combined course/paper (a category
// with allowsMultiplePapers may have more than one).
const detailsModalTitle = (ev) => {
  if (!ev) return undefined;
  const program = ev.program?.shortName || ev.program?.fullName || "";
  const category = ev.examCategory?.shortName || ev.examCategory?.name || "";
  const papers = (ev.coursePapers || []).map((cp) => cp.coursePaper?.fullName).filter(Boolean).join(", ");
  const base = [program, ev.degreeLevel?.fullName, papers, ev.examType?.fullName, ev.session?.name, category]
    .filter(Boolean)
    .join(" ");
  return ev.isRetake ? `${base} RT` : base;
};

const DAY_ROW_HEIGHT = 56; // px per hour in Day/Week views

// A shade darker than the #f0f0f0 used elsewhere, so the month grid reads
// as a grid without the lines competing with the event blocks inside it.
const MONTH_CELL_BORDER = "#d9d9d9";

const WEEKDAY_FULL_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Day and Week views both use half-hour gridlines/labels at half the row
// height (28px per 30 min = 56px per hour) — event positioning math is
// unaffected, since it's still computed off DAY_ROW_HEIGHT per hour.
const HALF_HOUR_HEIGHT = DAY_ROW_HEIGHT / 2;
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i); // i*30 minutes

// Background, text and border all come from the event's own (category ×
// exam scope) pair, resolved server-side into event.colors — the same
// Theory paper is colored differently sat as an Internal exam than as a
// Professional one. Every block uses the same solid border regardless of
// category shape (timed vs date-only, combinable, etc.) — that's conveyed
// inside the event's own details, not by varying the border style here.
function examBlockStyle(ev) {
  const colors = ev?.colors;
  return {
    background: colors?.backgroundColor || "#f0f0f0",
    color: colors?.textColor || "#262626",
    border: `1px solid ${colors?.borderColor || "#bfbfbf"}`,
  };
}

// A small swatch at the start of every event block, carrying the event's
// program's own color — a second color identity alongside the block's own
// category-based background/border, so a program is recognizable at a
// glance without opening the event.
function ProgramColorTag({ ev }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        flexShrink: 0,
        borderRadius: 3,
        // Separates the square from a block whose own background may be a
        // near shade of the same color.
        border: "1px solid #fff",
        background: ev?.program?.color || "#d9d9d9",
      }}
    />
  );
}

// A single date for a single-date category, or a range (or just the start,
// if no end is set yet) for a date-range one.
const eventDateRangeLabel = (ev) => {
  if (!ev.eventDate) return "Not set";
  const start = dayjs(ev.eventDate).format("DD MMM YYYY");
  if (!ev.rules?.allowsDateRange || !ev.endDate) return start;
  const end = dayjs(ev.endDate).format("DD MMM YYYY");
  return end !== start ? `${start} – ${end}` : start;
};

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Lays out a day's events into overlap groups, assigning each event a column
// index + column count within its group so simultaneous events render side
// by side rather than stacked on top of each other.
function layoutDayEvents(dayEvents) {
  const withTimes = dayEvents
    .map((e) => ({ ...e, startMin: timeToMinutes(e.startTime), endMin: timeToMinutes(e.endTime) }))
    .sort((a, b) => a.startMin - b.startMin);

  const groups = [];
  let currentGroup = [];
  let groupEnd = -1;
  withTimes.forEach((e) => {
    if (currentGroup.length === 0 || e.startMin < groupEnd) {
      currentGroup.push(e);
      groupEnd = Math.max(groupEnd, e.endMin);
    } else {
      groups.push(currentGroup);
      currentGroup = [e];
      groupEnd = e.endMin;
    }
  });
  if (currentGroup.length) groups.push(currentGroup);

  const positioned = [];
  groups.forEach((group) => {
    const columnEndTimes = [];
    const withCols = group.map((e) => {
      let colIndex = columnEndTimes.findIndex((endTime) => endTime <= e.startMin);
      if (colIndex === -1) {
        colIndex = columnEndTimes.length;
        columnEndTimes.push(e.endMin);
      } else {
        columnEndTimes[colIndex] = e.endMin;
      }
      return { ...e, colIndex };
    });
    const totalCols = columnEndTimes.length;
    withCols.forEach((e) => positioned.push({ ...e, totalCols }));
  });
  return positioned;
}

// Same Monday-anchoring as AddExamsModal's mondayOf — Week view starts weeks
// on Monday, consistent with the Month grid below.
function mondayOf(date) {
  const dow = date.day(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  return date.subtract(offset, "day").startOf("day");
}

// "17 – 23 Aug 2026", or "28 Aug – 3 Sep 2026" / "29 Dec 2026 – 4 Jan 2027"
// when the week crosses a month or year boundary.
function weekRangeLabel(weekStart) {
  const weekEnd = weekStart.add(6, "day");
  if (weekStart.year() !== weekEnd.year()) {
    return `${weekStart.format("D MMM YYYY")} – ${weekEnd.format("D MMM YYYY")}`;
  }
  if (weekStart.month() !== weekEnd.month()) {
    return `${weekStart.format("D MMM")} – ${weekEnd.format("D MMM YYYY")}`;
  }
  return `${weekStart.format("D")} – ${weekEnd.format("D MMM YYYY")}`;
}

// Monday-start week grid covering the full month, padded to complete weeks.
function buildMonthGrid(monthStart) {
  const startWeekday = monthStart.day(); // 0=Sun..6=Sat
  const leading = (startWeekday + 6) % 7; // offset to Monday-start
  const gridStart = monthStart.subtract(leading, "day");

  const monthEnd = monthStart.endOf("month");
  const endWeekday = monthEnd.day();
  const trailing = (7 - ((endWeekday + 6) % 7) - 1) % 7;
  const gridEnd = monthEnd.add(trailing, "day");

  const totalDays = gridEnd.diff(gridStart, "day") + 1;
  const days = Array.from({ length: totalDays }, (_, i) => gridStart.add(i, "day"));

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// Calendar shell for the Datesheet page. Event is Exam-only now — Moderation
// Meeting was split into its own table/List page (see
// [[project_moderation_meeting_split]] memory) — so this no longer scopes by
// category, it just shows every Event.
export default function EventCalendarView({ bulkAddEnabled = false }) {
  const { can, user } = useAuth();
  const canReschedule = can("event.update");
  const canEditEventTime = can("event.update-time");
  const canViewVenues = can("event-venue.read-all");
  const canAssignVenues = can("event-venue.assign");
  const canUnassignVenues = can("event-venue.unassign");
  const canViewEquipment = can("event-equipment.read-all");
  const canAssignEquipment = can("event-equipment.assign");
  const canUnassignEquipment = can("event-equipment.unassign");
  const canViewStaff = can("event-staff.read-all");
  const canAssignStaff = can("event-staff.assign");
  const canUnassignStaff = can("event-staff.unassign");
  const canViewDepartments = can("event-department.read-all");
  const canEditPastEvents = can("event.update-past");
  // The Holding Area is a scheduler's worklist, so it's hidden outright for
  // roles that have no business acting on the backlog. Reassignable from the
  // Role Permissions page without a code change.
  const canViewHoldingArea = can("event.read-holding");
  // Whether the viewer can act on any resource at all — decides whether the
  // details modal shows the table+form assignment UI (useful for someone who
  // manages resources) or a plain, friendly read-only summary (everyone
  // else, e.g. Faculty just checking an upcoming exam in their department).
  const canManageResources =
    canAssignVenues || canUnassignVenues || canAssignEquipment || canUnassignEquipment || canAssignStaff || canUnassignStaff;

  const [viewMode, setViewMode] = useState("month");
  const [allEvents, setAllEvents] = useState([]);
  // Sessions are only needed to know which one is current — the jump target
  // for a backwards search is scoped to it, so an old session's Block-I
  // doesn't drag the calendar years into the past.
  const [sessions, setSessions] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  // Draft lives in the panel; nothing narrows the calendar until Apply.
  const [draftPairs, setDraftPairs] = useState([]);
  const [draftExamTypeIds, setDraftExamTypeIds] = useState([]);
  const [draftIncludePast, setDraftIncludePast] = useState(false);
  // "all" | "department" | "institute" — how far the view reaches from the
  // signed-in user. Applies the moment it changes, like the text box and
  // unlike the dropdowns: it's a single click with nothing to complete, and
  // it's the control you flick between while watching the calendar.
  const [scope, setScope] = useState("all");
  // { pairs, examTypeIds, includePast } once applied, else null for "no filter".
  const [appliedFilter, setAppliedFilter] = useState(null);
  // Refines the applied result set live, without its own Apply.
  const [searchText, setSearchText] = useState("");
  // A date to bring into view once Month view has rendered it.
  const [pendingScrollDate, setPendingScrollDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf("month"));
  const [currentYear, setCurrentYear] = useState(() => dayjs().startOf("year"));
  const [currentWeekStart, setCurrentWeekStart] = useState(() => mondayOf(dayjs()));
  const [currentDay, setCurrentDay] = useState(() => dayjs().startOf("day"));
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [detailsEvent, setDetailsEvent] = useState(null);
  const [detailsResources, setDetailsResources] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reschedulingId, setReschedulingId] = useState(null);

  // Assignment option lists (venues/equipment/employees/departments to pick
  // from) — fetched lazily once, on first Details-modal open, same as
  // EventResourcesPage.jsx.
  const [allVenues, setAllVenues] = useState([]);
  const [allEquipment, setAllEquipment] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [assignOptionsLoaded, setAssignOptionsLoaded] = useState(false);

  // The Date/Time row — same single-row inline-edit pattern as Venue below.
  // Date and Time are separately permission-gated (event.update vs
  // event.update-time, the SRDD's Scheduler(dates)/Scheduler(time) split,
  // same as EventFormModal.jsx) — whichever of the two the viewer lacks
  // just stays read-only text inside the same editable row.
  const [dateTimeEditing, setDateTimeEditing] = useState(false);
  const [dateDraft, setDateDraft] = useState(null);
  // Only used for a date-range category (allowsDateRange) — a single-date
  // category's Date cell stays a plain DatePicker using dateDraft alone.
  const [endDateDraft, setEndDateDraft] = useState(null);
  const [startTimeDraft, setStartTimeDraft] = useState(null);
  const [endTimeDraft, setEndTimeDraft] = useState(null);
  const [dateTimeSaving, setDateTimeSaving] = useState(false);

  // Venue is a single inline-editable row. A pair whose rules allow multiple
  // venues can hold more than one, but only the first is surfaced here — the
  // Event Resources page is where a second one is added. venueEditing
  // toggles the row between its read-only
  // display and an editable one (Select + inputs); a brand-new, not-yet-
  // assigned venue starts the row in edit mode automatically.
  const [venueEditing, setVenueEditing] = useState(false);
  const [venueDraftVenueId, setVenueDraftVenueId] = useState(null);
  const [venueDraftSeats, setVenueDraftSeats] = useState(null);
  const [venueAvailability, setVenueAvailability] = useState(null);
  const [venueAvailabilityLoading, setVenueAvailabilityLoading] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [removingVenueId, setRemovingVenueId] = useState(null);

  // Equipment supports any number of rows — equipmentEditingKey is either
  // 'new' (an unsaved row being added), an existing EventEquipment id (that
  // row being edited), or null (nothing being edited). Only one row is
  // editable at a time.
  const [equipmentEditingKey, setEquipmentEditingKey] = useState(null);
  const [equipmentDraftEquipmentId, setEquipmentDraftEquipmentId] = useState(null);
  const [equipmentDraftQuantity, setEquipmentDraftQuantity] = useState(null);
  const [equipmentAvailabilityMap, setEquipmentAvailabilityMap] = useState({});
  const [equipmentAvailabilityLoadingId, setEquipmentAvailabilityLoadingId] = useState(null);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [removingEquipmentId, setRemovingEquipmentId] = useState(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedDutyType, setSelectedDutyType] = useState(null);
  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff assign form below
  const [assigningStaff, setAssigningStaff] = useState(false);
  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff table below
  const [removingStaffEmployeeId, setRemovingStaffEmployeeId] = useState(null);
  const [editingStaffRow, setEditingStaffRow] = useState(null);
  const [staffModalLoading, setStaffModalLoading] = useState(false);
  const [staffForm] = Form.useForm();
  // Per-duty-type min/max (from the event's exam type's ExamTypeDutyRule
  // rows) and how many are currently assigned — min is advisory only
  // (shown here), max is what the backend actually blocks against.
  const [dutyLimits, setDutyLimits] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDate, setAddModalDate] = useState(null);
  const [bulkAddModalOpen, setBulkAddModalOpen] = useState(false);
  const [venueAllocationDate, setVenueAllocationDate] = useState(null);
  // Month view needs the width for its day grid, so both the Holding
  // Area and the app sidebar start collapsed there (see the effect below
  // and DashboardLayout's collapseSidebar). Every other view opens with
  // the Holding Area showing, as before.
  const [holdingAreaOpen, setHoldingAreaOpen] = useState(false);
  const dayGridRef = useRef(null);
  const weekGridRef = useRef(null);
  const monthGridRef = useRef(null);
  // Month cells are square: their height tracks their own width, which is a
  // seventh of the grid. Measured rather than hardcoded so it stays square
  // as the window resizes or the sidebar/Holding Area is toggled. Used as a
  // minimum, so a day with more events than fit still grows its week row.
  const [monthCellSize, setMonthCellSize] = useState(0);

  useEffect(() => {
    if (viewMode !== "month") return;
    const el = monthGridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = (width) => setMonthCellSize(Math.max(Math.floor(width / 7), 110));
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, loading]);

  // Collapse on entering month view, open on leaving it. Switching views is
  // the only thing that moves it — a manual toggle while staying on the
  // same view is left alone.
  useEffect(() => {
    setHoldingAreaOpen(viewMode !== "month");
  }, [viewMode]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: eventsData } = await getEvents();
        setAllEvents(eventsData);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events.");
      } finally {
        setLoading(false);
      }

      // Only used to identify the current session for a backwards search;
      // a failure just drops that narrowing rather than breaking search.
      if (can("session.read-all")) {
        try {
          const { data } = await getSessions();
          setSessions(data);
        } catch {
          // Non-fatal — the jump then considers every session's past events.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter options come from the events themselves rather than from the
  // lookup tables: an option that would match nothing is no use in a search,
  // and this needs no extra requests.
  // The two narrowings /auth/me resolves for the signed-in user: their own
  // department plus everything under it, and every department of the
  // institute that department belongs to. Both empty for anyone with no
  // Employee record (a student, say), who has nothing to narrow to.
  const departmentScopeIds = useMemo(
    () => new Set(user?.departmentScopeIds || []),
    [user]
  );
  const instituteScopeIds = useMemo(
    () => new Set(user?.instituteScopeDepartmentIds || []),
    [user]
  );
  const hasOwnDepartment = departmentScopeIds.size > 0;

  const pairKeyOf = (e) => `${e.programId}-${e.degreeLevelId}`;

  const pairOptions = useMemo(() => {
    const byKey = new Map();
    allEvents.forEach((e) => {
      if (!e.programId || !e.degreeLevelId) return;
      const key = pairKeyOf(e);
      if (byKey.has(key)) return;
      const label = `${e.program?.shortName || e.program?.fullName || ""} ${e.degreeLevel?.fullName || ""}`.trim();
      byKey.set(key, label);
    });
    return Array.from(byKey, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [allEvents]);

  // Narrowed by whatever is picked in the first dropdown, so the exam types
  // on offer are the ones those classes actually sit.
  const examTypeOptions = useMemo(() => {
    const byId = new Map();
    allEvents.forEach((e) => {
      if (draftPairs.length > 0 && !draftPairs.includes(pairKeyOf(e))) return;
      if (e.examType) byId.set(e.examType.id, e.examType.fullName);
    });
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [allEvents, draftPairs]);

  // A picked exam type that the current class selection no longer offers
  // would silently filter everything out, so it's dropped from the draft.
  useEffect(() => {
    setDraftExamTypeIds((prev) => {
      const allowed = new Set(examTypeOptions.map((o) => o.value));
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [examTypeOptions]);

  const matchesFilter = (e, filter) => {
    if (filter.pairs.length > 0 && !filter.pairs.includes(pairKeyOf(e))) return false;
    if (filter.examTypeIds.length > 0 && !filter.examTypeIds.includes(e.examTypeId)) return false;
    return true;
  };

  // Scope is checked apart from the applied filter because it takes effect
  // on its own, with or without one. An event's departments are derived from
  // its course/papers' subjects, so this reads as "taught by ..." — matching
  // any single one is enough, since a combined paper can span several.
  const withinScope = (e) => {
    if (scope === "all" || !hasOwnDepartment) return true;
    const reach = scope === "institute" ? instituteScopeIds : departmentScopeIds;
    return (e.eventDepartments || []).some((d) => reach.has(d.departmentId));
  };

  // "Search Previous" widens the range rather than replacing it: off, only
  // today onwards; on, past events are included too. Either way an applied
  // filter hides everything that doesn't match. An undated event has no date
  // to judge, so the range never excludes one — that's the Holding Area's
  // whole population.
  const filteredEvents = useMemo(() => {
    let list = allEvents.filter(withinScope);
    if (appliedFilter) {
      const today = dayjs().startOf("day");
      list = list.filter((e) => {
        if (!matchesFilter(e, appliedFilter)) return false;
        if (!appliedFilter.includePast && e.eventDate) {
          const end = e.endDate || e.eventDate;
          if (dayjs(end).isBefore(today, "day")) return false;
        }
        return true;
      });
    }
    const term = searchText.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (e) =>
          (e.shortName || "").toLowerCase().includes(term) ||
          (e.fullName || "").toLowerCase().includes(term)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appliedFilter, searchText, scope, hasOwnDepartment, departmentScopeIds, instituteScopeIds]);

  const filterActive = !!appliedFilter || searchText.trim() !== "" || scope !== "all";
  const events = filteredEvents;

  const canCreateHere = can("event.create") || can("event.create-departmental");


  // Where Apply should take the calendar. Off: the next occurrence from today
  // onwards. On: the earliest PAST one, but only within the current session —
  // otherwise an old session's Block-I would drag the view years back. Falls
  // through to the upcoming target when there's no past match to land on.
  const jumpTargetFor = (filter) => {
    const dated = allEvents.filter(
      (e) => e.eventDate && matchesFilter(e, filter) && withinScope(e)
    );
    if (dated.length === 0) return null;
    const today = dayjs().startOf("day");
    const earliest = (list) =>
      list.reduce((best, e) => (!best || dayjs(e.eventDate).isBefore(dayjs(best.eventDate)) ? e : best), null);

    if (filter.includePast) {
      const currentSessionIds = new Set(
        sessions.filter((x) => x.isCurrent).map((x) => x.id)
      );
      const past = dated.filter(
        (e) =>
          dayjs(e.eventDate).isBefore(today, "day") &&
          (currentSessionIds.size === 0 || currentSessionIds.has(e.sessionId))
      );
      if (past.length > 0) return earliest(past).eventDate;
    }
    const upcoming = dated.filter((e) => !dayjs(e.eventDate).isBefore(today, "day"));
    if (upcoming.length > 0) return earliest(upcoming).eventDate;
    return earliest(dated).eventDate;
  };

  const applySearchFilter = () => {
    const next = {
      pairs: draftPairs,
      examTypeIds: draftExamTypeIds,
      includePast: draftIncludePast,
    };
    setAppliedFilter(next);
    setSearchOpen(false);

    const target = jumpTargetFor(next);
    if (target) {
      // Month view is the one that scrolls to a week row, so Apply lands
      // there regardless of which view was open.
      setViewMode("month");
      setCurrentMonth(dayjs(target).startOf("month"));
      setPendingScrollDate(dayjs(target).format("YYYY-MM-DD"));
    }
  };

  const clearSearchFilter = () => {
    setDraftPairs([]);
    setDraftExamTypeIds([]);
    setDraftIncludePast(false);
    setScope("all");
    setAppliedFilter(null);
    setSearchText("");
  };

  // Brings the target week into view once Month view has actually rendered
  // the cell — the month has to change first, so this can't run inline.
  useEffect(() => {
    if (!pendingScrollDate || viewMode !== "month" || loading) return;
    const el = monthGridRef.current?.querySelector(`[data-date="${pendingScrollDate}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setPendingScrollDate(null);
  }, [pendingScrollDate, viewMode, currentMonth, loading, monthCellSize]);

  // Holding Area holds every event still in Hold status — a Hold event with a
  // full date/time also appears on the calendar below (rendered the same as
  // any other event — status is visually differentiated separately, not by
  // fading it out) simultaneously, until time + all three resource types get
  // it to Scheduled. Events with no date yet always stay in the Holding
  // Area — only a dated event that's already in the past drops off.
  const holdEvents = useMemo(
    () => {
      const today = dayjs().startOf("day");
      return events
        .filter((e) => e.status === "hold" && (!e.eventDate || !dayjs(e.eventDate).isBefore(today, "day")))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
    [events]
  );

  // Any event with a date shows here regardless of status or whether time is
  // set yet — Month view's day box doesn't need a time slot to place it in.
  // Every status renders the same way for now (isHold below only feeds the
  // tooltip) — a color scheme to tell statuses apart is still to come.
  // A date-range category (allowsDateRange, e.g. OSPE/OSCE) shows on every
  // day it spans, not just its start date.
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!e.eventDate) return;
      const start = dayjs(e.eventDate).startOf("day");
      const end = e.rules?.allowsDateRange && e.endDate ? dayjs(e.endDate).startOf("day") : start;
      let cursor = start;
      let days = 0;
      // Guard against an absurdly wide range looping forever.
      while (!cursor.isAfter(end) && days < 60) {
        const key = cursor.format("YYYY-MM-DD");
        if (!map[key]) map[key] = [];
        map[key].push(e);
        cursor = cursor.add(1, "day");
        days += 1;
      }
    });
    return map;
  }, [events]);

  const weeks = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  // Multi-day runs packed into horizontal lanes, one week row at a time.
  // Each run takes the lowest lane free for every day it covers, so a run
  // occupies the same vertical slot in every day box it crosses and its
  // per-day segments line up into one straight bar. Every cell then renders
  // one slot per lane, an unused slot as a transparent spacer.
  //
  // Without this each cell stacked only its own segments, bottom-anchored,
  // in event order — so the moment two runs shared a day the slots stopped
  // agreeing between neighbouring cells and a bar either stepped vertically
  // or left a stray-looking stub where a neighbour's run sat.
  //
  // A run is cut at the week boundary: a range crossing Sunday/Monday
  // becomes one bar per week row, each labelled at its own left edge,
  // rather than one unlabelled continuation row.
  const spanningLanesByWeek = useMemo(() => {
    const byWeek = new Map();
    weeks.forEach((week) => {
      const runsById = new Map();
      week.forEach((day) => {
        (eventsByDate[day.format("YYYY-MM-DD")] || []).forEach((ev) => {
          if (runsById.has(ev.id)) return;
          const start = dayjs(ev.eventDate).startOf("day");
          const end = ev.rules?.allowsDateRange && ev.endDate ? dayjs(ev.endDate).startOf("day") : start;
          if (!end.isAfter(start, "day")) return;
          // Indexes are looked up in the week itself rather than by date
          // arithmetic, so a DST boundary can't shift a segment by a day.
          const startIdx = start.isBefore(week[0], "day") ? 0 : week.findIndex((d) => d.isSame(start, "day"));
          const endIdx = end.isAfter(week[6], "day") ? 6 : week.findIndex((d) => d.isSame(end, "day"));
          if (startIdx === -1 || endIdx === -1) return;
          runsById.set(ev.id, { ev, start, end, startIdx, endIdx });
        });
      });

      // Earliest first, then longest, so the runs that cover the most days
      // settle into the top lanes and the short ones fill in beneath.
      const runs = [...runsById.values()].sort(
        (a, b) =>
          a.startIdx - b.startIdx ||
          (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx) ||
          a.start.valueOf() - b.start.valueOf() ||
          a.ev.id - b.ev.id
      );

      const lanes = [];
      runs.forEach((run) => {
        let laneIdx = lanes.findIndex((lane) =>
          lane.every((other) => run.endIdx < other.startIdx || run.startIdx > other.endIdx)
        );
        if (laneIdx === -1) {
          lanes.push([]);
          laneIdx = lanes.length - 1;
        }
        lanes[laneIdx].push(run);
        run.lane = laneIdx;
      });

      byWeek.set(week[0].format("YYYY-MM-DD"), { laneCount: lanes.length, runs });
    });
    return byWeek;
  }, [weeks, eventsByDate]);

  // One day cell's content: the events belonging to that day alone, and one
  // lane slot per multi-day run in the week — null where that lane has
  // nothing on this day.
  const monthCellEvents = (day, week) => {
    const dateStr = day.format("YYYY-MM-DD");
    const single = (eventsByDate[dateStr] || []).filter((ev) => {
      const start = dayjs(ev.eventDate).startOf("day");
      const end = ev.rules?.allowsDateRange && ev.endDate ? dayjs(ev.endDate).startOf("day") : start;
      return !end.isAfter(start, "day");
    });

    const { laneCount = 0, runs = [] } = spanningLanesByWeek.get(week[0].format("YYYY-MM-DD")) || {};
    const dayIdx = week.findIndex((d) => d.isSame(day, "day"));
    const lanes = Array.from({ length: laneCount }, () => null);
    if (dayIdx !== -1) {
      runs.forEach((run) => {
        if (dayIdx < run.startIdx || dayIdx > run.endIdx) return;
        lanes[run.lane] = {
          ev: run.ev,
          isRunStart: dayIdx === run.startIdx,
          isRunEnd: dayIdx === run.endIdx,
          isRangeStart: day.isSame(run.start, "day"),
          isRangeEnd: day.isSame(run.end, "day"),
          // Day count of this week's run — the opening segment's label is
          // allowed to lay out across the whole bar, not just its own cell.
          runDays: run.endIdx - run.startIdx + 1,
        };
      });
    }
    return { single, lanes };
  };

  // Year view: total events scheduled per month. Event is Exam-only now, so
  // there's no per-category breakdown to show anymore — just a count.
  const yearMonthSummaries = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const monthDate = currentYear.month(monthIdx);
      const total = events.filter(
        (e) => e.eventDate && dayjs(e.eventDate).year() === currentYear.year() && dayjs(e.eventDate).month() === monthIdx
      ).length;
      return { monthIdx, monthDate, total };
    });
  }, [events, currentYear]);

  // "Available" = total capacity/quantity minus what other events already
  // hold at the same date/overlapping time — fetched per row so Available/
  // Remaining columns populate even for a row that isn't being edited.
  const fetchVenueAvailability = async (venueId, eventId) => {
    if (!venueId || !eventId) return;
    setVenueAvailabilityLoading(true);
    try {
      const { data } = await getEventVenueAvailability(venueId, eventId);
      setVenueAvailability(data);
    } catch {
      setVenueAvailability(null);
    } finally {
      setVenueAvailabilityLoading(false);
    }
  };

  const fetchEquipmentAvailability = async (equipmentId, eventId) => {
    if (!equipmentId || !eventId) return;
    setEquipmentAvailabilityLoadingId(equipmentId);
    try {
      const { data } = await getEventEquipmentAvailability(equipmentId, eventId);
      setEquipmentAvailabilityMap((prev) => ({ ...prev, [equipmentId]: data }));
    } catch {
      // leave unset — the column just shows "—"
    } finally {
      setEquipmentAvailabilityLoadingId(null);
    }
  };

  const openDetails = (ev) => {
    setDetailsEvent(ev);
    setDetailsResources(null);
    setDetailsLoading(true);
    setDateTimeEditing(false);
    setDateDraft(null);
    setStartTimeDraft(null);
    setEndTimeDraft(null);
    setVenueEditing(false);
    setVenueDraftVenueId(null);
    setVenueDraftSeats(null);
    setVenueAvailability(null);
    setEquipmentEditingKey(null);
    setEquipmentDraftEquipmentId(null);
    setEquipmentDraftQuantity(null);
    setEquipmentAvailabilityMap({});
    setSelectedEmployeeId(null);
    setSelectedDutyType(null);
    setDutyLimits(null);
    if (canViewStaff) {
      getEventStaffDutyLimits(ev.id).then(({ data }) => setDutyLimits(data)).catch(() => {});
    }
    Promise.all([
      canViewVenues ? getEventVenues(ev.id) : Promise.resolve({ data: [] }),
      canViewEquipment ? getEventEquipment(ev.id) : Promise.resolve({ data: [] }),
      canViewStaff ? getEventStaff(ev.id) : Promise.resolve({ data: [] }),
      canViewDepartments ? getEventDepartments(ev.id) : Promise.resolve({ data: [] }),
    ])
      .then(([venues, equipment, staff, departments]) => {
        setDetailsResources({
          venues: venues.data,
          equipment: equipment.data,
          staff: staff.data,
          departments: departments.data,
        });
        // Nothing assigned yet — the row starts directly in edit mode, ready
        // to pick, same for both — but only for someone who could actually
        // save it; a view-only user just sees the empty state.
        setVenueEditing(canAssignVenues && venues.data.length === 0);
        if (canAssignVenues && venues.data[0]) fetchVenueAvailability(venues.data[0].venueId, ev.id);
        if (canAssignEquipment) {
          equipment.data.forEach((link) => fetchEquipmentAvailability(link.equipmentId, ev.id));
          if (equipment.data.length === 0) setEquipmentEditingKey("new");
        }
      })
      .catch(() => {
        setDetailsResources({ venues: [], equipment: [], staff: [], departments: [] });
      })
      .finally(() => setDetailsLoading(false));

    // Assignment option lists (venues/equipment/employees/departments) are
    // event-independent — fetch them once, the first time any assign
    // permission is needed, not on every modal open.
    if (!assignOptionsLoaded && (canAssignVenues || canAssignEquipment || canAssignStaff)) {
      setAssignOptionsLoaded(true);
      if (canAssignVenues) getVenues().then(({ data }) => setAllVenues(data)).catch(() => {});
      if (canAssignEquipment) getEquipment().then(({ data }) => setAllEquipment(data)).catch(() => {});
      if (canAssignStaff) {
        getEmployees().then(({ data }) => setAllEmployees(data)).catch(() => {});
        getDepartments().then(({ data }) => setAllDepartments(data)).catch(() => {});
      }
    }
  };

  // Assigning/unassigning a resource can flip the event's status server-side
  // (Hold<->Scheduled) — refetch so the modal header, the Holding Area and the
  // calendar grid all stay accurate, mirroring EventResourcesPage.jsx.
  const refreshDetailsEvent = async (eventId) => {
    try {
      const { data } = await getEvent(eventId);
      setDetailsEvent(data);
      setAllEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    } catch {
      // Non-fatal — the modal just shows the last-known status.
    }
  };

  // The venue row's dropdown just offers every active venue — there's only
  // ever the one slot in this modal, so nothing to exclude as "already
  // taken by another row" the way equipment needs to.
  const venueOptions = useMemo(
    () => allVenues.filter((v) => v.isActive).map((v) => ({ value: v.id, label: v.name })),
    [allVenues]
  );

  const venueDraftCapacity = useMemo(
    () => allVenues.find((v) => v.id === venueDraftVenueId)?.capacity ?? null,
    [allVenues, venueDraftVenueId]
  );

  const detailsPastLocked = isPastEvent(detailsEvent) && !canEditPastEvents;

  // Equipment options exclude whatever's already assigned to another row —
  // except the row currently being edited's own item, so leaving it
  // unchanged stays a valid choice.
  const equipmentOptions = useMemo(() => {
    const assignedIds = new Set(
      (detailsResources?.equipment ?? [])
        .filter((e) => e.equipmentId !== equipmentEditingKey)
        .map((e) => e.equipmentId)
    );
    return allEquipment
      .filter((e) => e.isActive && !assignedIds.has(e.id))
      .map((e) => ({ value: e.id, label: e.name }));
  }, [allEquipment, detailsResources, equipmentEditingKey]);

  const equipmentDraftTotal = useMemo(
    () => allEquipment.find((e) => e.id === equipmentDraftEquipmentId)?.quantity ?? null,
    [allEquipment, equipmentDraftEquipmentId]
  );

  // Whole department hierarchy (top-level root + every descendant) of every
  // department already linked to this event — an employee from any of these
  // is ineligible for staff duty (conflict of interest), mirroring
  // EventStaffService.assertEmployeeEligible / EventResourcesPage.jsx.
  const blockedDepartmentIds = useMemo(() => {
    const assignedDepartments = detailsResources?.departments ?? [];
    if (!allDepartments.length || !assignedDepartments.length) return new Set();
    const byId = new Map(allDepartments.map((d) => [d.id, d]));
    const childrenOf = new Map();
    allDepartments.forEach((d) => {
      if (d.parentId == null) return;
      const siblings = childrenOf.get(d.parentId) || [];
      siblings.push(d.id);
      childrenOf.set(d.parentId, siblings);
    });
    const rootOf = (id) => {
      let current = byId.get(id);
      while (current?.parentId != null) current = byId.get(current.parentId);
      return current?.id ?? id;
    };
    const blocked = new Set();
    const collectSubtree = (id) => {
      if (blocked.has(id)) return;
      blocked.add(id);
      (childrenOf.get(id) || []).forEach(collectSubtree);
    };
    assignedDepartments.forEach((ed) => collectSubtree(rootOf(ed.departmentId)));
    return blocked;
  }, [allDepartments, detailsResources]);

  const availableEmployeeOptions = useMemo(() => {
    const assignedIds = new Set((detailsResources?.staff ?? []).map((s) => s.employeeId));
    return allEmployees
      .filter((e) => e.isActive && !assignedIds.has(e.id) && !blockedDepartmentIds.has(e.departmentId))
      .map((e) => ({ value: e.id, label: employeeLabel(e) }));
  }, [allEmployees, detailsResources, blockedDepartmentIds]);

  // Excludes any duty already at its exam type's configured maximum — the
  // backend blocks it anyway, this just keeps the picker from offering it.
  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff assign form below
  const dutyTypeOptionsForAssign = useMemo(() => {
    if (!dutyLimits) return DUTY_TYPE_OPTIONS;
    const atMax = new Set(
      dutyLimits.filter((d) => d.maxCount != null && d.currentCount >= d.maxCount).map((d) => d.dutyType)
    );
    return DUTY_TYPE_OPTIONS.filter((o) => !atMax.has(o.value));
  }, [dutyLimits]);

  // Edit-staff modal offers currently-eligible/unassigned employees plus
  // whichever employee the row being edited already has.
  const editStaffOptions = useMemo(() => {
    if (!editingStaffRow) return availableEmployeeOptions;
    const current = allEmployees.find((e) => e.id === editingStaffRow.employeeId);
    if (!current) return availableEmployeeOptions;
    return [{ value: current.id, label: employeeLabel(current) }, ...availableEmployeeOptions];
  }, [availableEmployeeOptions, allEmployees, editingStaffRow]);


  const openDateTimeEdit = () => {
    setDateTimeEditing(true);
    setDateDraft(detailsEvent.eventDate ? dayjs(detailsEvent.eventDate) : null);
    setEndDateDraft(detailsEvent.endDate ? dayjs(detailsEvent.endDate) : null);
    setStartTimeDraft(detailsEvent.startTime ? dayjs(detailsEvent.startTime, "HH:mm") : null);
    setEndTimeDraft(detailsEvent.endTime ? dayjs(detailsEvent.endTime, "HH:mm") : null);
  };

  const cancelDateTimeEdit = () => {
    setDateTimeEditing(false);
    setDateDraft(null);
    setEndDateDraft(null);
    setStartTimeDraft(null);
    setEndTimeDraft(null);
  };

  const canEditDate = canReschedule && !detailsPastLocked;
  const canEditTimeField = canEditEventTime && !detailsPastLocked;
  const detailsAllowsDateRange = !!detailsEvent?.rules?.allowsDateRange;
  const detailsNeedsTimeSlot = detailsEvent?.rules?.needsTimeSlot ?? true;

  const handleSaveDateTime = async () => {
    if (!detailsEvent) return;
    setDateTimeSaving(true);
    setError("");
    try {
      if (canEditDate) {
        await updateEvent(detailsEvent.id, {
          eventDate: dateDraft ? dateDraft.format("YYYY-MM-DD") : undefined,
          endDate: detailsAllowsDateRange ? (endDateDraft ? endDateDraft.format("YYYY-MM-DD") : undefined) : undefined,
        });
      }
      if (canEditTimeField && detailsNeedsTimeSlot) {
        await updateEventTime(detailsEvent.id, {
          startTime: startTimeDraft ? startTimeDraft.format("HH:mm") : undefined,
          endTime: endTimeDraft ? endTimeDraft.format("HH:mm") : undefined,
        });
      }
      cancelDateTimeEdit();
      await refreshDetailsEvent(detailsEvent.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save date/time.");
    } finally {
      setDateTimeSaving(false);
    }
  };

  const openVenueEdit = (record) => {
    setVenueEditing(true);
    setVenueDraftVenueId(record.venueId);
    setVenueDraftSeats(record.seats);
    fetchVenueAvailability(record.venueId, detailsEvent.id);
  };

  const cancelVenueEdit = () => {
    setVenueEditing(false);
    setVenueDraftVenueId(null);
    setVenueDraftSeats(null);
  };

  const handleVenueDraftVenueChange = (venueId) => {
    setVenueDraftVenueId(venueId);
    setVenueDraftSeats(null);
    setVenueAvailability(null);
    if (venueId) fetchVenueAvailability(venueId, detailsEvent.id);
  };

  const handleSaveVenue = async () => {
    if (!detailsEvent || !venueDraftVenueId || !venueDraftSeats) return;
    const existing = detailsResources?.venues?.[0] ?? null;
    setVenueSaving(true);
    setError("");
    try {
      const { data } = existing
        ? await updateEventVenue(detailsEvent.id, existing.venueId, venueDraftVenueId, venueDraftSeats)
        : await assignEventVenue(detailsEvent.id, venueDraftVenueId, venueDraftSeats);
      setDetailsResources((prev) => ({
        ...prev,
        venues: existing ? prev.venues.map((v) => (v.id === existing.id ? data : v)) : [...prev.venues, data],
      }));
      setVenueEditing(false);
      await refreshDetailsEvent(detailsEvent.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save venue assignment.");
    } finally {
      setVenueSaving(false);
    }
  };

  const handleUnassignVenue = async (venueId) => {
    if (!detailsEvent) return;
    setRemovingVenueId(venueId);
    setError("");
    try {
      await unassignEventVenue(detailsEvent.id, venueId);
      setDetailsResources((prev) => ({ ...prev, venues: prev.venues.filter((v) => v.venueId !== venueId) }));
      setVenueEditing(true);
      setVenueDraftVenueId(null);
      setVenueDraftSeats(null);
      setVenueAvailability(null);
      await refreshDetailsEvent(detailsEvent.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove venue.");
    } finally {
      setRemovingVenueId(null);
    }
  };

  const startNewEquipmentRow = () => {
    setEquipmentEditingKey("new");
    setEquipmentDraftEquipmentId(null);
    setEquipmentDraftQuantity(null);
  };

  const openEquipmentEdit = (record) => {
    setEquipmentEditingKey(record.equipmentId);
    setEquipmentDraftEquipmentId(record.equipmentId);
    setEquipmentDraftQuantity(record.quantity);
    fetchEquipmentAvailability(record.equipmentId, detailsEvent.id);
  };

  const cancelEquipmentEdit = () => {
    setEquipmentEditingKey(null);
    setEquipmentDraftEquipmentId(null);
    setEquipmentDraftQuantity(null);
  };

  const handleEquipmentDraftEquipmentChange = (equipmentId) => {
    setEquipmentDraftEquipmentId(equipmentId);
    setEquipmentDraftQuantity(null);
    if (equipmentId) fetchEquipmentAvailability(equipmentId, detailsEvent.id);
  };

  const handleSaveEquipment = async () => {
    if (!detailsEvent || !equipmentDraftEquipmentId || !equipmentDraftQuantity) return;
    const isNew = equipmentEditingKey === "new";
    setEquipmentSaving(true);
    setError("");
    try {
      const { data } = isNew
        ? await assignEventEquipment(detailsEvent.id, equipmentDraftEquipmentId, equipmentDraftQuantity)
        : await updateEventEquipment(detailsEvent.id, equipmentEditingKey, equipmentDraftEquipmentId, equipmentDraftQuantity);
      setDetailsResources((prev) => ({
        ...prev,
        equipment: isNew
          ? [...prev.equipment, data]
          : prev.equipment.map((e) => (e.equipmentId === equipmentEditingKey ? data : e)),
      }));
      cancelEquipmentEdit();
      await refreshDetailsEvent(detailsEvent.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save equipment assignment.");
    } finally {
      setEquipmentSaving(false);
    }
  };

  const handleUnassignEquipment = async (equipmentId) => {
    if (!detailsEvent) return;
    setRemovingEquipmentId(equipmentId);
    setError("");
    try {
      await unassignEventEquipment(detailsEvent.id, equipmentId);
      setDetailsResources((prev) => ({
        ...prev,
        equipment: prev.equipment.filter((e) => e.equipmentId !== equipmentId),
      }));
      if (equipmentEditingKey === equipmentId) cancelEquipmentEdit();
      await refreshDetailsEvent(detailsEvent.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove equipment.");
    } finally {
      setRemovingEquipmentId(null);
    }
  };

  const refreshDutyLimits = () => {
    if (!detailsEvent) return;
    getEventStaffDutyLimits(detailsEvent.id).then(({ data }) => setDutyLimits(data)).catch(() => {});
  };

  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff assign form below
  const handleAssignStaff = async () => {
    if (!detailsEvent || !selectedEmployeeId || !selectedDutyType) return;
    setAssigningStaff(true);
    setError("");
    try {
      const { data } = await assignEventStaff(detailsEvent.id, selectedEmployeeId, selectedDutyType);
      setDetailsResources((prev) => ({ ...prev, staff: [...prev.staff, data] }));
      setSelectedEmployeeId(null);
      setSelectedDutyType(null);
      refreshDutyLimits();
    } catch (err) {
      setError(err.response?.data?.message || "Could not assign staff.");
    } finally {
      setAssigningStaff(false);
    }
  };

  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff table below
  const handleUnassignStaff = async (employeeId) => {
    if (!detailsEvent) return;
    setRemovingStaffEmployeeId(employeeId);
    setError("");
    try {
      await unassignEventStaff(detailsEvent.id, employeeId);
      setDetailsResources((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.employeeId !== employeeId) }));
      refreshDutyLimits();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove staff.");
    } finally {
      setRemovingStaffEmployeeId(null);
    }
  };

  // eslint-disable-next-line no-unused-vars -- kept for the commented-out staff table below
  const openEditStaffModal = (record) => {
    setEditingStaffRow(record);
    staffForm.setFieldsValue({ employeeId: record.employeeId, dutyType: record.dutyType });
  };

  const handleEditStaffFinish = async (values) => {
    setStaffModalLoading(true);
    setError("");
    try {
      const { data } = await updateEventStaff(detailsEvent.id, editingStaffRow.employeeId, values.employeeId, values.dutyType);
      setDetailsResources((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => (s.id === editingStaffRow.id ? data : s)),
      }));
      setEditingStaffRow(null);
      staffForm.resetFields();
      refreshDutyLimits();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update staff assignment.");
    } finally {
      setStaffModalLoading(false);
    }
  };

  const goToMonth = (monthDate) => {
    setCurrentMonth(monthDate.startOf("month"));
    setViewMode("month");
  };

  const goToDay = (dayDate) => {
    setCurrentDay(dayDate.startOf("day"));
    setViewMode("day");
  };

  const openAddModal = (dayDate) => {
    setAddModalDate(dayDate.startOf("day"));
    setAddModalOpen(true);
  };

  const handleAddModalSuccess = (data) => {
    setAllEvents((prev) => [data, ...prev]);
    setAddModalOpen(false);
  };

  // AddExamsModal reports partial success — it stays open itself if any item
  // failed, so it only ever calls this with the events that did get created.
  const handleBulkAddSuccess = (createdEvents) => {
    setAllEvents((prev) => [...createdEvents, ...prev]);
  };

  // Day view: events with a full time slot are positioned on the hour grid;
  // events with a date but no time yet show in the all-day strip above it
  // instead (both regardless of status — fading, not presence, signals Hold).
  const dayEventsLayout = useMemo(() => {
    const dateStr = currentDay.format("YYYY-MM-DD");
    const scoped = events.filter(
      (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && e.startTime && e.endTime
    );
    return layoutDayEvents(scoped);
  }, [events, currentDay]);

  // Untimed events for the day — includes both a dateless-time Theory event
  // and every day a date-range category (allowsDateRange) spans, since
  // eventsByDate already expands those across their full range.
  const dayUntimedEvents = useMemo(() => {
    const dateStr = currentDay.format("YYYY-MM-DD");
    return (eventsByDate[dateStr] || []).filter((e) => !e.startTime || !e.endTime);
  }, [eventsByDate, currentDay]);

  // Pre-scroll the Day view's hour grid to 8:00 whenever it's opened or the
  // date changes, so the working day is visible without an extra scroll.
  useEffect(() => {
    if (viewMode === "day" && dayGridRef.current) {
      dayGridRef.current.scrollTop = 8 * DAY_ROW_HEIGHT;
    }
  }, [viewMode, currentDay]);

  // Week view: 7 columns, each laid out the same way as Day view's single
  // column (overlap-grouped, positioned on the shared hour grid) — just
  // scoped to that day's date instead of one currentDay.
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => currentWeekStart.add(i, "day")),
    [currentWeekStart]
  );

  const weekDayEventsLayout = useMemo(() => {
    const map = {};
    weekDays.forEach((day) => {
      const dateStr = day.format("YYYY-MM-DD");
      const scoped = events.filter(
        (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && e.startTime && e.endTime
      );
      map[dateStr] = layoutDayEvents(scoped);
    });
    return map;
  }, [events, weekDays]);

  const weekUntimedEventsByDate = useMemo(() => {
    const map = {};
    weekDays.forEach((day) => {
      const dateStr = day.format("YYYY-MM-DD");
      map[dateStr] = (eventsByDate[dateStr] || []).filter((e) => !e.startTime || !e.endTime);
    });
    return map;
  }, [eventsByDate, weekDays]);

  useEffect(() => {
    if (viewMode === "week" && weekGridRef.current) {
      weekGridRef.current.scrollTop = 8 * DAY_ROW_HEIGHT;
    }
  }, [viewMode, currentWeekStart]);

  // The scrollable hour grid's vertical scrollbar eats into its content
  // width, but the day-header row above it (not scrolled) doesn't have one —
  // without compensating, columns drift out of alignment further right they
  // are. Measured (not assumed) since scrollbar width varies by browser/OS.
  const [weekScrollbarWidth, setWeekScrollbarWidth] = useState(0);
  useEffect(() => {
    if (viewMode === "week" && weekGridRef.current) {
      setWeekScrollbarWidth(weekGridRef.current.offsetWidth - weekGridRef.current.clientWidth);
    }
  }, [viewMode, currentWeekStart, loading]);

  const handleReschedule = async (eventId, newDate) => {
    setReschedulingId(eventId);
    setError("");
    try {
      const { data } = await updateEvent(eventId, { eventDate: newDate });
      setAllEvents((prev) => prev.map((e) => (e.id === eventId ? data : e)));
    } catch (err) {
      setError(err.response?.data?.message || "Could not reschedule event.");
    } finally {
      setReschedulingId(null);
      setDraggedEventId(null);
      setDragOverDate(null);
    }
  };

  const onDragStart = (eventId) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedEventId(eventId);
  };

  const onDropOnDate = (dateStr) => (e) => {
    e.preventDefault();
    if (draggedEventId) handleReschedule(draggedEventId, dateStr);
  };

  // Holding Area — visible on every calendar view to whoever holds
  // event.read-holding, and absent (not merely collapsed) for everyone else so
  // the calendar takes the full width. Collapses/expands horizontally, like
  // the app's own Sidebar — shrinking to a slim vertical strip that hands its
  // width back to the calendar, rather than just hiding its list in place.
  const holdingArea = !canViewHoldingArea ? null : holdingAreaOpen ? (
    <PageCard style={{ flex: "0 1 220px", minWidth: 220 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          Holding Area{holdEvents.length > 0 ? ` (${holdEvents.length})` : ""}
        </Title>
        <Tooltip title="Collapse">
          <Button type="text" size="small" icon={<DoubleRightOutlined />} onClick={() => setHoldingAreaOpen(false)} />
        </Tooltip>
      </div>

      {holdEvents.length === 0 ? (
        <Empty description="Nothing on hold" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {holdEvents.map((ev) => (
            <div
              key={ev.id}
              draggable={canReschedule}
              onDragStart={onDragStart(ev.id)}
              onClick={() => openDetails(ev)}
              style={{
                ...examBlockStyle(ev),
                borderRadius: 4,
                padding: "6px 10px",
                cursor: canReschedule ? "grab" : "pointer",
                opacity: reschedulingId === ev.id ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500 }}>
                <ProgramColorTag ev={ev} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.shortName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageCard>
  ) : (
    <PageCard style={{ flex: "0 0 auto", width: 44, minWidth: 44, padding: "12px 0" }}>
      <div
        onClick={() => setHoldingAreaOpen(true)}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}
      >
        <Tooltip title="Expand Holding Area" placement="left">
          <DoubleLeftOutlined />
        </Tooltip>
        {holdEvents.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: "#1AB394" }}>{holdEvents.length}</div>
        )}
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            marginTop: 14,
            fontSize: 12,
            fontWeight: 600,
            color: "#595959",
            whiteSpace: "nowrap",
          }}
        >
          Holding Area
        </div>
      </div>
    </PageCard>
  );

  return (
    <DashboardLayout
      collapseSidebar={viewMode === "month"}
      headerAction={
        <Space>
          <Dropdown
            open={searchOpen}
            onOpenChange={setSearchOpen}
            trigger={["click"]}
            placement="bottomRight"
            popupRender={() => (
              <div
                style={{
                  width: 340,
                  padding: 16,
                  background: "#fff",
                  borderRadius: 8,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Class</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    placeholder="Any class"
                    value={draftPairs}
                    onChange={setDraftPairs}
                    options={pairOptions}
                    style={{ width: "100%" }}
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    maxTagCount="responsive"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Exam Type</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    placeholder={draftPairs.length ? "Any exam type for these classes" : "Any exam type"}
                    value={draftExamTypeIds}
                    onChange={setDraftExamTypeIds}
                    options={examTypeOptions}
                    style={{ width: "100%" }}
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                    maxTagCount="responsive"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
                    Scope{" "}
                    <Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      (applies immediately)
                    </Text>
                  </Text>
                  <Tooltip
                    title={
                      hasOwnDepartment
                        ? `Department: exams taught by ${user?.employee?.department?.name || "your department"} and anything under it. Institute: every department of ${user?.employee?.department?.institute?.shortName || user?.employee?.department?.institute?.fullName || "your institute"}.`
                        : "No department is linked to your account, so there is nothing to narrow to."
                    }
                  >
                    <Segmented
                      block
                      value={hasOwnDepartment ? scope : "all"}
                      onChange={setScope}
                      disabled={!hasOwnDepartment}
                      options={[
                        { label: "All", value: "all" },
                        { label: "Department", value: "department" },
                        { label: "Institute", value: "institute" },
                      ]}
                    />
                  </Tooltip>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Switch checked={draftIncludePast} onChange={setDraftIncludePast} />
                  <Tooltip title="Off, the search covers today onwards. On, past events are included too — and Apply jumps back to the earliest match in the current session.">
                    <Text style={{ fontSize: 12 }}>Search Previous</Text>
                  </Tooltip>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
                  <Button onClick={clearSearchFilter}>Clear</Button>
                  <Button type="primary" onClick={applySearchFilter}>Apply</Button>
                </div>

                {/* Refines whatever is already applied, live — no Apply. */}
                <Input
                  allowClear
                  prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                  placeholder="Search within results"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            )}
          >
            <Badge dot={filterActive} offset={[-2, 2]}>
              <Button icon={<SearchOutlined />}>Search</Button>
            </Badge>
          </Dropdown>

          {bulkAddEnabled && canCreateHere && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setBulkAddModalOpen(true)}>
              Add Exams
            </Button>
          )}
        </Space>
      }
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

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap-reverse" }}>
        <div style={{ flex: "1 1 640px", minWidth: 0 }}>
          {viewMode === "year" ? (
            <PageCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 16, gap: 8 }}>
                <div style={{ justifySelf: "start" }}>
                  <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />
                </div>
                <div style={{ justifySelf: "center", display: "flex", alignItems: "center" }}>
                  <Button icon={<LeftOutlined />} onClick={() => setCurrentYear((y) => y.subtract(1, "year"))} />
                  <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 100, textAlign: "center" }}>
                    {currentYear.format("YYYY")}
                  </Title>
                  <Button icon={<RightOutlined />} onClick={() => setCurrentYear((y) => y.add(1, "year"))} />
                </div>
                <div style={{ justifySelf: "end" }}>
                  <Button onClick={() => setCurrentYear(dayjs().startOf("year"))}>This Year</Button>
                </div>
              </div>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Spin size="large" />
                </div>
              ) : (
                <div style={{ border: "1px solid #f0f0f0", borderRadius: 6, overflow: "hidden" }}>
                  {yearMonthSummaries.map((summary) => (
                    <div
                      key={summary.monthIdx}
                      onClick={() => goToMonth(summary.monthDate)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "12px 16px",
                        borderTop: summary.monthIdx === 0 ? "none" : "1px solid #f0f0f0",
                        cursor: "pointer",
                        background: summary.monthDate.isSame(dayjs(), "month") ? "#e8f7f4" : "#fff",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = summary.monthDate.isSame(dayjs(), "month") ? "#e8f7f4" : "#fff";
                      }}
                    >
                      <div style={{ width: 120, fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                        {MONTH_NAMES[summary.monthIdx]}
                      </div>

                      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {summary.total === 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>No events</Text>
                        ) : (
                          <Tag color="blue">{summary.total} event{summary.total === 1 ? "" : "s"}</Tag>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PageCard>
          ) : viewMode === "day" ? (
            <PageCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 16, gap: 8 }}>
                <div style={{ justifySelf: "start" }}>
                  <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />
                </div>
                <div style={{ justifySelf: "center", display: "flex", alignItems: "center" }}>
                  <Button icon={<LeftOutlined />} onClick={() => setCurrentDay((d) => d.subtract(1, "day"))} />
                  <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 220, textAlign: "center" }}>
                    {currentDay.format("dddd, DD MMMM YYYY")}
                  </Title>
                  <Button icon={<RightOutlined />} onClick={() => setCurrentDay((d) => d.add(1, "day"))} />
                </div>
                <div style={{ justifySelf: "end", display: "flex", gap: 8 }}>
                  <Button onClick={() => setCurrentDay(dayjs().startOf("day"))}>Today</Button>
                  <Button onClick={() => window.print()}>Print</Button>
                </div>
              </div>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Spin size="large" />
                </div>
              ) : (
                <>
                  {dayUntimedEvents.length > 0 && (
                    <div style={{ display: "flex", border: "1px solid #f0f0f0", borderBottom: "none", borderRadius: "6px 6px 0 0" }}>
                      <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #f0f0f0", fontSize: 10, color: "#bfbfbf", padding: "4px 6px" }}>
                        All-day
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6, padding: 6 }}>
                        {dayUntimedEvents.map((ev) => {
                          const isHold = ev.status === "hold";
                          return (
                            <div
                              key={ev.id}
                              onClick={() => openDetails(ev)}
                              title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                              style={{
                                ...examBlockStyle(ev),
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11,
                                lineHeight: "18px",
                                borderRadius: 3,
                                padding: "0 6px",
                                cursor: "pointer",
                              }}
                            >
                              <ProgramColorTag ev={ev} />
                              {ev.shortName}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div ref={dayGridRef} style={{ display: "flex", border: "1px solid #f0f0f0", borderRadius: dayUntimedEvents.length > 0 ? "0 0 6px 6px" : 6, maxHeight: "70vh", overflowY: "auto" }}>
                  {/* Time labels */}
                  <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #f0f0f0" }}>
                    {HALF_HOURS.map((i) => (
                      <div
                        key={i}
                        style={{
                          height: HALF_HOUR_HEIGHT,
                          boxSizing: "border-box",
                          borderTop: i === 0 ? "none" : `1px solid ${i % 2 === 0 ? "#f0f0f0" : "#f7f7f7"}`,
                          fontSize: 11,
                          color: "#8c8c8c",
                          padding: "2px 6px",
                        }}
                      >
                        {i % 2 === 0 ? `${String(Math.floor(i / 2)).padStart(2, "0")}:00` : ""}
                      </div>
                    ))}
                  </div>

                  {/* Hour grid + event blocks */}
                  <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    {HALF_HOURS.map((i) => (
                      <div
                        key={i}
                        style={{
                          height: HALF_HOUR_HEIGHT,
                          boxSizing: "border-box",
                          borderTop: i === 0 ? "none" : `1px solid ${i % 2 === 0 ? "#f0f0f0" : "#f7f7f7"}`,
                        }}
                      />
                    ))}

                    {currentDay.isSame(dayjs(), "day") && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: ((dayjs().hour() * 60 + dayjs().minute()) / 60) * DAY_ROW_HEIGHT,
                          borderTop: "2px solid #E74C3C",
                          zIndex: 5,
                        }}
                      />
                    )}

                    {dayEventsLayout.length === 0 && (
                      <div style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>No scheduled events for this day.</Text>
                      </div>
                    )}

                    {dayEventsLayout.map((ev) => {
                      const isHold = ev.status === "hold";
                      return (
                      <div
                        key={ev.id}
                        onClick={() => openDetails(ev)}
                        title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                        style={{
                          position: "absolute",
                          top: (ev.startMin / 60) * DAY_ROW_HEIGHT,
                          height: Math.max(((ev.endMin - ev.startMin) / 60) * DAY_ROW_HEIGHT - 2, 18),
                          left: `calc(${(ev.colIndex / ev.totalCols) * 100}% + 2px)`,
                          width: `calc(${100 / ev.totalCols}% - 4px)`,
                          ...examBlockStyle(ev),
                          borderRadius: 4,
                          padding: "3px 6px",
                          fontSize: 11,
                          overflow: "hidden",
                          cursor: "pointer",
                          zIndex: 2,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <ProgramColorTag ev={ev} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ev.shortName}</span>
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.85 }}>
                          {ev.startTime} – {ev.endTime}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  </div>
                </>
              )}
            </PageCard>
          ) : viewMode === "week" ? (
            <PageCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 16, gap: 8 }}>
                <div style={{ justifySelf: "start" }}>
                  <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />
                </div>
                <div style={{ justifySelf: "center", display: "flex", alignItems: "center" }}>
                  <Button icon={<LeftOutlined />} onClick={() => setCurrentWeekStart((w) => w.subtract(7, "day"))} />
                  <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 220, textAlign: "center" }}>
                    {weekRangeLabel(currentWeekStart)}
                  </Title>
                  <Button icon={<RightOutlined />} onClick={() => setCurrentWeekStart((w) => w.add(7, "day"))} />
                </div>
                <div style={{ justifySelf: "end" }}>
                  <Button onClick={() => setCurrentWeekStart(mondayOf(dayjs()))}>This Week</Button>
                </div>
              </div>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Spin size="large" />
                </div>
              ) : (
                <div style={{ border: "1px solid #f0f0f0", borderRadius: 6, overflow: "hidden" }}>
                  {/* Day headers — not scrolled, aligned to the hour grid's columns below.
                      paddingRight compensates for the scrolled grid's scrollbar so columns
                      still line up (see weekScrollbarWidth). */}
                  <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", background: "#fafafa", borderBottom: "1px solid #f0f0f0", paddingRight: weekScrollbarWidth }}>
                    <div />
                    {weekDays.map((day, i) => {
                      const dateStr = day.format("YYYY-MM-DD");
                      const weekend = i === 5 || i === 6;
                      const isToday = day.isSame(dayjs(), "day");
                      const isDragOver = dragOverDate === dateStr;
                      return (
                        <div
                          key={dateStr}
                          onClick={() => goToDay(day)}
                          onDragOver={(e) => { if (canReschedule) { e.preventDefault(); setDragOverDate(dateStr); } }}
                          onDragLeave={() => setDragOverDate((prev) => (prev === dateStr ? null : prev))}
                          onDrop={canReschedule ? onDropOnDate(dateStr) : undefined}
                          style={{
                            position: "relative",
                            padding: "6px 4px",
                            textAlign: "center",
                            cursor: "pointer",
                            background: isDragOver ? "#e8f7f4" : weekend ? "#f0f0f0" : "#fafafa",
                          }}
                        >
                          {canCreateHere && (
                            <span
                              onClick={(e) => { e.stopPropagation(); openAddModal(day); }}
                              title="Add Event"
                              style={{ position: "absolute", top: 2, right: 4, fontSize: 11, lineHeight: 1, color: "#bfbfbf", cursor: "pointer" }}
                            >
                              <PlusOutlined />
                            </span>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 600, color: weekend ? "#8c8c8c" : "#595959" }}>
                            {WEEKDAY_FULL_NAMES[i]}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "#1AB394" : "#262626" }}>
                            {day.format("D MMMM")}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* All-day strip — dated events with no time set yet; not
                      scrolled, so it also needs the scrollbar-width padding. */}
                  {weekDays.some((day) => (weekUntimedEventsByDate[day.format("YYYY-MM-DD")] || []).length > 0) && (
                    <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid #f0f0f0", paddingRight: weekScrollbarWidth }}>
                      <div style={{ fontSize: 10, color: "#bfbfbf", padding: "4px 6px", borderRight: "1px solid #f0f0f0" }}>All-day</div>
                      {weekDays.map((day) => {
                        const dateStr = day.format("YYYY-MM-DD");
                        const untimed = weekUntimedEventsByDate[dateStr] || [];
                        return (
                          <div key={dateStr} style={{ borderLeft: "1px solid #f0f0f0", padding: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                            {untimed.map((ev) => {
                              const isHold = ev.status === "hold";
                              return (
                                <div
                                  key={ev.id}
                                  onClick={() => openDetails(ev)}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...examBlockStyle(ev),
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 10,
                                    lineHeight: "16px",
                                    borderRadius: 3,
                                    padding: "0 4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <ProgramColorTag ev={ev} />
                                  <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {ev.shortName}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Hour grid — scrolled together, time axis + 7 day columns */}
                  <div ref={weekGridRef} style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", maxHeight: "65vh", overflowY: "auto" }}>
                    <div style={{ borderRight: "1px solid #f0f0f0" }}>
                      {HALF_HOURS.map((i) => (
                        <div
                          key={i}
                          style={{
                            height: HALF_HOUR_HEIGHT,
                            boxSizing: "border-box",
                            borderTop: i === 0 ? "none" : `1px solid ${i % 2 === 0 ? "#f0f0f0" : "#f7f7f7"}`,
                            fontSize: 11,
                            color: "#8c8c8c",
                            padding: "2px 6px",
                          }}
                        >
                          {i % 2 === 0 ? `${String(Math.floor(i / 2)).padStart(2, "0")}:00` : ""}
                        </div>
                      ))}
                    </div>

                    {weekDays.map((day, i) => {
                      const dateStr = day.format("YYYY-MM-DD");
                      const weekend = i === 5 || i === 6;
                      const isToday = day.isSame(dayjs(), "day");
                      const isDragOver = dragOverDate === dateStr;
                      const dayLayout = weekDayEventsLayout[dateStr] || [];
                      return (
                        <div
                          key={dateStr}
                          onDragOver={(e) => { if (canReschedule) { e.preventDefault(); setDragOverDate(dateStr); } }}
                          onDragLeave={() => setDragOverDate((prev) => (prev === dateStr ? null : prev))}
                          onDrop={canReschedule ? onDropOnDate(dateStr) : undefined}
                          style={{
                            position: "relative",
                            borderLeft: "1px solid #f0f0f0",
                            background: isDragOver ? "#e8f7f4" : weekend ? "#fafafa" : "#fff",
                          }}
                        >
                          {HALF_HOURS.map((i) => (
                            <div
                              key={i}
                              style={{
                                height: HALF_HOUR_HEIGHT,
                                boxSizing: "border-box",
                                borderTop: i === 0 ? "none" : `1px solid ${i % 2 === 0 ? "#f0f0f0" : "#f7f7f7"}`,
                              }}
                            />
                          ))}

                          {isToday && (
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                top: ((dayjs().hour() * 60 + dayjs().minute()) / 60) * DAY_ROW_HEIGHT,
                                borderTop: "2px solid #E74C3C",
                                zIndex: 5,
                              }}
                            />
                          )}

                          {dayLayout.map((ev) => {
                            const isHold = ev.status === "hold";
                            return (
                              <div
                                key={ev.id}
                                onClick={() => openDetails(ev)}
                                title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                style={{
                                  position: "absolute",
                                  top: (ev.startMin / 60) * DAY_ROW_HEIGHT,
                                  height: Math.max(((ev.endMin - ev.startMin) / 60) * DAY_ROW_HEIGHT - 2, 16),
                                  left: `calc(${(ev.colIndex / ev.totalCols) * 100}% + 1px)`,
                                  width: `calc(${100 / ev.totalCols}% - 2px)`,
                                  ...examBlockStyle(ev),
                                  borderRadius: 3,
                                  padding: "2px 4px",
                                  fontSize: 10,
                                  overflow: "hidden",
                                  cursor: "pointer",
                                  zIndex: 2,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  <ProgramColorTag ev={ev} />
                                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{ev.shortName}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </PageCard>
          ) : (
            <PageCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 16, gap: 8 }}>
                <div style={{ justifySelf: "start" }}>
                  <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />
                </div>
                <div style={{ justifySelf: "center", display: "flex", alignItems: "center" }}>
                  <Button icon={<LeftOutlined />} onClick={() => setCurrentMonth((m) => m.subtract(1, "month"))} />
                  <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 160, textAlign: "center" }}>
                    {currentMonth.format("MMMM YYYY")}
                  </Title>
                  <Button icon={<RightOutlined />} onClick={() => setCurrentMonth((m) => m.add(1, "month"))} />
                </div>
                <div style={{ justifySelf: "end", display: "flex", gap: 8 }}>
                  <Button onClick={() => setCurrentMonth(dayjs().startOf("month"))}>This Month</Button>
                </div>
              </div>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Spin size="large" />
                </div>
              ) : (
                <div ref={monthGridRef} style={{ border: `1px solid ${MONTH_CELL_BORDER}`, borderRadius: 6, overflow: "hidden" }}>
                  {/* Weekday header */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa" }}>
                    {WEEKDAY_FULL_NAMES.map((d) => (
                      <div key={d} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#595959", textAlign: "center" }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Week rows */}
                  {weeks.map((week, wi) => (
                    <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {week.map((day) => {
                        const dateStr = day.format("YYYY-MM-DD");
                        const inMonth = day.month() === currentMonth.month();
                        const isToday = day.isSame(dayjs(), "day");
                        // A day already gone is dimmed exactly like one
                        // outside the month — both are days you can't
                        // schedule into any more.
                        const isMuted = !inMonth || day.isBefore(dayjs(), "day");
                        const { single: singleEvents, lanes: spanningLanes } = monthCellEvents(day, week);
                        const isDragOver = dragOverDate === dateStr;
                        const cellBg = isDragOver ? "#e8f7f4" : isMuted ? "#fafafa" : "#fff";

                        return (
                          <div
                            key={dateStr}
                            data-date={dateStr}
                            onClick={() => goToDay(day)}
                            onDragOver={(e) => { if (canReschedule) { e.preventDefault(); setDragOverDate(dateStr); } }}
                            onDragLeave={() => setDragOverDate((prev) => (prev === dateStr ? null : prev))}
                            onDrop={canReschedule ? onDropOnDate(dateStr) : undefined}
                            style={{
                              position: "relative",
                              // Square at rest — see monthCellSize above.
                              minHeight: monthCellSize || 110,
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              borderTop: `1px solid ${MONTH_CELL_BORDER}`,
                              borderLeft: `1px solid ${MONTH_CELL_BORDER}`,
                              padding: 6,
                              background: cellBg,
                              opacity: isMuted ? 0.5 : 1,
                              cursor: "pointer",
                            }}
                          >
                            {canCreateHere && (
                              <span
                                onClick={(e) => { e.stopPropagation(); openAddModal(day); }}
                                title="Add Event"
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  fontSize: 13,
                                  lineHeight: 1,
                                  color: "#bfbfbf",
                                  cursor: "pointer",
                                  zIndex: 1,
                                }}
                              >
                                <PlusOutlined />
                              </span>
                            )}

                            <div
                              onClick={(e) => { e.stopPropagation(); setVenueAllocationDate(day); }}
                              title="Open venue allocation for this day"
                              style={{
                                flexShrink: 0,
                                alignSelf: "flex-start",
                                fontSize: 13,
                                fontWeight: 700,
                                color: isToday ? "#1AB394" : "#262626",
                                marginBottom: 4,
                                cursor: "pointer",
                              }}
                            >
                              {isToday ? (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 20, height: 20, borderRadius: "50%", background: "#1AB394", color: "#fff",
                                }}>
                                  {day.date()}
                                </span>
                              ) : day.date()}
                            </div>

                            {/* No inner scroll: the list takes its natural
                                height and the day cell grows to fit, which
                                grows the whole week row with it (every cell
                                in a CSS-Grid row stretches to the tallest).
                                A busy day therefore makes its week taller
                                rather than hiding events behind a scrollbar. */}
                            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                              {singleEvents.map((ev) => {
                                const isHold = ev.status === "hold";
                                // Dragging a date-range event (allowsDateRange, e.g. OSPE/OSCE)
                                // onto a single day is ambiguous — which end moves? — so
                                // rescheduling by drag is only offered for single-date events.
                                const isDraggable =
                                  canReschedule && !ev.rules?.allowsDateRange && (!isPastEvent(ev) || canEditPastEvents);
                                return (
                                <div
                                  key={ev.id}
                                  draggable={isDraggable}
                                  onDragStart={onDragStart(ev.id)}
                                  onClick={(e) => { e.stopPropagation(); openDetails(ev); }}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...examBlockStyle(ev),
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 11,
                                    lineHeight: "18px",
                                    height: 18,
                                    flexShrink: 0,
                                    // Full cell width, and a name longer than
                                    // that is simply cut off — the block's own
                                    // tooltip carries the full name, so the
                                    // trimmed tail costs nothing.
                                    alignSelf: "stretch",
                                    overflow: "hidden",
                                    borderRadius: 3,
                                    padding: "0 6px",
                                    whiteSpace: "nowrap",
                                    cursor: isDraggable ? "grab" : "pointer",
                                    opacity: reschedulingId === ev.id ? 0.5 : 1,
                                  }}
                                >
                                  <ProgramColorTag ev={ev} />
                                  <span style={{ minWidth: 0, overflow: "hidden" }}>{ev.shortName}</span>
                                </div>
                                );
                              })}
                            </div>

                            {/* Multi-day events, pinned to the bottom of every
                                cell (marginTop:auto) so a run stays on one
                                visual line across the week no matter how many
                                single-day blocks sit above it in any one day.
                                One slot per lane, in the same order in every
                                cell of the week, so two runs sharing a day
                                never land on each other's line — an unused
                                lane holds an empty spacer of exactly one
                                segment's height. Each day renders its own
                                segment; the segments fuse into one continuous
                                bar by dropping the border and radius on the
                                side they continue into and bleeding over the
                                shared cell border by exactly padding + border
                                (6 + 1px). The name is drawn once, on the
                                segment that opens the run in this week. */}
                            {spanningLanes.length > 0 && (
                              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, marginTop: "auto", paddingTop: 3 }}>
                                {spanningLanes.map((segment, laneIdx) => {
                                  if (!segment) {
                                    return <div key={`lane-${laneIdx}`} style={{ height: 18, flexShrink: 0 }} />;
                                  }
                                  const { ev, isRunStart, isRunEnd, isRangeStart, isRangeEnd, runDays } = segment;
                                  const isHold = ev.status === "hold";
                                  const style = examBlockStyle(ev);
                                  return (
                                    <div
                                      key={ev.id}
                                      onClick={(e) => { e.stopPropagation(); openDetails(ev); }}
                                      title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                      style={{
                                        position: "relative",
                                        // The opening segment paints above
                                        // the continuation ones so its label
                                        // — which overflows into them — is
                                        // not covered by their background.
                                        zIndex: isRunStart ? 2 : 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        backgroundColor: cellBg,
                                        backgroundImage: `linear-gradient(${style.background}, ${style.background})`,
                                        color: style.color,
                                        borderTop: style.border,
                                        borderBottom: style.border,
                                        borderLeft: isRunStart ? style.border : "none",
                                        borderRight: isRunEnd ? style.border : "none",
                                        borderTopLeftRadius: isRangeStart ? 3 : 0,
                                        borderBottomLeftRadius: isRangeStart ? 3 : 0,
                                        borderTopRightRadius: isRangeEnd ? 3 : 0,
                                        borderBottomRightRadius: isRangeEnd ? 3 : 0,
                                        marginLeft: isRunStart ? 0 : -7,
                                        marginRight: isRunEnd ? 0 : -7,
                                        fontSize: 11,
                                        lineHeight: "18px",
                                        height: 18,
                                        flexShrink: 0,
                                        // visible on the opening segment so a
                                        // name wider than one day cell can run
                                        // along the rest of the bar; the label
                                        // itself is bounded to the bar's width
                                        // below.
                                        overflow: isRunStart ? "visible" : "hidden",
                                        padding: isRunStart ? "0 6px" : 0,
                                        whiteSpace: "nowrap",
                                        cursor: "pointer",
                                        opacity: reschedulingId === ev.id ? 0.5 : 1,
                                      }}
                                    >
                                      {isRunStart && (
                                        <>
                                          <ProgramColorTag ev={ev} />
                                          {/* Free to take its natural width up
                                              to the length of the bar, so a
                                              name that fits the run is shown
                                              whole rather than cut at the
                                              first day's edge. */}
                                          <span
                                            style={{
                                              flexShrink: 0,
                                              maxWidth: `calc(${runDays} * 100%)`,
                                              overflow: "hidden",
                                            }}
                                          >
                                            {ev.shortName}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </PageCard>
          )}
        </div>

        {holdingArea}
      </div>

      {/* Event details modal */}
      <Modal
        title={
          detailsEvent && (
            <Space align="center">
              {detailsModalTitle(detailsEvent)}
              <Tag color={STATUS_TAG_COLORS[detailsEvent.status]} style={{ marginBottom: 0 }}>
                {STATUS_LABELS[detailsEvent.status]}
              </Tag>
            </Space>
          )
        }
        open={!!detailsEvent}
        onCancel={() => { setDetailsEvent(null); setDetailsResources(null); }}
        footer={null}
        centered
        width={780}
      >
        {detailsEvent && (
          <>
            {/* Title already says program/degree/paper/exam type/session —
                repeating them in a table below is just noise, for anyone.
                Status now sits next to the title itself (see Modal's title
                prop above), not repeated here. */}
            <Table
              rowKey={() => "date-time"}
              size="small"
              pagination={false}
              bordered
              style={{ marginTop: 8 }}
              dataSource={[{}]}
              columns={[
                {
                  title: detailsAllowsDateRange ? "Date Range" : "Date",
                  render: () =>
                    dateTimeEditing && canEditDate ? (
                      detailsAllowsDateRange ? (
                        <RangePicker
                          size="small"
                          style={{ width: "100%" }}
                          format="YYYY-MM-DD"
                          value={[dateDraft, endDateDraft]}
                          onChange={(vals) => { setDateDraft(vals?.[0] ?? null); setEndDateDraft(vals?.[1] ?? null); }}
                        />
                      ) : (
                        <DatePicker
                          size="small"
                          style={{ width: "100%" }}
                          format="YYYY-MM-DD"
                          value={dateDraft}
                          onChange={setDateDraft}
                        />
                      )
                    ) : (
                      eventDateRangeLabel(detailsEvent)
                    ),
                },
                ...(detailsNeedsTimeSlot
                  ? [
                      {
                        title: "Time",
                        render: () =>
                          dateTimeEditing && canEditTimeField ? (
                            <Space size={4}>
                              <TimePicker size="small" style={{ width: 100 }} format="HH:mm" value={startTimeDraft} onChange={setStartTimeDraft} />
                              <span>–</span>
                              <TimePicker size="small" style={{ width: 100 }} format="HH:mm" value={endTimeDraft} onChange={setEndTimeDraft} />
                            </Space>
                          ) : detailsEvent.startTime && detailsEvent.endTime ? (
                            `${detailsEvent.startTime} – ${detailsEvent.endTime}`
                          ) : (
                            "Not set"
                          ),
                      },
                    ]
                  : []),
                ...(canEditDate || canEditTimeField
                  ? [
                      {
                        title: "Actions",
                        width: 90,
                        align: "center",
                        render: () =>
                          dateTimeEditing ? (
                            <Space>
                              <Tooltip title="Save">
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<SaveOutlined />}
                                  loading={dateTimeSaving}
                                  onClick={handleSaveDateTime}
                                />
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <Button size="small" icon={<CloseOutlined />} onClick={cancelDateTimeEdit} />
                              </Tooltip>
                            </Space>
                          ) : (
                            <Tooltip title="Edit">
                              <Button size="small" icon={<EditOutlined />} onClick={openDateTimeEdit} />
                            </Tooltip>
                          ),
                      },
                    ]
                  : []),
              ]}
            />

            {canManageResources && detailsPastLocked && (
              <Alert
                type="warning"
                showIcon
                message="This event's date has already passed — resources can no longer be changed without permission to edit past events."
                style={{ marginTop: 16 }}
              />
            )}

            {detailsLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <Spin />
              </div>
            ) : (
              detailsResources &&
              (canManageResources ? (
                <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Departments</Title>
                  {!canViewDepartments ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : detailsResources.departments.length === 0 ? (
                    <Text type="secondary">None linked yet.</Text>
                  ) : (
                    <Space wrap>
                      {detailsResources.departments.map((d) => (
                        <Tag key={d.departmentId}>{d.department?.name ?? "—"}</Tag>
                      ))}
                    </Space>
                  )}

                  {detailsEvent.rules?.needsVenue && (
                  <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Venues</Title>
                  {!canViewVenues ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : (
                    <Table
                      rowKey={(r) => r.id ?? "draft"}
                      size="small"
                      pagination={false}
                      dataSource={venueEditing ? [{ __draft: true }] : detailsResources.venues}
                      locale={{ emptyText: <Empty description="None assigned yet." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                      columns={[
                        {
                          title: "Name",
                          render: (_, r) =>
                            r.__draft ? (
                              <Select
                                size="small"
                                style={{ width: "100%" }}
                                placeholder="Select venue"
                                options={venueOptions}
                                value={venueDraftVenueId}
                                onChange={handleVenueDraftVenueChange}
                                showSearch
                                filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                              />
                            ) : (
                              r.venue?.name ?? "—"
                            ),
                        },
                        {
                          title: "Total Seats",
                          render: (_, r) => (r.__draft ? (venueDraftCapacity ?? "—") : (r.venue?.capacity ?? "—")),
                        },
                        {
                          title: "Available Seats",
                          render: (_, r) => {
                            const venueId = r.__draft ? venueDraftVenueId : r.venueId;
                            if (!venueId) return "—";
                            if (venueAvailabilityLoading) return <Spin size="small" />;
                            return venueAvailability?.availableSeats ?? "—";
                          },
                        },
                        {
                          title: "Seats Reserved",
                          render: (_, r) =>
                            r.__draft ? (
                              <InputNumber
                                size="small"
                                min={1}
                                max={venueAvailability?.availableSeats}
                                value={venueDraftSeats}
                                onChange={setVenueDraftSeats}
                                disabled={!venueDraftVenueId}
                                style={{ width: 90 }}
                              />
                            ) : (
                              (r.seats ?? "—")
                            ),
                        },
                        {
                          title: "Remaining Seats",
                          render: (_, r) => {
                            const available = venueAvailability?.availableSeats;
                            const reserved = r.__draft ? venueDraftSeats : r.seats;
                            if (available == null || reserved == null) return "—";
                            return Math.max(available - reserved, 0);
                          },
                        },
                        {
                          title: "Actions",
                          width: 90,
                          align: "center",
                          render: (_, r) =>
                            r.__draft ? (
                              <Space>
                                <Tooltip title="Save">
                                  <Button
                                    size="small"
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    disabled={!venueDraftVenueId || !venueDraftSeats}
                                    loading={venueSaving}
                                    onClick={handleSaveVenue}
                                  />
                                </Tooltip>
                                {detailsResources.venues[0] && (
                                  <Tooltip title="Cancel">
                                    <Button size="small" icon={<CloseOutlined />} onClick={cancelVenueEdit} />
                                  </Tooltip>
                                )}
                              </Space>
                            ) : (
                              <Space>
                                {canAssignVenues && !detailsPastLocked && (
                                  <Tooltip title="Edit">
                                    <Button size="small" icon={<EditOutlined />} onClick={() => openVenueEdit(r)} />
                                  </Tooltip>
                                )}
                                {canUnassignVenues && !detailsPastLocked && (
                                  <Tooltip title="Remove">
                                    <Button
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      loading={removingVenueId === r.venueId}
                                      onClick={() => handleUnassignVenue(r.venueId)}
                                    />
                                  </Tooltip>
                                )}
                              </Space>
                            ),
                        },
                      ]}
                    />
                  )}
                  </>
                  )}

                  {detailsEvent.rules?.needsEquipment && (
                  <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 8 }}>
                    <Title level={5} style={{ margin: 0 }}>Equipment</Title>
                    {canAssignEquipment && !detailsPastLocked && equipmentEditingKey === null && (
                      <Tooltip title="Add Equipment">
                        <Button type="text" size="small" icon={<PlusOutlined />} onClick={startNewEquipmentRow} />
                      </Tooltip>
                    )}
                  </div>
                  {!canViewEquipment ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : (
                    <Table
                      rowKey={(r) => r.id ?? "draft"}
                      size="small"
                      pagination={false}
                      dataSource={equipmentEditingKey === "new" ? [...detailsResources.equipment, { __draft: true }] : detailsResources.equipment}
                      locale={{ emptyText: <Empty description="None assigned yet." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                      columns={[
                        {
                          title: "Name",
                          render: (_, r) => {
                            const editingThisRow = r.__draft || equipmentEditingKey === r.equipmentId;
                            if (!editingThisRow) return r.equipment?.name ?? "—";
                            return (
                              <Select
                                size="small"
                                style={{ width: "100%" }}
                                placeholder="Select equipment"
                                options={equipmentOptions}
                                value={equipmentDraftEquipmentId}
                                onChange={handleEquipmentDraftEquipmentChange}
                                showSearch
                                filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                              />
                            );
                          },
                        },
                        {
                          title: "Total Quantity",
                          render: (_, r) => {
                            const editingThisRow = r.__draft || equipmentEditingKey === r.equipmentId;
                            return editingThisRow ? (equipmentDraftTotal ?? "—") : (r.equipment?.quantity ?? "—");
                          },
                        },
                        {
                          title: "Available Quantity",
                          render: (_, r) => {
                            const id = r.__draft ? equipmentDraftEquipmentId : r.equipmentId;
                            if (!id) return "—";
                            if (equipmentAvailabilityLoadingId === id) return <Spin size="small" />;
                            return equipmentAvailabilityMap[id]?.availableQuantity ?? "—";
                          },
                        },
                        {
                          title: "Assigned Quantity",
                          render: (_, r) => {
                            const editingThisRow = r.__draft || equipmentEditingKey === r.equipmentId;
                            return editingThisRow ? (
                              <InputNumber
                                size="small"
                                min={1}
                                max={equipmentAvailabilityMap[equipmentDraftEquipmentId]?.availableQuantity}
                                value={equipmentDraftQuantity}
                                onChange={setEquipmentDraftQuantity}
                                disabled={!equipmentDraftEquipmentId}
                                style={{ width: 80 }}
                              />
                            ) : (
                              (r.quantity ?? "—")
                            );
                          },
                        },
                        {
                          title: "Remaining Quantity",
                          render: (_, r) => {
                            const editingThisRow = r.__draft || equipmentEditingKey === r.equipmentId;
                            const id = r.__draft ? equipmentDraftEquipmentId : r.equipmentId;
                            const available = equipmentAvailabilityMap[id]?.availableQuantity;
                            const assigned = editingThisRow ? equipmentDraftQuantity : r.quantity;
                            if (available == null || assigned == null) return "—";
                            return Math.max(available - assigned, 0);
                          },
                        },
                        {
                          title: "Actions",
                          width: 90,
                          align: "center",
                          render: (_, r) => {
                            const editingThisRow = r.__draft || equipmentEditingKey === r.equipmentId;
                            if (editingThisRow) {
                              return (
                                <Space>
                                  <Tooltip title="Save">
                                    <Button
                                      size="small"
                                      type="primary"
                                      icon={<SaveOutlined />}
                                      disabled={!equipmentDraftEquipmentId || !equipmentDraftQuantity}
                                      loading={equipmentSaving}
                                      onClick={handleSaveEquipment}
                                    />
                                  </Tooltip>
                                  {/* Same rule as the Venue row: hidden when
                                      this is the sole auto-shown row (nothing
                                      assigned yet) — cancelling would leave
                                      no way back in without the modal
                                      reopening. Any other row always has the
                                      "+" to return to. */}
                                  {detailsResources.equipment.length > 0 && (
                                    <Tooltip title="Cancel">
                                      <Button size="small" icon={<CloseOutlined />} onClick={cancelEquipmentEdit} />
                                    </Tooltip>
                                  )}
                                </Space>
                              );
                            }
                            return (
                              <Space>
                                {canAssignEquipment && !detailsPastLocked && equipmentEditingKey === null && (
                                  <Tooltip title="Edit">
                                    <Button size="small" icon={<EditOutlined />} onClick={() => openEquipmentEdit(r)} />
                                  </Tooltip>
                                )}
                                {canUnassignEquipment && !detailsPastLocked && (
                                  <Tooltip title="Remove">
                                    <Button
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      loading={removingEquipmentId === r.equipmentId}
                                      onClick={() => handleUnassignEquipment(r.equipmentId)}
                                    />
                                  </Tooltip>
                                )}
                              </Space>
                            );
                          },
                        },
                      ]}
                    />
                  )}
                  </>
                  )}

                  {detailsEvent.rules?.needsStaff && (
                  <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Event Staff</Title>
                  {!canViewStaff ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : (
                    <>
                      {dutyLimits && (
                        <Space size={[8, 4]} wrap style={{ marginBottom: 12 }}>
                          {dutyLimits
                            .filter((d) => d.hasRule)
                            .map((d) => (
                              <Tag key={d.dutyType}>
                                {DUTY_TYPE_LABELS[d.dutyType]}: {d.minCount}
                              </Tag>
                            ))}
                        </Space>
                      )}
                      {/* Staff assigning form + table — commented out per
                          request; this section now only shows the required
                          headcount per duty type as tags above.
                      {canAssignStaff && !detailsPastLocked && (
                        <Space style={{ marginBottom: 12 }} wrap>
                          <Select
                            placeholder="Select an employee to assign"
                            options={availableEmployeeOptions}
                            value={selectedEmployeeId}
                            onChange={setSelectedEmployeeId}
                            showSearch
                            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                            style={{ width: 280 }}
                          />
                          <Select
                            placeholder="Select duty"
                            options={dutyTypeOptionsForAssign}
                            value={selectedDutyType}
                            onChange={setSelectedDutyType}
                            style={{ width: 180 }}
                          />
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            disabled={!selectedEmployeeId || !selectedDutyType}
                            loading={assigningStaff}
                            onClick={handleAssignStaff}
                          >
                            Assign
                          </Button>
                        </Space>
                      )}
                      <Table
                        rowKey="employeeId"
                        size="small"
                        pagination={false}
                        dataSource={detailsResources.staff}
                        locale={{ emptyText: <Empty description="None assigned yet." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                        columns={[
                          {
                            title: "Name",
                            render: (_, r) =>
                              `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() || "—",
                          },
                          { title: "Department", render: (_, r) => r.employee?.department?.name ?? "—" },
                          { title: "Duty", render: (_, r) => DUTY_TYPE_LABELS[r.dutyType] ?? r.dutyType },
                          {
                            title: "Actions",
                            width: 90,
                            align: "center",
                            render: (_, r) => (
                              <Space>
                                {canAssignStaff && !detailsPastLocked && (
                                  <Tooltip title="Edit">
                                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditStaffModal(r)} />
                                  </Tooltip>
                                )}
                                {canUnassignStaff && !detailsPastLocked && (
                                  <Tooltip title="Remove">
                                    <Button
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      loading={removingStaffEmployeeId === r.employeeId}
                                      onClick={() => handleUnassignStaff(r.employeeId)}
                                    />
                                  </Tooltip>
                                )}
                              </Space>
                            ),
                          },
                        ]}
                      />
                      */}
                    </>
                  )}
                  </>
                  )}
                </>
              ) : (
                // Read-only viewer: plain labeled lists instead of tables with
                // Assign controls/Actions columns they can't use anyway.
                <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Department(s)</Title>
                  {!canViewDepartments ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : detailsResources.departments.length === 0 ? (
                    <Text type="secondary">None linked yet.</Text>
                  ) : (
                    <Text>{detailsResources.departments.map((d) => d.department?.name ?? "—").join(", ")}</Text>
                  )}

                  {detailsEvent.rules?.needsVenue && (
                  <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Venue(s)</Title>
                  {!canViewVenues ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : detailsResources.venues.length === 0 ? (
                    <Text type="secondary">None assigned yet.</Text>
                  ) : (
                    <div>
                      {detailsResources.venues.map((v) => (
                        <div key={v.venueId}>{v.venue?.name ?? "—"} – {v.venue?.location ?? "—"}</div>
                      ))}
                    </div>
                  )}
                  </>
                  )}

                  {detailsEvent.rules?.needsEquipment && (
                  <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Equipment</Title>
                  {!canViewEquipment ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : detailsResources.equipment.length === 0 ? (
                    <Text type="secondary">None assigned yet.</Text>
                  ) : (
                    <div>
                      {detailsResources.equipment.map((e) => (
                        <div key={e.equipmentId}>{e.equipment?.name ?? "—"} – {e.equipment?.description || "—"}</div>
                      ))}
                    </div>
                  )}
                  </>
                  )}

                  {detailsEvent.rules?.needsStaff && (
                  <>
                  <Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>Duty Staff</Title>
                  {!canViewStaff ? (
                    <Text type="secondary">You don't have permission to view this.</Text>
                  ) : detailsResources.staff.length === 0 ? (
                    <Text type="secondary">None assigned yet.</Text>
                  ) : (
                    <div>
                      {detailsResources.staff.map((s) => (
                        <div key={s.employeeId}>
                          {`${s.employee?.firstName ?? ""} ${s.employee?.lastName ?? ""}`.trim() || "—"} from{" "}
                          {s.employee?.department?.name ?? "—"} as {DUTY_TYPE_LABELS[s.dutyType] ?? s.dutyType}.
                        </div>
                      ))}
                    </div>
                  )}
                  </>
                  )}
                </>
              ))
            )}
          </>
        )}
      </Modal>


      {/* Edit Staff Assignment Modal */}
      <Modal
        title="Edit Staff Assignment"
        open={!!editingStaffRow}
        onCancel={() => { setEditingStaffRow(null); staffForm.resetFields(); }}
        onOk={() => staffForm.submit()}
        okText="Save"
        confirmLoading={staffModalLoading}
        destroyOnHidden
        centered
      >
        <Form form={staffForm} layout="vertical" onFinish={handleEditStaffFinish} requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: "Please select an employee." }]}>
            <Select
              placeholder="Select employee"
              options={editStaffOptions}
              showSearch
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="dutyType" label="Duty" rules={[{ required: true, message: "Please select a duty." }]}>
            <Select placeholder="Select duty" options={DUTY_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Quick-add Event modal, opened from a Month view day box's "+" icon */}
      <EventFormModal
        open={addModalOpen}
        editingRecord={null}
        initialDate={addModalDate}
        existingEvents={allEvents}
        onCancel={() => setAddModalOpen(false)}
        onSuccess={handleAddModalSuccess}
        onError={setError}
      />

      {bulkAddEnabled && (
        <AddExamsModal
          open={bulkAddModalOpen}
          existingEvents={allEvents}
          onCancel={() => setBulkAddModalOpen(false)}
          onSuccess={handleBulkAddSuccess}
          onError={setError}
        />
      )}

      {/* Per-day resource allocation view — opened from a Month view day
          box's own date number. */}
      <VenueAllocationModal
        open={!!venueAllocationDate}
        date={venueAllocationDate}
        events={events}
        onCancel={() => setVenueAllocationDate(null)}
        onEventUpdated={(updated) => setAllEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))}
        onOpenDetails={openDetails}
        onError={setError}
      />
    </DashboardLayout>
  );
}

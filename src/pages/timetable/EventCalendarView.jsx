import { useState, useEffect, useMemo, useRef } from "react";
import {
  Button, Alert, Typography, Spin, Empty, Modal, Tag, Segmented, Table, Space,
  Select, InputNumber, Form, Tooltip, DatePicker, TimePicker,
} from "antd";
import {
  LeftOutlined, RightOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined,
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
import { getOspeOsceExams } from "../../api/ospeOsceApi";
import { getVenues } from "../../api/venuesApi";
import { getEquipment } from "../../api/equipmentApi";
import { getEmployees } from "../../api/employeesApi";
import { getDepartments } from "../../api/departmentsApi";
import { useAuth } from "../../context/AuthContext";
import EventFormModal from "../events/EventFormModal";
import AddExamsModal from "./AddExamsModal";

const { Title, Text } = Typography;

const VIEW_OPTIONS = [
  { label: "Year", value: "year" },
  { label: "Month", value: "month" },
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

// Same as Event.fullName, but with the program abbreviated to its short
// name — reads cleaner as a modal title than the fully spelled-out program
// name.
const detailsModalTitle = (ev) => {
  if (!ev) return undefined;
  const program = ev.program?.shortName || ev.program?.fullName || "";
  const base = [program, ev.degreeLevel?.fullName, ev.coursePaper?.fullName, ev.examType?.fullName, ev.session?.name]
    .filter(Boolean)
    .join(" ");
  return ev.isRetake ? `${base} RT` : base;
};


const DAY_ROW_HEIGHT = 56; // px per hour in Day/Week views

const WEEKDAY_FULL_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Day and Week views both use half-hour gridlines/labels at half the row
// height (28px per 30 min = 56px per hour) — event positioning math is
// unaffected, since it's still computed off DAY_ROW_HEIGHT per hour.
const HALF_HOUR_HEIGHT = DAY_ROW_HEIGHT / 2;
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i); // i*30 minutes

// Falls back to the old neutral outlined style when an exam type has no
// color configured (Exam Types page) — otherwise a light tint of the exam
// type's own color, so each block reads at a glance without needing to open
// it. Text always stays dark/neutral regardless of the color, for contrast.
function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function examBlockStyle(ev) {
  const color = ev?.examType?.color;
  if (!color) return { background: "transparent", color: "#262626", border: "1px solid #d9d9d9" };
  return { background: hexToRgba(color, 0.14), color: "#262626", border: `1px solid ${color}` };
}

// OSPE/OSCE blocks reuse the same exam-type color tint as Theory events (so
// the same exam type reads consistently) but always get a dashed border —
// the one visual cue that distinguishes "OSPE/OSCE, date-only" from a
// regular timed/venued Theory exam block at a glance.
function ospeOsceBlockStyle(record) {
  const color = record?.examType?.color;
  if (!color) return { background: "#f9f0ff", color: "#262626", border: "1px dashed #9254de" };
  return { background: hexToRgba(color, 0.14), color: "#262626", border: `1px dashed ${color}` };
}

// Mirrors OspeOsceList.jsx's own papersLabel/classLabel/dateRangeLabel
// helpers — kept as separate local copies since this file has its own
// STATUS_LABELS/STATUS_TAG_COLORS already matching the same EventStatus enum.
const ospeOscePapersLabel = (record) =>
  (record.coursePapers || [])
    .map((cp) => (cp.coursePaper?.shortName || cp.coursePaper?.fullName || `#${cp.coursePaperId}`) + (cp.isRetake ? " (RT)" : ""))
    .join(", ");

const ospeOsceClassLabel = (record) => {
  const program = record.program?.shortName || record.program?.fullName || "";
  return [program, record.degreeLevel?.fullName, record.session?.name].filter(Boolean).join(" ");
};

const ospeOsceDateRangeLabel = (record) => {
  if (!record.startDate) return "Not set";
  const start = dayjs(record.startDate).format("DD MMM YYYY");
  const end = record.endDate ? dayjs(record.endDate).format("DD MMM YYYY") : null;
  return end && end !== start ? `${start} – ${end}` : start;
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
  const { can } = useAuth();
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
  const canViewOspeOsce = can("ospe-osce.read-all") || can("ospe-osce.read-departmental");
  // Whether the viewer can act on any resource at all — decides whether the
  // details modal shows the table+form assignment UI (useful for someone who
  // manages resources) or a plain, friendly read-only summary (everyone
  // else, e.g. Faculty just checking an upcoming exam in their department).
  const canManageResources =
    canAssignVenues || canUnassignVenues || canAssignEquipment || canUnassignEquipment || canAssignStaff || canUnassignStaff;

  const [viewMode, setViewMode] = useState("month");
  const [allEvents, setAllEvents] = useState([]);
  const [allOspeOsce, setAllOspeOsce] = useState([]);
  const [ospeOsceDetails, setOspeOsceDetails] = useState(null);
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
  const [startTimeDraft, setStartTimeDraft] = useState(null);
  const [endTimeDraft, setEndTimeDraft] = useState(null);
  const [dateTimeSaving, setDateTimeSaving] = useState(false);

  // Venue is a single inline-editable row (at most one per event in this
  // modal — see MULTI_VENUE_CATEGORY_ID note on EventResourcesPage.jsx for
  // the one exam category that technically allows more; only the first is
  // surfaced here). venueEditing toggles the row between its read-only
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
  const dayGridRef = useRef(null);
  const weekGridRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [{ data: eventsData }, ospeOsceData] = await Promise.all([
          getEvents(),
          canViewOspeOsce ? getOspeOsceExams().then((r) => r.data) : Promise.resolve([]),
        ]);
        setAllEvents(eventsData);
        setAllOspeOsce(ospeOsceData);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = allEvents;

  const canCreateHere = can("event.create") || can("event.create-departmental");

  // Holding Area holds every event still in Hold status — a Hold event with a
  // full date/time also appears on the calendar below (faded, non-clickable)
  // simultaneously, until time + all three resource types get it to Scheduled.
  // Events with no date yet always stay in the Holding Area — only a dated
  // event that's already in the past drops off.
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
  // Fading (isHold below) is what signals "not confirmed yet", not presence.
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!e.eventDate) return;
      const key = dayjs(e.eventDate).format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  // OSPE/OSCE has no time slot — just a date range — so it's shown once per
  // calendar day it spans, the same way an untimed Event shows in Month
  // view's day box and Week/Day view's all-day strip below. Entries with no
  // date yet (still Hold) don't appear here, same as a dateless Event.
  const ospeOsceByDate = useMemo(() => {
    const map = {};
    allOspeOsce.forEach((o) => {
      if (!o.startDate) return;
      const start = dayjs(o.startDate).startOf("day");
      const end = o.endDate ? dayjs(o.endDate).startOf("day") : start;
      let cursor = start;
      let days = 0;
      // Guard against an absurdly wide range looping forever.
      while (!cursor.isAfter(end) && days < 60) {
        const key = cursor.format("YYYY-MM-DD");
        if (!map[key]) map[key] = [];
        map[key].push(o);
        cursor = cursor.add(1, "day");
        days += 1;
      }
    });
    return map;
  }, [allOspeOsce]);

  const openOspeOsceDetails = (record) => setOspeOsceDetails(record);

  const weeks = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

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
    setStartTimeDraft(detailsEvent.startTime ? dayjs(detailsEvent.startTime, "HH:mm") : null);
    setEndTimeDraft(detailsEvent.endTime ? dayjs(detailsEvent.endTime, "HH:mm") : null);
  };

  const cancelDateTimeEdit = () => {
    setDateTimeEditing(false);
    setDateDraft(null);
    setStartTimeDraft(null);
    setEndTimeDraft(null);
  };

  const canEditDate = canReschedule && !detailsPastLocked;
  const canEditTimeField = canEditEventTime && !detailsPastLocked;

  const handleSaveDateTime = async () => {
    if (!detailsEvent) return;
    setDateTimeSaving(true);
    setError("");
    try {
      if (canEditDate) {
        await updateEvent(detailsEvent.id, { eventDate: dateDraft ? dateDraft.format("YYYY-MM-DD") : undefined });
      }
      if (canEditTimeField) {
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

  const dayUntimedEvents = useMemo(() => {
    const dateStr = currentDay.format("YYYY-MM-DD");
    return events.filter(
      (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && (!e.startTime || !e.endTime)
    );
  }, [events, currentDay]);

  const dayOspeOsce = useMemo(
    () => ospeOsceByDate[currentDay.format("YYYY-MM-DD")] || [],
    [ospeOsceByDate, currentDay]
  );

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
      map[dateStr] = events.filter(
        (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && (!e.startTime || !e.endTime)
      );
    });
    return map;
  }, [events, weekDays]);

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

  // Holding Area — always visible, regardless of which calendar view is active.
  const holdingArea = (
    <PageCard style={{ flex: "0 1 220px", minWidth: 220 }}>
      <Title level={5} style={{ marginTop: 0 }}>Holding Area</Title>

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
                ...(ev.examType?.color ? examBlockStyle(ev) : { background: "#f0f0f0", border: "1px solid #d9d9d9" }),
                borderRadius: 4,
                padding: "6px 10px",
                cursor: canReschedule ? "grab" : "pointer",
                opacity: reschedulingId === ev.id ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>{ev.shortName}</div>
            </div>
          ))}
        </div>
      )}
    </PageCard>
  );

  return (
    <DashboardLayout
      headerAction={
        bulkAddEnabled && canCreateHere ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBulkAddModalOpen(true)}>
            Add Exams
          </Button>
        ) : undefined
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
                  {(dayUntimedEvents.length > 0 || dayOspeOsce.length > 0) && (
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
                              onClick={() => { if (!isHold) openDetails(ev); }}
                              title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                              style={{
                                ...examBlockStyle(ev),
                                fontSize: 11,
                                lineHeight: "18px",
                                borderRadius: 3,
                                padding: "0 6px",
                                cursor: isHold ? "not-allowed" : "pointer",
                                opacity: isHold ? 0.5 : 1,
                              }}
                            >
                              {ev.shortName}
                            </div>
                          );
                        })}
                        {dayOspeOsce.map((o) => (
                          <div
                            key={`ospe-${o.id}`}
                            onClick={() => openOspeOsceDetails(o)}
                            title={`OSPE/OSCE: ${ospeOscePapersLabel(o)}`}
                            style={{
                              ...ospeOsceBlockStyle(o),
                              fontSize: 11,
                              lineHeight: "18px",
                              borderRadius: 3,
                              padding: "0 6px",
                              cursor: "pointer",
                            }}
                          >
                            OSPE/OSCE: {ospeOscePapersLabel(o)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={dayGridRef} style={{ display: "flex", border: "1px solid #f0f0f0", borderRadius: (dayUntimedEvents.length > 0 || dayOspeOsce.length > 0) ? "0 0 6px 6px" : 6, maxHeight: "70vh", overflowY: "auto" }}>
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
                        onClick={() => { if (!isHold) openDetails(ev); }}
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
                          cursor: isHold ? "not-allowed" : "pointer",
                          opacity: isHold ? 0.5 : 1,
                          zIndex: 2,
                        }}
                      >
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ev.shortName}
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
                  {weekDays.some((day) => (weekUntimedEventsByDate[day.format("YYYY-MM-DD")] || []).length > 0 || (ospeOsceByDate[day.format("YYYY-MM-DD")] || []).length > 0) && (
                    <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid #f0f0f0", paddingRight: weekScrollbarWidth }}>
                      <div style={{ fontSize: 10, color: "#bfbfbf", padding: "4px 6px", borderRight: "1px solid #f0f0f0" }}>All-day</div>
                      {weekDays.map((day) => {
                        const dateStr = day.format("YYYY-MM-DD");
                        const untimed = weekUntimedEventsByDate[dateStr] || [];
                        const ospeOsceForDay = ospeOsceByDate[dateStr] || [];
                        return (
                          <div key={dateStr} style={{ borderLeft: "1px solid #f0f0f0", padding: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                            {untimed.map((ev) => {
                              const isHold = ev.status === "hold";
                              return (
                                <div
                                  key={ev.id}
                                  onClick={() => { if (!isHold) openDetails(ev); }}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...examBlockStyle(ev),
                                    fontSize: 10,
                                    lineHeight: "16px",
                                    borderRadius: 3,
                                    padding: "0 4px",
                                    cursor: isHold ? "not-allowed" : "pointer",
                                    opacity: isHold ? 0.5 : 1,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {ev.shortName}
                                </div>
                              );
                            })}
                            {ospeOsceForDay.map((o) => (
                              <div
                                key={`ospe-${o.id}`}
                                onClick={() => openOspeOsceDetails(o)}
                                title={`OSPE/OSCE: ${ospeOscePapersLabel(o)}`}
                                style={{
                                  ...ospeOsceBlockStyle(o),
                                  fontSize: 10,
                                  lineHeight: "16px",
                                  borderRadius: 3,
                                  padding: "0 4px",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                OSPE/OSCE: {ospeOscePapersLabel(o)}
                              </div>
                            ))}
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
                                onClick={() => { if (!isHold) openDetails(ev); }}
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
                                  cursor: isHold ? "not-allowed" : "pointer",
                                  opacity: isHold ? 0.5 : 1,
                                  zIndex: 2,
                                }}
                              >
                                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {ev.shortName}
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
                <div style={{ border: "1px solid #f0f0f0", borderRadius: 6, overflow: "hidden" }}>
                  {/* Weekday header */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa" }}>
                    {WEEKDAYS.map((d) => (
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
                        const dayEvents = eventsByDate[dateStr] || [];
                        const dayOspeOsceEntries = ospeOsceByDate[dateStr] || [];
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
                              height: 110,
                              minHeight: 0,
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              borderTop: "1px solid #f0f0f0",
                              borderLeft: "1px solid #f0f0f0",
                              padding: 6,
                              background: isDragOver ? "#e8f7f4" : inMonth ? "#fff" : "#fafafa",
                              opacity: inMonth ? 1 : 0.5,
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

                            <div style={{
                              flexShrink: 0,
                              fontSize: 12,
                              fontWeight: isToday ? 700 : 400,
                              color: isToday ? "#1AB394" : "#262626",
                              marginBottom: 4,
                            }}>
                              {isToday ? (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 20, height: 20, borderRadius: "50%", background: "#1AB394", color: "#fff",
                                }}>
                                  {day.date()}
                                </span>
                              ) : day.date()}
                            </div>

                            <div className="timetable-thin-scroll" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                              {dayEvents.map((ev) => {
                                const isHold = ev.status === "hold";
                                const isDraggable = canReschedule && (!isPastEvent(ev) || canEditPastEvents);
                                return (
                                <div
                                  key={ev.id}
                                  draggable={isDraggable}
                                  onDragStart={onDragStart(ev.id)}
                                  onClick={(e) => { e.stopPropagation(); openDetails(ev); }}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...examBlockStyle(ev),
                                    fontSize: 11,
                                    lineHeight: "18px",
                                    height: 18,
                                    flexShrink: 0,
                                    alignSelf: "flex-start",
                                    borderRadius: 3,
                                    padding: "0 6px",
                                    whiteSpace: "nowrap",
                                    cursor: isDraggable ? "grab" : "pointer",
                                    opacity: reschedulingId === ev.id ? 0.5 : isHold ? 0.5 : 1,
                                  }}
                                >
                                  {ev.shortName}
                                </div>
                                );
                              })}
                              {dayOspeOsceEntries.map((o) => (
                                <div
                                  key={`ospe-${o.id}`}
                                  onClick={(e) => { e.stopPropagation(); openOspeOsceDetails(o); }}
                                  title={`OSPE/OSCE: ${ospeOscePapersLabel(o)}`}
                                  style={{
                                    ...ospeOsceBlockStyle(o),
                                    fontSize: 11,
                                    lineHeight: "18px",
                                    height: 18,
                                    flexShrink: 0,
                                    alignSelf: "flex-start",
                                    borderRadius: 3,
                                    padding: "0 6px",
                                    whiteSpace: "nowrap",
                                    cursor: "pointer",
                                  }}
                                >
                                  OSPE/OSCE: {ospeOscePapersLabel(o)}
                                </div>
                              ))}
                            </div>
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
                  title: "Date",
                  render: () =>
                    dateTimeEditing && canEditDate ? (
                      <DatePicker
                        size="small"
                        style={{ width: "100%" }}
                        format="YYYY-MM-DD"
                        value={dateDraft}
                        onChange={setDateDraft}
                      />
                    ) : detailsEvent.eventDate ? (
                      dayjs(detailsEvent.eventDate).format("DD MMM YYYY")
                    ) : (
                      "Not set"
                    ),
                },
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
        destroyOnClose
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
        existingEvents={events}
        onCancel={() => setAddModalOpen(false)}
        onSuccess={handleAddModalSuccess}
        onError={setError}
      />

      {bulkAddEnabled && (
        <AddExamsModal
          open={bulkAddModalOpen}
          existingEvents={events}
          onCancel={() => setBulkAddModalOpen(false)}
          onSuccess={handleBulkAddSuccess}
          onError={setError}
        />
      )}

      {/* OSPE/OSCE details — read-only summary; editing lives on the
          dedicated OSPE/OSCE page since it's scheduled independently of
          Theory events (no venue/time/staff/equipment assignment here). */}
      <Modal
        title={
          ospeOsceDetails && (
            <Space align="center">
              {`OSPE/OSCE — ${ospeOsceClassLabel(ospeOsceDetails)}`}
              <Tag color={STATUS_TAG_COLORS[ospeOsceDetails.status]} style={{ marginBottom: 0 }}>
                {STATUS_LABELS[ospeOsceDetails.status]}
              </Tag>
            </Space>
          )
        }
        open={!!ospeOsceDetails}
        onCancel={() => setOspeOsceDetails(null)}
        footer={null}
        destroyOnClose
        centered
      >
        {ospeOsceDetails && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <div>
              <Text type="secondary">Course/Papers: </Text>
              {ospeOscePapersLabel(ospeOsceDetails) || "—"}
            </div>
            <div>
              <Text type="secondary">Exam Type: </Text>
              {ospeOsceDetails.examType?.fullName ?? "—"}
            </div>
            <div>
              <Text type="secondary">Venue: </Text>
              {ospeOsceDetails.venue?.name ?? "—"}
            </div>
            <div>
              <Text type="secondary">Date Range: </Text>
              {ospeOsceDateRangeLabel(ospeOsceDetails)}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Manage this entry from the OSPE/OSCE page.
            </Text>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { Button, Alert, Typography, Spin, Empty, Modal, Descriptions, Tag, Segmented } from "antd";
import { LeftOutlined, RightOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getEvents, updateEvent } from "../../api/eventsApi";
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


const DAY_ROW_HEIGHT = 56; // px per hour in Day/Week views

const WEEKDAY_FULL_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Day and Week views both use half-hour gridlines/labels at half the row
// height (28px per 30 min = 56px per hour) — event positioning math is
// unaffected, since it's still computed off DAY_ROW_HEIGHT per hour.
const HALF_HOUR_HEIGHT = DAY_ROW_HEIGHT / 2;
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i); // i*30 minutes

// No per-exam coloring — every block uses the same neutral outlined style.
const EXAM_BLOCK_STYLE = { background: "transparent", color: "#262626", border: "1px solid #d9d9d9" };

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

  const [viewMode, setViewMode] = useState("month");
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf("month"));
  const [currentYear, setCurrentYear] = useState(() => dayjs().startOf("year"));
  const [currentWeekStart, setCurrentWeekStart] = useState(() => mondayOf(dayjs()));
  const [currentDay, setCurrentDay] = useState(() => dayjs().startOf("day"));
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [detailsEvent, setDetailsEvent] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
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
        const { data } = await getEvents();
        setAllEvents(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const events = allEvents;

  const canCreateHere = can("event.create") || can("event.create-departmental");

  // Holding Area holds every event still in Hold status — a Hold event with a
  // full date/time also appears on the calendar below (faded, non-clickable)
  // simultaneously, until time + all three resource types get it to Scheduled.
  const holdEvents = useMemo(
    () => events.filter((e) => e.status === "hold").sort((a, b) => a.fullName.localeCompare(b.fullName)),
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
              onClick={() => setDetailsEvent(ev)}
              style={{
                background: "#f0f0f0",
                border: "1px solid #d9d9d9",
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
                              onClick={() => { if (!isHold) setDetailsEvent(ev); }}
                              title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                              style={{
                                ...EXAM_BLOCK_STYLE,
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
                        onClick={() => { if (!isHold) setDetailsEvent(ev); }}
                        title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                        style={{
                          position: "absolute",
                          top: (ev.startMin / 60) * DAY_ROW_HEIGHT,
                          height: Math.max(((ev.endMin - ev.startMin) / 60) * DAY_ROW_HEIGHT - 2, 18),
                          left: `calc(${(ev.colIndex / ev.totalCols) * 100}% + 2px)`,
                          width: `calc(${100 / ev.totalCols}% - 4px)`,
                          ...EXAM_BLOCK_STYLE,
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
                                  onClick={() => { if (!isHold) setDetailsEvent(ev); }}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...EXAM_BLOCK_STYLE,
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
                                onClick={() => { if (!isHold) setDetailsEvent(ev); }}
                                title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                style={{
                                  position: "absolute",
                                  top: (ev.startMin / 60) * DAY_ROW_HEIGHT,
                                  height: Math.max(((ev.endMin - ev.startMin) / 60) * DAY_ROW_HEIGHT - 2, 16),
                                  left: `calc(${(ev.colIndex / ev.totalCols) * 100}% + 1px)`,
                                  width: `calc(${100 / ev.totalCols}% - 2px)`,
                                  ...EXAM_BLOCK_STYLE,
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
                                return (
                                <div
                                  key={ev.id}
                                  draggable={canReschedule}
                                  onDragStart={onDragStart(ev.id)}
                                  onClick={(e) => { e.stopPropagation(); if (!isHold) setDetailsEvent(ev); }}
                                  title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                  style={{
                                    ...EXAM_BLOCK_STYLE,
                                    fontSize: 11,
                                    lineHeight: "18px",
                                    height: 18,
                                    flexShrink: 0,
                                    alignSelf: "flex-start",
                                    borderRadius: 3,
                                    padding: "0 6px",
                                    whiteSpace: "nowrap",
                                    cursor: canReschedule ? "grab" : (isHold ? "not-allowed" : "pointer"),
                                    opacity: reschedulingId === ev.id ? 0.5 : isHold ? 0.5 : 1,
                                  }}
                                >
                                  {ev.shortName}
                                </div>
                                );
                              })}
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
        title={detailsEvent?.fullName}
        open={!!detailsEvent}
        onCancel={() => setDetailsEvent(null)}
        footer={null}
        centered
      >
        {detailsEvent && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 8 }}>
            <Descriptions.Item label="Exam Type">{detailsEvent.examType?.fullName ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Date">
              {detailsEvent.eventDate ? dayjs(detailsEvent.eventDate).format("DD MMM YYYY") : "Not set"}
            </Descriptions.Item>
            <Descriptions.Item label="Time">
              {detailsEvent.startTime && detailsEvent.endTime
                ? `${detailsEvent.startTime} – ${detailsEvent.endTime}`
                : "Not set"}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_TAG_COLORS[detailsEvent.status]}>{STATUS_LABELS[detailsEvent.status]}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Quick-add Event modal, opened from a Month view day box's "+" icon */}
      <EventFormModal
        open={addModalOpen}
        editingRecord={null}
        initialDate={addModalDate}
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
    </DashboardLayout>
  );
}

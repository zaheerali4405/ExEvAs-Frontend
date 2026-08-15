import { useState, useEffect, useMemo, useRef } from "react";
import { Button, Alert, Typography, Spin, Empty, Modal, Descriptions, Tag, Segmented } from "antd";
import { LeftOutlined, RightOutlined, PlusOutlined, BgColorsOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getEvents, updateEvent } from "../../api/eventsApi";
import { getEventCategories } from "../../api/eventCategoriesApi";
import { useAuth } from "../../context/AuthContext";
import EventFormModal from "../events/EventFormModal";

const { Title, Text } = Typography;

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

// Event blocks are colored entirely by their Event Category — admin-configured
// in System Settings, with a deterministic palette fallback when unset.
const CATEGORY_PALETTE = [
  "#2563EB", "#0F766E", "#F59E0B", "#7C3AED", "#E84D7F", "#16A085", "#E67E22", "#2C3E50",
];
function resolveColor(id, color, palette = CATEGORY_PALETTE) {
  return color || palette[(id ?? 0) % palette.length];
}
function eventCategoryColor(eventCategory) {
  return resolveColor(eventCategory?.id ?? 0, eventCategory?.color, CATEGORY_PALETTE);
}

// Darker shade of a category color, used as the background for the small
// count badge nested inside a category's (light-tinted) Tag.
function darkenColor(hex, factor = 0.7) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) * factor);
  const g = Math.round(((num >> 8) & 0xff) * factor);
  const b = Math.round((num & 0xff) * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Lighter shade of a category color, blended toward white — used for Hold
// events on the calendar to visually mark them as not-yet-actionable.
function lightenColor(hex, factor = 0.55) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * factor);
  const g = Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * factor);
  const b = Math.round((num & 0xff) + (255 - (num & 0xff)) * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const DAY_ROW_HEIGHT = 56; // px per hour in Day view
const DAY_HOURS = Array.from({ length: 24 }, (_, h) => h);

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

export default function TimetablePage() {
  const { can } = useAuth();
  const canReschedule = can("event.update");

  const [viewMode, setViewMode] = useState("month");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf("month"));
  const [currentYear, setCurrentYear] = useState(() => dayjs().startOf("year"));
  const [currentDay, setCurrentDay] = useState(() => dayjs().startOf("day"));
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [detailsEvent, setDetailsEvent] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDate, setAddModalDate] = useState(null);
  const [legendModalOpen, setLegendModalOpen] = useState(false);
  const [eventCategories, setEventCategories] = useState([]);
  const dayGridRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getEvents();
        setEvents(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetched once for the color legend modal — lists every Event Category, not
  // just those currently appearing on the calendar.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await getEventCategories();
        setEventCategories(data);
      } catch {
        // Legend is a secondary view — silently skip if it fails to load.
      }
    })();
  }, []);

  // Holding Area holds every event still in Hold status — a Hold event with a
  // full date/time also appears on the calendar below (lighter, non-clickable)
  // simultaneously, until time + all three resource types get it to Scheduled.
  const holdEvents = useMemo(
    () => events.filter((e) => e.status === "hold").sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [events]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!e.eventDate || !e.startTime || !e.endTime) return;
      const key = dayjs(e.eventDate).format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  const weeks = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  // Year view: for each month, Event Category → count of events scheduled that month.
  const yearMonthSummaries = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const monthDate = currentYear.month(monthIdx);
      const inMonthEvents = events.filter(
        (e) => e.eventDate && dayjs(e.eventDate).year() === currentYear.year() && dayjs(e.eventDate).month() === monthIdx
      );
      const byCategory = new Map();
      inMonthEvents.forEach((e) => {
        const cat = e.eventCategory;
        if (!cat) return;
        if (!byCategory.has(cat.id)) byCategory.set(cat.id, { id: cat.id, name: cat.name, color: cat.color, priorityLevel: cat.priorityLevel ?? 0, count: 0 });
        byCategory.get(cat.id).count += 1;
      });
      return {
        monthIdx,
        monthDate,
        total: inMonthEvents.length,
        categories: Array.from(byCategory.values()).sort((a, b) => a.name.localeCompare(b.name)),
      };
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
    setEvents((prev) => [data, ...prev]);
    setAddModalOpen(false);
  };

  // Day view: only events with both a date and a full time slot can be
  // positioned on the hour grid — Hold-status events stay in the Holding Area.
  const dayEventsLayout = useMemo(() => {
    const dateStr = currentDay.format("YYYY-MM-DD");
    const scoped = events.filter(
      (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && e.startTime && e.endTime
    );
    return layoutDayEvents(scoped);
  }, [events, currentDay]);

  // Pre-scroll the Day view's hour grid to 8:00 whenever it's opened or the
  // date changes, so the working day is visible without an extra scroll.
  useEffect(() => {
    if (viewMode === "day" && dayGridRef.current) {
      dayGridRef.current.scrollTop = 8 * DAY_ROW_HEIGHT;
    }
  }, [viewMode, currentDay]);

  const handleReschedule = async (eventId, newDate) => {
    setReschedulingId(eventId);
    setError("");
    try {
      const { data } = await updateEvent(eventId, { eventDate: newDate });
      setEvents((prev) => prev.map((e) => (e.id === eventId ? data : e)));
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

  return (
    <DashboardLayout>
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

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: "Year", value: "year" },
            { label: "Year-2", value: "year2" },
            { label: "Month", value: "month" },
            { label: "Day", value: "day" },
          ]}
        />
        <Button icon={<BgColorsOutlined />} onClick={() => setLegendModalOpen(true)}>
          Legend
        </Button>
      </div>

      {viewMode === "year" ? (
        <PageCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button icon={<LeftOutlined />} onClick={() => setCurrentYear((y) => y.subtract(1, "year"))} />
              <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 100, textAlign: "center" }}>
                {currentYear.format("YYYY")}
              </Title>
              <Button icon={<RightOutlined />} onClick={() => setCurrentYear((y) => y.add(1, "year"))} />
            </div>
            <Button onClick={() => setCurrentYear(dayjs().startOf("year"))}>This Year</Button>
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
                    {summary.categories.length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>No events</Text>
                    ) : (
                      [...summary.categories]
                        .sort((a, b) => b.priorityLevel - a.priorityLevel)
                        .map((c) => (
                          <Tag
                            key={c.id}
                            color={eventCategoryColor(c)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              marginRight: 12,
                              fontSize: 12,
                            }}
                          >
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: darkenColor(eventCategoryColor(c)),
                              color: "#fff",
                              borderRadius: 999,
                              padding: "0 7px",
                              height: 16,
                              lineHeight: "16px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              {c.count}
                            </span>
                            {c.name}
                          </Tag>
                        ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>
      ) : viewMode === "year2" ? (
        <PageCard style={{ background: "#F4F3EF" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A09D95", marginBottom: 6 }}>
                Examination Office · Year Overview
              </div>
              <div style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: "#26241F" }}>
                {currentYear.format("YYYY")}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                onClick={() => setCurrentYear(dayjs().startOf("year"))}
                style={{ fontSize: 13, fontWeight: 700, color: "#3A382F", background: "#fff", border: "1px solid #E4E2DB", borderRadius: 10, padding: "9px 16px", height: "auto" }}
              >
                This year
              </Button>
              <Button
                aria-label="Previous year"
                onClick={() => setCurrentYear((y) => y.subtract(1, "year"))}
                style={{ fontSize: 16, fontWeight: 700, color: "#3A382F", background: "#fff", border: "1px solid #E4E2DB", borderRadius: 10, width: 38, height: 38, padding: 0 }}
              >
                ‹
              </Button>
              <Button
                aria-label="Next year"
                onClick={() => setCurrentYear((y) => y.add(1, "year"))}
                style={{ fontSize: 16, fontWeight: 700, color: "#3A382F", background: "#fff", border: "1px solid #E4E2DB", borderRadius: 10, width: 38, height: 38, padding: 0 }}
              >
                ›
              </Button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
              {yearMonthSummaries.map((summary) => (
                <div
                  key={summary.monthIdx}
                  onClick={() => goToMonth(summary.monthDate)}
                  style={{
                    background: "#fff",
                    border: "1px solid #ECEBE4",
                    borderRadius: 18,
                    padding: "16px 16px 17px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#26241F", letterSpacing: "-0.01em" }}>
                        {MONTH_NAMES[summary.monthIdx]}
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#A8A59D", marginTop: 2 }}>
                        {summary.total} events
                      </div>
                    </div>
                    <span style={{
                      flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 34, height: 30, padding: "0 10px", borderRadius: 9, fontSize: 15, fontWeight: 800,
                      fontVariantNumeric: "tabular-nums", background: "#F1F0EA", color: "#3A382F",
                    }}>
                      {summary.total}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {summary.categories.length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>No events</Text>
                    ) : (
                      summary.categories.map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "#5A574F" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ flex: "0 0 auto", width: 9, height: 9, borderRadius: 3, background: eventCategoryColor(c) }} />
                            {c.name}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: 13, color: "#3A382F", fontVariantNumeric: "tabular-nums" }}>
                            {c.count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>
            Each card totals the year's scheduled events by type. Click a month to open its detailed calendar.
          </Text>
        </PageCard>
      ) : viewMode === "day" ? (
        <PageCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button icon={<LeftOutlined />} onClick={() => setCurrentDay((d) => d.subtract(1, "day"))} />
              <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 220, textAlign: "center" }}>
                {currentDay.format("dddd, DD MMMM YYYY")}
              </Title>
              <Button icon={<RightOutlined />} onClick={() => setCurrentDay((d) => d.add(1, "day"))} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setCurrentDay(dayjs().startOf("day"))}>Today</Button>
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : (
            <div ref={dayGridRef} style={{ display: "flex", border: "1px solid #f0f0f0", borderRadius: 6, maxHeight: "70vh", overflowY: "auto" }}>
              {/* Time labels */}
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #f0f0f0" }}>
                {DAY_HOURS.map((h) => (
                  <div
                    key={h}
                    style={{
                      height: DAY_ROW_HEIGHT,
                      boxSizing: "border-box",
                      borderTop: h === 0 ? "none" : "1px solid #f0f0f0",
                      fontSize: 11,
                      color: "#8c8c8c",
                      padding: "2px 6px",
                    }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Hour grid + event blocks */}
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                {DAY_HOURS.map((h) => (
                  <div key={h} style={{ height: DAY_ROW_HEIGHT, boxSizing: "border-box", borderTop: h === 0 ? "none" : "1px solid #f0f0f0" }} />
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
                  const bgColor = eventCategoryColor(ev.eventCategory);
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
                      background: isHold ? lightenColor(bgColor) : bgColor,
                      color: "#fff",
                      borderRadius: 4,
                      padding: "3px 6px",
                      fontSize: 11,
                      overflow: "hidden",
                      cursor: isHold ? "default" : "pointer",
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
          )}
        </PageCard>
      ) : (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap-reverse" }}>
          {/* Calendar grid */}
          <PageCard style={{ flex: "1 1 640px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <Button icon={<LeftOutlined />} onClick={() => setCurrentMonth((m) => m.subtract(1, "month"))} />
                <Title level={5} style={{ margin: "0 12px", display: "inline-block", minWidth: 160, textAlign: "center" }}>
                  {currentMonth.format("MMMM YYYY")}
                </Title>
                <Button icon={<RightOutlined />} onClick={() => setCurrentMonth((m) => m.add(1, "month"))} />
              </div>
              <Button onClick={() => setCurrentMonth(dayjs().startOf("month"))}>Today</Button>
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
                          {can("event.create") && (
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
                              const bgColor = eventCategoryColor(ev.eventCategory);
                              return (
                              <div
                                key={ev.id}
                                draggable={canReschedule}
                                onDragStart={onDragStart(ev.id)}
                                onClick={(e) => { e.stopPropagation(); if (!isHold) setDetailsEvent(ev); }}
                                title={isHold ? `${ev.fullName} (Hold)` : ev.fullName}
                                style={{
                                  background: isHold ? lightenColor(bgColor) : bgColor,
                                  color: "#fff",
                                  fontSize: 11,
                                  lineHeight: "18px",
                                  height: 18,
                                  flexShrink: 0,
                                  alignSelf: "flex-start",
                                  borderRadius: 3,
                                  padding: "0 6px",
                                  whiteSpace: "nowrap",
                                  cursor: canReschedule ? "grab" : (isHold ? "default" : "pointer"),
                                  opacity: reschedulingId === ev.id ? 0.5 : 1,
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

          {/* Holding area */}
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
                      background: lightenColor(eventCategoryColor(ev.eventCategory)),
                      borderRadius: 4,
                      padding: "6px 10px",
                      cursor: canReschedule ? "grab" : "pointer",
                      opacity: reschedulingId === ev.id ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{ev.eventCategory?.name ?? "—"}</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{ev.shortName}</div>
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        </div>
      )}

      {/* Color legend modal — Event Category colors drive every block's background */}
      <Modal
        title="Color Legend"
        open={legendModalOpen}
        onCancel={() => setLegendModalOpen(false)}
        footer={null}
        centered
      >
        <Text strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
          Event Categories <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(block background)</Text>
        </Text>
        {eventCategories.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 13 }}>No event categories found.</Text>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {eventCategories.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: eventCategoryColor(c) }} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </Modal>

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
            <Descriptions.Item label="Event Category">{detailsEvent.eventCategory?.name ?? "—"}</Descriptions.Item>
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
    </DashboardLayout>
  );
}

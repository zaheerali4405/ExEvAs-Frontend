import { useState, useEffect, useMemo, useRef } from "react";
import { Modal, Typography, Empty, Spin, InputNumber, Alert, Button } from "antd";
import { EllipsisOutlined, DownOutlined, UpOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getVenues } from "../../api/venuesApi";
import { getClassStrength } from "../../api/classesApi";
import { getEventVenues, assignEventVenue, updateEventVenue, unassignEventVenue } from "../../api/eventVenuesApi";
import { getEvent, updateEventTime } from "../../api/eventsApi";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

const DAY_ROW_HEIGHT = 52; // px per hour
const HALF_HOUR_HEIGHT = DAY_ROW_HEIGHT / 2;
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i);
const DEFAULT_DURATION_MIN = 180; // 3 hours, used only when a drop's own position can't be read
const TIME_COL_WIDTH = 60;
const MIN_VENUE_COL_WIDTH = 130;
const GRID_BORDER = "#d9d9d9";
const HEADER_ROW_HEIGHT = 46;
const STRIP_ROW_HEIGHT = 34;
// 07:30 to 17:30 (10 hours) visible by default without scrolling — the full
// 24h grid is still there above/below on scroll.
const VISIBLE_GRID_HEIGHT = HALF_HOUR_HEIGHT * 20;
const INITIAL_SCROLL_HALF_HOURS = 15; // 07:30 is the 15th half-hour slot after 00:00

// Same color source as the calendar's own examBlockStyle — the event's
// (category × exam scope) pair, resolved server-side into event.colors.
function blockColor(ev) {
  return {
    bg: ev.colors?.backgroundColor || "#f0f0f0",
    text: ev.colors?.textColor || "#262626",
    border: ev.colors?.borderColor || "#bfbfbf",
  };
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Either side missing a time is conservatively treated as occupying the
// whole day — mirrors EventVenuesService.getAvailability's own rule
// server-side, so this client-side check agrees with what the backend
// would compute.
function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  if (aStart != null && aEnd != null && bStart != null && bEnd != null) {
    return aStart < bEnd && bStart < aEnd;
  }
  return true;
}

// Groups a venue's timed events into overlap clusters (transitive — same
// technique the calendar's own layoutDayEvents uses) and packs each
// cluster's blocks left-to-right, each sized to its own seats/capacity
// fraction of the column's width, so two events sharing a venue at
// overlapping times sit side by side instead of on top of each other.
function packTimedEvents(events, capacity) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const clusters = [];
  let current = [];
  let clusterEnd = -Infinity;
  sorted.forEach((e) => {
    if (current.length === 0 || e.startMin < clusterEnd) {
      current.push(e);
      clusterEnd = Math.max(clusterEnd, e.endMin);
    } else {
      clusters.push(current);
      current = [e];
      clusterEnd = e.endMin;
    }
  });
  if (current.length) clusters.push(current);

  const positioned = [];
  clusters.forEach((cluster) => {
    let cumulative = 0;
    cluster.forEach((e) => {
      const widthPct = capacity > 0 ? Math.min((e.seats / capacity) * 100, 100) : 100;
      positioned.push({ ...e, leftPct: cumulative, widthPct });
      cumulative += widthPct;
    });
  });
  return positioned;
}

// Per-day resource allocation view for the Datesheet's Month view — opened
// by clicking a day box's own date number (clicking elsewhere in the box
// still opens Day view). Lets a resource allocator drag a pending event
// from this day's own Holding Area onto a Static/Mobile venue's timeline,
// stretch its time slot, and adjust its reserved seats — all backed by the
// same event-venues endpoints the per-event details modal already uses.
export default function VenueAllocationModal({ open, date, events, onCancel, onEventUpdated, onOpenDetails }) {
  const { can } = useAuth();
  const canAssignVenues = can("event-venue.assign");
  const canEditEventTime = can("event.update-time");

  // Shown inside the modal itself, not the main calendar page's own Alert —
  // that Alert sits behind this modal's overlay, so a resource allocator
  // would have to close the modal just to read what went wrong.
  const [modalError, setModalError] = useState("");
  const [venues, setVenues] = useState([]);
  const [venuesById, setVenuesById] = useState(new Map());
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [eventVenuesByEventId, setEventVenuesByEventId] = useState({});
  const [strengthByClass, setStrengthByClass] = useState({});
  const [loadingPlacements, setLoadingPlacements] = useState(true);
  // Latches false once the modal has content, so a background refresh never
  // swaps the whole body back to a spinner mid-scheduling. Driven by the
  // fetches themselves rather than by watching the loading flags — on
  // reopen those still read false from the previous open for one pass, which
  // cleared this too early and left the grid unscrolled.
  const [initialLoading, setInitialLoading] = useState(true);
  const venuesDoneRef = useRef(false);
  const placementsDoneRef = useRef(false);
  const markLoadedIfReady = () => {
    if (venuesDoneRef.current && placementsDoneRef.current) setInitialLoading(false);
  };
  // Positions the grid at 07:30 once per open — not on every dependency
  // change, or dropping an untimed event would yank the view back.
  const didInitialScrollRef = useRef(false);
  // { eventId, from: "holding" | "venue" | "split", venueId?, partKey?, seats }
  const [dragged, setDragged] = useState(null);
  const [dragOverVenueId, setDragOverVenueId] = useState(null);
  const [dragOverHolding, setDragOverHolding] = useState(false);
  const [dragOverSplit, setDragOverSplit] = useState(false);
  const [splitOpen, setSplitOpen] = useState(true);
  // Parts an exam was cut into by hand before any of it was placed, e.g.
  // { 12: [50, 50] }. Staging only — it lives as long as the modal, because
  // the moment a part lands in a venue the remainder is derived from the
  // class strength instead. See splitParts below.
  const [manualSplit, setManualSplit] = useState({});
  const [resizingId, setResizingId] = useState(null);
  const [liveResize, setLiveResize] = useState(null); // { id, startMin, endMin } while dragging a handle
  const [seatsDraft, setSeatsDraft] = useState({}); // { [blockKey]: number }
  const [editingSeatsId, setEditingSeatsId] = useState(null); // a blockKey
  // A resize ends with a mouseup that the browser follows with a click on
  // the block itself (the pointer has usually left the thin handle by then),
  // which would open the details modal. Stamped here so the block's own
  // onClick can tell a real click from the tail of a drag.
  const resizeEndedAtRef = useRef(0);
  const outerScrollRef = useRef(null); // the single scrollbar for header + strip + timed rows together
  const rowsWrapperRef = useRef(null); // the timed-rows-only flex row (time col + venue cols)

  const dateStr = date ? date.format("YYYY-MM-DD") : null;

  // Only events already dated to this exact day, and only under a category
  // that actually needs a venue — nothing else has any business in this view.
  const dayEvents = useMemo(() => {
    if (!dateStr) return [];
    return events.filter(
      (e) => e.eventDate && dayjs(e.eventDate).format("YYYY-MM-DD") === dateStr && e.rules?.needsVenue
    );
  }, [events, dateStr]);

  useEffect(() => {
    if (!open) return;
    setLoadingVenues(true);
    getVenues()
      .then(({ data }) => {
        const active = data.filter((v) => v.isActive && (v.category === "static" || v.category === "mobile"));
        const staticVenues = active.filter((v) => v.category === "static").sort((a, b) => a.name.localeCompare(b.name));
        const mobileVenues = active.filter((v) => v.category === "mobile").sort((a, b) => a.name.localeCompare(b.name));
        setVenues([...staticVenues, ...mobileVenues]);
        setVenuesById(new Map(active.map((v) => [v.id, v])));
      })
      .catch(() => setModalError("Could not load venues."))
      .finally(() => {
        setLoadingVenues(false);
        venuesDoneRef.current = true;
        markLoadedIfReady();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fresh every time the modal opens (or the day's own event list changes) —
  // each relevant event's current venue placement, and its class's student
  // strength for the seats-reserved default.
  // Keyed on the day's event ids, not the array itself: saving a time or a
  // venue hands back a new events array from the parent, and depending on
  // that identity refetched every placement and class strength on every
  // single edit — which is what made the modal blink.
  const dayEventIdsKey = useMemo(
    () => dayEvents.map((e) => e.id).sort((a, b) => a - b).join(","),
    [dayEvents]
  );

  useEffect(() => {
    if (!open) return;
    if (dayEvents.length === 0) {
      setEventVenuesByEventId({});
      setStrengthByClass({});
      setLoadingPlacements(false);
      placementsDoneRef.current = true;
      markLoadedIfReady();
      return;
    }
    setLoadingPlacements(true);
    (async () => {
      const venueEntries = await Promise.all(
        dayEvents.map((ev) => getEventVenues(ev.id).then(({ data }) => [ev.id, data]).catch(() => [ev.id, []]))
      );
      setEventVenuesByEventId(Object.fromEntries(venueEntries));

      // A standalone exam has no class, so there is no strength to fetch —
      // it carries its own expected candidate count instead.
      const classKeys = Array.from(
        new Set(
          dayEvents
            .filter((ev) => ev.programId != null && ev.degreeLevelId != null && ev.sessionId != null)
            .map((ev) => `${ev.programId}-${ev.degreeLevelId}-${ev.sessionId}`)
        )
      );
      const strengthEntries = await Promise.all(
        classKeys.map((key) => {
          const [programId, degreeLevelId, sessionId] = key.split("-").map(Number);
          return getClassStrength(programId, degreeLevelId, sessionId)
            .then(({ data }) => [key, data.strength])
            .catch(() => [key, 0]);
        })
      );
      setStrengthByClass(Object.fromEntries(strengthEntries));
      setLoadingPlacements(false);
      placementsDoneRef.current = true;
      markLoadedIfReady();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayEventIdsKey]);

  useEffect(() => {
    if (!open) {
      setInitialLoading(true);
      venuesDoneRef.current = false;
      placementsDoneRef.current = false;
      didInitialScrollRef.current = false;
      setSeatsDraft({});
      setDragged(null);
      setResizingId(null);
      setLiveResize(null);
      setEditingSeatsId(null);
      setManualSplit({});
      setSplitOpen(true);
      setModalError("");
    }
  }, [open]);

  const classKeyOf = (ev) => `${ev.programId}-${ev.degreeLevelId}-${ev.sessionId}`;

  const decorated = useMemo(() => {
    return dayEvents.map((ev) => {
      const placements = eventVenuesByEventId[ev.id] || [];
      // How many people have to be seated: our own students come from the
      // class roster, a standalone exam's candidates from the count entered
      // on the exam itself.
      const strength =
        ev.examType?.linksCoursePapers === false
          ? (ev.expectedCandidates ?? 0)
          : (strengthByClass[classKeyOf(ev)] ?? 0);
      const assignedSeats = placements.reduce((sum, p) => sum + (p.seats || 0), 0);
      const isLive = resizingId === ev.id && liveResize;
      return {
        ...ev,
        placements,
        strength,
        assignedSeats,
        // What is still unseated. An exam with seats in one venue and a
        // remainder here is a split in progress — nothing stores that, it
        // falls out of the class strength minus what is already assigned,
        // so it survives closing and reopening the modal on its own.
        remainingSeats: Math.max(strength - assignedSeats, 0),
        allowsMultipleVenues: !!ev.rules?.allowsMultipleVenues,
        needsTimeSlot: !!ev.rules?.needsTimeSlot,
        startMin: isLive ? liveResize.startMin : timeToMinutes(ev.startTime),
        endMin: isLive ? liveResize.endMin : timeToMinutes(ev.endTime),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayEvents, eventVenuesByEventId, strengthByClass, resizingId, liveResize]);

  // One entry per (event, venue) rather than per event — a split exam holds
  // a placement in each of its venues, and each is dragged, re-timed and
  // re-seated on its own.
  const placedBlocks = useMemo(
    () =>
      decorated.flatMap((ev) =>
        ev.placements.map((placement) => ({
          ...ev,
          placement,
          blockKey: `${ev.id}-${placement.venueId}`,
          seats: seatsDraft[`${ev.id}-${placement.venueId}`] ?? placement.seats,
        }))
      ),
    [decorated, seatsDraft]
  );

  // Nothing assigned anywhere, and not pre-split into parts by hand.
  const holdingEvents = useMemo(
    () => decorated.filter((ev) => ev.assignedSeats === 0 && !manualSplit[ev.id]),
    [decorated, manualSplit]
  );

  // The Split Area's contents. Two ways in: an exam already holding seats in
  // some venue with students still unseated (derived, permanent), or one a
  // scheduler split by hand before placing any of it (staged in manualSplit,
  // which only lives as long as the modal — the moment the first part lands
  // in a venue the derived remainder takes over).
  const splitParts = useMemo(() => {
    const parts = [];
    decorated.forEach((ev) => {
      if (ev.assignedSeats > 0) {
        // Only an exam that may use several venues has anywhere for a
        // remainder to go. For a single-venue one, reserving fewer seats
        // than the class holds is the allocator's own business, not a split
        // waiting to be finished.
        if (ev.remainingSeats > 0 && ev.allowsMultipleVenues) {
          parts.push({ ev, key: `remainder-${ev.id}`, seats: ev.remainingSeats, manualIndex: null });
        }
        return;
      }
      const manual = manualSplit[ev.id];
      if (manual) {
        manual.forEach((seats, i) => {
          parts.push({ ev, key: `manual-${ev.id}-${i}`, seats, manualIndex: i });
        });
      }
    });
    return parts;
  }, [decorated, manualSplit]);

  const placedByVenueId = useMemo(() => {
    const map = {};
    placedBlocks.forEach((block) => {
      const vId = block.placement.venueId;
      if (!map[vId]) map[vId] = [];
      map[vId].push(block);
    });
    return map;
  }, [placedBlocks]);

  // Seats already committed at this venue by blocks whose window overlaps
  // [startMin, endMin) — excludes the block being moved so re-checking its
  // own placement doesn't double-count it. Keyed by block rather than by
  // event, since a split exam legitimately holds a block in another venue.
  const reservedSeatsExcluding = (venueId, excludeBlockKey, startMin, endMin) =>
    (placedByVenueId[venueId] || [])
      .filter((block) => block.blockKey !== excludeBlockKey)
      .filter((block) => windowsOverlap(startMin, endMin, block.startMin, block.endMin))
      .reduce((sum, block) => sum + (block.seats || 0), 0);

  const onDragStartHolding = (ev) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    setDragged({ eventId: ev.id, from: "holding", seats: ev.strength });
  };

  // A placed block is dragged by its own handle, not the whole block —
  // the block itself still has to take clicks (details, seats) and a
  // draggable box swallows those on some browsers.
  const onDragStartPlaced = (block) => (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    setDragged({ eventId: block.id, from: "venue", venueId: block.placement.venueId, seats: block.seats });
  };

  const onDragStartSplitPart = (part) => (e) => {
    e.dataTransfer.effectAllowed = "move";
    setDragged({ eventId: part.ev.id, from: "split", partKey: part.key, manualIndex: part.manualIndex, seats: part.seats });
  };

  const refreshEvent = async (eventId) => {
    const [{ data: fresh }, { data: links }] = await Promise.all([
      getEvent(eventId),
      getEventVenues(eventId).catch(() => ({ data: [] })),
    ]);
    setEventVenuesByEventId((prev) => ({ ...prev, [eventId]: links }));
    onEventUpdated?.(fresh);
  };

  // Dropping a placed block back here releases that one venue. For a split
  // exam the other venue keeps its seats and the released ones reappear in
  // the Split Area, since the remainder is derived. An exam that ends up
  // with no venue at all also loses its time — it is back to being
  // unscheduled, not merely unplaced. A part still sitting in a venue keeps
  // the time, because time belongs to the exam, not to one placement.
  const onDropOnHolding = async (e) => {
    e.preventDefault();
    setDragOverHolding(false);
    if (!dragged || !canAssignVenues) return;
    const { eventId, from, venueId } = dragged;
    setDragged(null);
    const ev = decorated.find((d) => d.id === eventId);
    if (!ev) return;
    setModalError("");

    // A by-hand split that hasn't been placed yet is simply cancelled.
    if (from === "split") {
      if (manualSplit[eventId]) {
        setManualSplit((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
      }
      return;
    }
    if (from !== "venue" || venueId == null) return;

    try {
      await unassignEventVenue(ev.id, venueId);
      const stillPlaced = ev.placements.some((p) => p.venueId !== venueId);
      if (!stillPlaced && canEditEventTime && (ev.startTime || ev.endTime)) {
        await updateEventTime(ev.id, { startTime: null, endTime: null });
      }
      await refreshEvent(ev.id);
    } catch (err) {
      setModalError(err.response?.data?.message || "Could not remove this venue.");
    }
  };

  // Cutting an unplaced exam in two by hand. An odd strength leaves the
  // first part one seat larger.
  const onDropOnSplitArea = (e) => {
    e.preventDefault();
    setDragOverSplit(false);
    if (!dragged || !canAssignVenues) return;
    const { eventId, from } = dragged;
    setDragged(null);
    if (from !== "holding") return;
    const ev = decorated.find((d) => d.id === eventId);
    if (!ev) return;
    setModalError("");

    if (!ev.allowsMultipleVenues) {
      setModalError(
        `"${ev.shortName}" cannot be split — its exam category and scope do not allow multiple venues.`
      );
      return;
    }
    if (ev.strength < 2) {
      setModalError(`"${ev.shortName}" has too few students to split.`);
      return;
    }
    setManualSplit((prev) => ({
      ...prev,
      [ev.id]: [Math.ceil(ev.strength / 2), Math.floor(ev.strength / 2)],
    }));
  };

  // Converts a drop's own vertical position within the shared scroll
  // container into a half-hour-snapped minute offset — so an undated event
  // lands wherever it was actually dropped, not always at the same fixed
  // default slot (which previously made a second undated drop always
  // collide with whatever the first one landed on).
  const minutesFromDropEvent = (e) => {
    const rowsEl = rowsWrapperRef.current;
    if (!rowsEl) return null;
    // rowsWrapperRef is the plain (non-sticky) flex row holding the time
    // column and venue columns — its own getBoundingClientRect() always
    // reflects where it currently sits on screen, scrolled or not, so no
    // separate scrollTop bookkeeping is needed here.
    const rect = rowsEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const rawMinutes = (offsetY / DAY_ROW_HEIGHT) * 60;
    return Math.round(rawMinutes / 30) * 30;
  };

  const onDropOnVenue = (venue) => async (e) => {
    e.preventDefault();
    setDragOverVenueId(null);
    setModalError("");
    if (!dragged || !canAssignVenues) return;
    const ev = decorated.find((d) => d.id === dragged.eventId);
    const from = dragged.from;
    const fromVenueId = dragged.venueId ?? null;
    const draggedSeats = dragged.seats;
    const manualIndex = dragged.manualIndex ?? null;
    const blockKey = fromVenueId != null ? `${dragged.eventId}-${fromVenueId}` : null;
    const dropClientY = e.clientY;
    setDragged(null);
    if (!ev) return;

    if (from !== "venue" && ev.placements.some((p) => p.venueId === venue.id)) {
      setModalError(`"${ev.shortName}" already holds seats in "${venue.name}" — edit that block's seats instead.`);
      return;
    }

    // Where it was dropped decides the time, whether it came from the
    // Holding Area or from another venue — the drop position is the whole
    // point of the gesture. Keeping an existing time instead meant dropping
    // a timed event into a free slot still landed it on its old one, where
    // it then collided with whatever was already there.
    //
    // Its current duration is carried over; only a never-timed event falls
    // back to the default length. Without permission to change times the
    // event keeps whatever it has, and the capacity check below judges it
    // at that time.
    let startMin = null;
    let endMin = null;
    if (ev.needsTimeSlot) {
      const hasTime = ev.startMin != null && ev.endMin != null;
      const duration = hasTime ? ev.endMin - ev.startMin : DEFAULT_DURATION_MIN;
      const dropMinutes = minutesFromDropEvent({ clientY: dropClientY });

      if (canEditEventTime && dropMinutes != null) {
        startMin = Math.max(0, Math.min(dropMinutes, 24 * 60 - duration));
        endMin = startMin + duration;
      } else if (hasTime) {
        startMin = ev.startMin;
        endMin = ev.endMin;
      } else {
        setModalError(
          `"${ev.shortName}" has no time set yet, and you do not have permission to set one.`
        );
        return;
      }
    }
    // How many seats this drop is trying to place: the whole class from the
    // Holding Area, the part's own count from the Split Area, or whatever
    // the block already reserves when it is only being moved.
    const seats = from === "holding" ? ev.strength : draggedSeats;

    if (!seats || seats <= 0) {
      setModalError(`"${ev.shortName}"'s class has no students on record, so no seats can be reserved automatically — check its student roster first.`);
      return;
    }

    const reserved = reservedSeatsExcluding(venue.id, blockKey, startMin, endMin);
    const available = Math.max(venue.capacity - reserved, 0);

    const commit = async (seatsToPlace) => {
      try {
        if (ev.needsTimeSlot && (startMin !== ev.startMin || endMin !== ev.endMin)) {
          await updateEventTime(ev.id, { startTime: minutesToTime(startMin), endTime: minutesToTime(endMin) });
        }
        if (from === "venue" && fromVenueId != null && fromVenueId !== venue.id) {
          // Moving an existing block: repoint it rather than adding a second
          // placement. A drop back onto its own venue is only a re-time.
          await updateEventVenue(ev.id, fromVenueId, venue.id, seatsToPlace);
        } else if (from !== "venue") {
          await assignEventVenue(ev.id, venue.id, seatsToPlace);
          // A by-hand split has served its purpose once part of it is
          // placed — from here the remainder comes from the class strength.
          if (manualIndex != null) {
            setManualSplit((prev) => {
              const next = { ...prev };
              delete next[ev.id];
              return next;
            });
          }
        }
        await refreshEvent(ev.id);
      } catch (err) {
        setModalError(err.response?.data?.message || "Could not assign this venue.");
      }
    };

    if (seats <= available) {
      await commit(seats);
      return;
    }

    // Not everything fits. An exam whose pair allows several venues can be
    // split: as many as fit go in here, the rest waits in the Split Area.
    // Anything else is simply refused, as before.
    const shortfall = seats - available;
    if (!ev.allowsMultipleVenues || available <= 0) {
      setModalError(
        available <= 0
          ? `"${venue.name}" is fully booked at this time — no seats are available.`
          : `"${venue.name}" only has ${available} seat(s) available at this time — ${seats} needed.`
      );
      return;
    }

    Modal.confirm({
      title: "Not enough seats in this venue",
      content: (
        <>
          <div>
            {reserved > 0
              ? `"${venue.name}" holds ${venue.capacity} seat(s) and ${reserved} are already booked at this time, leaving ${available}.`
              : `"${venue.name}" holds ${venue.capacity} seat(s).`}
            {" "}This drop needs {seats}.
          </div>
          <div style={{ marginTop: 8 }}>
            Reserve {available} seat(s) here and move the remaining {shortfall} to the Split Area,
            to be placed in another venue?
          </div>
        </>
      ),
      okText: `Split — reserve ${available} here`,
      cancelText: "Cancel",
      centered: true,
      okButtonProps: { style: { background: "#1AB394", borderColor: "#1AB394" } },
      onOk: () => commit(available),
    });
  };

  // Swallows the click that follows a resize, so stretching a block never
  // also opens its details.
  const openDetailsUnlessResizing = (ev) => () => {
    if (Date.now() - resizeEndedAtRef.current < 300) return;
    onOpenDetails?.(ev);
  };

  const startResize = (ev, edge) => (downEvent) => {
    if (!canEditEventTime) return;
    downEvent.preventDefault();
    downEvent.stopPropagation();
    const startY = downEvent.clientY;
    const startMin0 = ev.startMin;
    const endMin0 = ev.endMin;
    let latestStart = startMin0;
    let latestEnd = endMin0;
    setResizingId(ev.id);

    const onMove = (moveEvent) => {
      const deltaSlots = Math.round((moveEvent.clientY - startY) / HALF_HOUR_HEIGHT);
      const delta = deltaSlots * 30;
      if (edge === "top") {
        latestStart = Math.max(0, Math.min(startMin0 + delta, endMin0 - 30));
      } else {
        latestEnd = Math.min(24 * 60, Math.max(endMin0 + delta, startMin0 + 30));
      }
      setLiveResize({ id: ev.id, startMin: latestStart, endMin: latestEnd });
    };
    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizeEndedAtRef.current = Date.now();
      setResizingId(null);
      setLiveResize(null);
      if (latestStart === startMin0 && latestEnd === endMin0) return;
      setModalError("");

      const venue = ev.placement && venuesById.get(ev.placement.venueId);
      if (venue) {
        const reserved = reservedSeatsExcluding(venue.id, ev.blockKey, latestStart, latestEnd);
        if (reserved + ev.seats > venue.capacity) {
          setModalError(`"${venue.name}" doesn't have enough available seats for this new time.`);
          return;
        }
      }
      try {
        await updateEventTime(ev.id, { startTime: minutesToTime(latestStart), endTime: minutesToTime(latestEnd) });
        await refreshEvent(ev.id);
      } catch (err) {
        setModalError(err.response?.data?.message || "Could not update this event's time.");
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const commitSeats = async (block, newSeatsRaw) => {
    const newSeats = Number(newSeatsRaw);
    const clearDraft = () => setSeatsDraft((prev) => ({ ...prev, [block.blockKey]: undefined }));
    if (!canAssignVenues || !block.placement || !newSeats || newSeats === block.placement.seats) return;
    setModalError("");
    const venue = venuesById.get(block.placement.venueId);
    if (!venue) return;
    if (newSeats > venue.capacity) {
      setModalError(`Seats cannot exceed "${venue.name}"'s capacity (${venue.capacity}).`);
      clearDraft();
      return;
    }
    const reserved = reservedSeatsExcluding(venue.id, block.blockKey, block.startMin, block.endMin);
    if (reserved + newSeats > venue.capacity) {
      setModalError(`"${venue.name}" only has ${venue.capacity - reserved} seat(s) available at this time.`);
      clearDraft();
      return;
    }
    try {
      await updateEventVenue(block.id, venue.id, venue.id, newSeats);
      await refreshEvent(block.id);
      clearDraft();
    } catch (err) {
      setModalError(err.response?.data?.message || "Could not update seats reserved.");
      clearDraft();
    }
  };

  const hasUntimedPlaced = venues.some((v) => (placedByVenueId[v.id] || []).some((ev) => !ev.needsTimeSlot));
  const loading = initialLoading;
  // The venue grid's own visible height — the Holding column matches it so
  // the two sit level and the Split Area's 50% resolves against something
  // definite.
  const columnHeight = HEADER_ROW_HEIGHT + (hasUntimedPlaced ? STRIP_ROW_HEIGHT : 0) + VISIBLE_GRID_HEIGHT;

  // Pre-scroll to 07:30 once the grid actually exists. The header (and the
  // non-timed strip, when present) are sticky rather than a separate
  // scroll region, so scrollTop only needs to cover what sits above the
  // timed rows within the single shared scroll container — the sticky
  // header's own height cancels out of that math.
  //
  // Gated on the venues having arrived rather than on a loading flag: with
  // no venues there is no scroll container to position, and firing early
  // left the day sitting at 00:00 with no second chance.
  useEffect(() => {
    if (!open || didInitialScrollRef.current) return;
    const el = outerScrollRef.current;
    if (!el || venues.length === 0) return;
    const stripOffset = hasUntimedPlaced ? STRIP_ROW_HEIGHT : 0;
    el.scrollTop = stripOffset + INITIAL_SCROLL_HALF_HOURS * HALF_HOUR_HEIGHT;
    didInitialScrollRef.current = true;
  }, [open, loading, venues.length, hasUntimedPlaced]);

  return (
    <Modal
      title={
        <div style={{ textAlign: "center", paddingRight: 38 }}>
          {date ? `Venue Allocation — ${date.format("dddd, DD MMMM YYYY")}` : "Venue Allocation"}
        </div>
      }
      open={open}
      onCancel={onCancel}
      // Every drop, move, stretch and seat edit is already written when it
      // happens, so neither button commits anything — they just close. The
      // right-hand one is "Done" rather than "Save" for that reason: a Save
      // here would imply there is unsaved work pending, and a scheduler who
      // closed with Cancel might reasonably think their allocations had been
      // discarded.
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="done" type="primary" onClick={onCancel}>
          Done
        </Button>,
      ]}
      width={1180}
      centered
      destroyOnHidden
    >
      {/* Shown here, inside the modal, rather than relying on the main
          calendar page's own Alert — that one sits behind this modal's
          overlay, so a rejected drop/resize/seat-edit would otherwise be
          invisible until the modal is closed. */}
      {modalError && (
        <Alert
          message={modalError}
          type="error"
          showIcon
          closable
          onClose={() => setModalError("")}
          style={{ marginBottom: 12 }}
        />
      )}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 12 }}>
          {/* Holding Area — same fixed width as the main Datesheet page's
              own, scoped to just this day's unplaced exams, with the Split
              Area pinned to its bottom. Fixed to the grid's own height so
              the Split Area's half is a definite 50%, and so both lists
              scroll inside the column instead of stretching it. */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              marginRight: 16,
              height: columnHeight,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${GRID_BORDER}`,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              onDragOver={(e) => {
                if ((dragged?.from === "venue" || dragged?.from === "split") && canAssignVenues) {
                  e.preventDefault();
                  setDragOverHolding(true);
                }
              }}
              onDragLeave={() => setDragOverHolding(false)}
              onDrop={onDropOnHolding}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                background: dragOverHolding ? "#e8f7f4" : "transparent",
              }}
            >
              <Text strong style={{ display: "block", padding: "8px 10px 6px" }}>
                Holding Area ({holdingEvents.length})
              </Text>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                {holdingEvents.length === 0 ? (
                  <Empty description="Nothing pending" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  holdingEvents.map((ev) => {
                    const color = blockColor(ev);
                    return (
                      <div
                        key={ev.id}
                        draggable={canAssignVenues}
                        onDragStart={onDragStartHolding(ev)}
                        onClick={() => onOpenDetails?.(ev)}
                        title={ev.fullName}
                        style={{
                          flexShrink: 0,
                          background: color.bg,
                          color: color.text,
                          border: `1px solid ${color.border}`,
                          borderRadius: 4,
                          padding: "6px 8px",
                          fontSize: 12,
                          cursor: canAssignVenues ? "grab" : "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.shortName}
                        </div>
                        <div style={{ fontSize: 11, color: color.text, opacity: 0.8 }}>
                          {ev.needsTimeSlot ? (ev.startTime ? `${ev.startTime}–${ev.endTime}` : "No time set") : "No time slot"}
                          {" · "}
                          {ev.strength} seat(s)
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Split Area — the parts of an exam still waiting for a venue.
                Opens upward over the bottom half of the column, the same
                collapse gesture the Datesheet's own Holding Area uses.
                Collapsed it is just its header, which still carries the
                count. */}
            <div
              onDragOver={(e) => {
                if (dragged?.from === "holding" && canAssignVenues) {
                  e.preventDefault();
                  setDragOverSplit(true);
                }
              }}
              onDragLeave={() => setDragOverSplit(false)}
              onDrop={onDropOnSplitArea}
              style={{
                flexShrink: 0,
                height: splitOpen ? "50%" : "auto",
                display: "flex",
                flexDirection: "column",
                borderTop: `1px solid ${GRID_BORDER}`,
                background: dragOverSplit ? "#e8f7f4" : "transparent",
              }}
            >
              <div
                onClick={() => setSplitOpen((v) => !v)}
                title={splitOpen ? "Collapse" : "Expand"}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {splitOpen ? <DownOutlined style={{ fontSize: 10 }} /> : <UpOutlined style={{ fontSize: 10 }} />}
                <Text strong style={{ fontSize: 13 }}>
                  Split Area ({splitParts.length})
                </Text>
              </div>

              {splitOpen && (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                  {splitParts.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Drag an exam here to cut it in two, or drop one into a venue that cannot seat it all.
                    </Text>
                  ) : (
                    splitParts.map((part) => {
                      const color = blockColor(part.ev);
                      return (
                        <div
                          key={part.key}
                          draggable={canAssignVenues}
                          onDragStart={onDragStartSplitPart(part)}
                          onClick={() => onOpenDetails?.(part.ev)}
                          title={part.ev.fullName}
                          style={{
                            flexShrink: 0,
                            background: color.bg,
                            color: color.text,
                            border: `1px dashed ${color.border}`,
                            borderRadius: 4,
                            padding: "6px 8px",
                            fontSize: 12,
                            cursor: canAssignVenues ? "grab" : "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {part.ev.shortName}
                          </div>
                          <div style={{ fontSize: 11, color: color.text, opacity: 0.8 }}>
                            {part.ev.needsTimeSlot
                              ? part.ev.startTime
                                ? `${part.ev.startTime}–${part.ev.endTime}`
                                : "No time set"
                              : "No time slot"}
                            {" · "}
                            {part.seats} seat(s)
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Venue columns — divide the remaining width equally. Header,
              non-timed strip, and timed rows all live inside ONE scrolling
              box (border on all 4 sides closes it) so there is a single
              scrollbar shared by every row — the header/strip just stick to
              the top of it — instead of the header row and the timed grid
              each computing their own column widths independently, which
              is what let a scrollbar on the grid alone shrink its columns
              out of step with the header above it. */}
          <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
            {venues.length === 0 ? (
              <Empty description="No active Static/Mobile venues" />
            ) : (
              <div
                ref={outerScrollRef}
                style={{
                  minWidth: TIME_COL_WIDTH + venues.length * MIN_VENUE_COL_WIDTH,
                  maxHeight: columnHeight,
                  overflowY: "auto",
                  border: `1px solid ${GRID_BORDER}`,
                }}
              >
                {/* Header row — venue name + capacity, sticky to the top of
                    the shared scroll box. */}
                <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: "#fff" }}>
                  <div
                    style={{
                      width: TIME_COL_WIDTH,
                      flexShrink: 0,
                      height: HEADER_ROW_HEIGHT,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#595959",
                      textAlign: "center",
                      lineHeight: 1.2,
                      borderRight: `1px solid ${GRID_BORDER}`,
                      borderBottom: `1px solid ${GRID_BORDER}`,
                    }}
                  >
                    Time Slots
                  </div>
                  {venues.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        flex: "1 1 0%",
                        minWidth: 0,
                        height: HEADER_ROW_HEIGHT,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        padding: "0 8px",
                        textAlign: "center",
                        borderRight: `1px solid ${GRID_BORDER}`,
                        borderBottom: `1px solid ${GRID_BORDER}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#8c8c8c" }}>Capacity {v.capacity}</div>
                    </div>
                  ))}
                </div>

                {/* Non-timed strip — categories with no time slot at all just
                    sit here as a plain block, same as the calendar's own
                    all-day rendering, not positioned against the time grid.
                    Sticky right below the header, so it stays visible too. */}
                {hasUntimedPlaced && (
                  <div style={{ display: "flex", position: "sticky", top: HEADER_ROW_HEIGHT, zIndex: 2, background: "#fff" }}>
                    <div
                      style={{
                        width: TIME_COL_WIDTH,
                        flexShrink: 0,
                        height: STRIP_ROW_HEIGHT,
                        boxSizing: "border-box",
                        fontSize: 10,
                        color: "#bfbfbf",
                        padding: "4px 6px",
                        borderRight: `1px solid ${GRID_BORDER}`,
                        borderBottom: `1px solid ${GRID_BORDER}`,
                      }}
                    >
                      No time
                    </div>
                    {venues.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          flex: "1 1 0%",
                          minWidth: 0,
                          height: STRIP_ROW_HEIGHT,
                          boxSizing: "border-box",
                          borderRight: `1px solid ${GRID_BORDER}`,
                          borderBottom: `1px solid ${GRID_BORDER}`,
                          padding: 4,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          overflow: "hidden",
                        }}
                      >
                        {(placedByVenueId[v.id] || [])
                          .filter((ev) => !ev.needsTimeSlot)
                          .map((ev) => {
                            const color = blockColor(ev);
                            return (
                              <div
                                key={ev.blockKey}
                                draggable={canAssignVenues}
                                onDragStart={onDragStartPlaced(ev)}
                                onClick={() => onOpenDetails?.(ev)}
                                title={ev.fullName}
                                style={{
                                  background: color.bg,
                                  color: color.text,
                                  border: `1px solid ${color.border}`,
                                  borderRadius: 3,
                                  padding: "1px 6px",
                                  fontSize: 11,
                                  cursor: canAssignVenues ? "grab" : "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {ev.shortName}
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Timed rows — plain (non-sticky) flow content of the same
                    scroll box above, no height of its own beyond its
                    content, so its columns' borders/backgrounds run the
                    full 24h height instead of being clipped to whatever a
                    separately-fixed-height scroller happened to show. */}
                <div ref={rowsWrapperRef} style={{ display: "flex" }} onDragOver={(e) => e.preventDefault()}>
                  <div style={{ width: TIME_COL_WIDTH, flexShrink: 0, position: "relative", borderRight: `1px solid ${GRID_BORDER}` }}>
                    {HALF_HOURS.map((i) => (
                      <div
                        key={i}
                        style={{
                          height: HALF_HOUR_HEIGHT,
                          boxSizing: "border-box",
                          borderTop: i === 0 ? "none" : `1px solid ${GRID_BORDER}`,
                        }}
                      />
                    ))}
                    {/* Labels sit ON the dividing line itself (translateY
                        -50%), not floating inside the slot above/below it —
                        every half hour gets one, not just the top of the
                        hour — right-aligned so the time reads flush against
                        the column's own border line. */}
                    {HALF_HOURS.map((i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          top: i * HALF_HOUR_HEIGHT,
                          left: 0,
                          right: 0,
                          transform: "translateY(-50%)",
                          fontSize: 10,
                          lineHeight: 1,
                          color: "#8c8c8c",
                          textAlign: "right",
                          paddingRight: 4,
                          boxSizing: "border-box",
                          background: "#fff",
                          pointerEvents: "none",
                        }}
                      >
                        {minutesToTime(i * 30)}
                      </div>
                    ))}
                  </div>

                  {venues.map((venue) => {
                    const timedEvents = (placedByVenueId[venue.id] || []).filter((ev) => ev.needsTimeSlot);
                    const packed = packTimedEvents(timedEvents, venue.capacity);
                    const isDragOver = dragOverVenueId === venue.id;
                    return (
                      <div
                        key={venue.id}
                        style={{
                          flex: "1 1 0%",
                          minWidth: 0,
                          position: "relative",
                          borderRight: `1px solid ${GRID_BORDER}`,
                          background: isDragOver ? "#e8f7f4" : "#fff",
                        }}
                        onDragOver={(e) => {
                          if (dragged && canAssignVenues) {
                            e.preventDefault();
                            setDragOverVenueId(venue.id);
                          }
                        }}
                        onDragLeave={() => setDragOverVenueId((prev) => (prev === venue.id ? null : prev))}
                        onDrop={onDropOnVenue(venue)}
                      >
                        {HALF_HOURS.map((i) => (
                          <div
                            key={i}
                            style={{
                              height: HALF_HOUR_HEIGHT,
                              boxSizing: "border-box",
                              borderTop: i === 0 ? "none" : `1px solid ${GRID_BORDER}`,
                            }}
                          />
                        ))}

                        {packed.map((ev) => {
                          const color = blockColor(ev);
                          const isEditingSeats = editingSeatsId === ev.blockKey;
                          const blockH = Math.max(((ev.endMin - ev.startMin) / 60) * DAY_ROW_HEIGHT - 2, 26);
                          // The grips and the drag handle together claim 24px
                          // of a block's height, so a short one (a half-hour
                          // slot is 26px) shows only what still fits rather
                          // than squeezing its name out entirely.
                          const showGrips = canEditEventTime && blockH >= 34;
                          const showDragHandle = canAssignVenues && blockH >= 52;
                          return (
                            <div
                              key={ev.blockKey}
                              onClick={openDetailsUnlessResizing(ev)}
                              title={ev.fullName}
                              style={{
                                position: "absolute",
                                top: (ev.startMin / 60) * DAY_ROW_HEIGHT,
                                height: blockH,
                                left: `${ev.leftPct}%`,
                                width: `calc(${ev.widthPct}% - 2px)`,
                                // A true seats/capacity fraction can be too
                                // thin to see or interact with (a class of a
                                // handful in a 180-seat hall) — floor the
                                // rendered width without touching the actual
                                // leftPct/widthPct packing math above.
                                minWidth: 70,
                                background: color.bg,
                                color: color.text,
                                border: `1px solid ${color.border}`,
                                borderRadius: 3,
                                fontSize: 10,
                                overflow: "hidden",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                zIndex: resizingId === ev.id ? 5 : 2,
                              }}
                            >
                              {showGrips && (
                                <div
                                  onMouseDown={startResize(ev, "top")}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Drag to change the start time"
                                  style={{
                                    height: 6,
                                    flexShrink: 0,
                                    cursor: "ns-resize",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {/* Visible grip, same idea as the left/right
                                      grips on a combined-paper bar in Add
                                      Exams — an invisible hit area gave no
                                      hint the edge was draggable at all. */}
                                  <div style={{ width: 20, height: 2, borderRadius: 1, background: color.text, opacity: 0.7 }} />
                                </div>
                              )}
                              {showDragHandle && (
                                <div
                                  draggable
                                  onDragStart={onDragStartPlaced(ev)}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Drag to another time slot or venue, or back to the Holding Area"
                                  style={{
                                    flexShrink: 0,
                                    height: 14,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "grab",
                                    color: color.text,
                                    lineHeight: 1,
                                  }}
                                >
                                  <EllipsisOutlined style={{ fontSize: 20 }} />
                                </div>
                              )}
                              <div style={{ flex: 1, minHeight: 0, padding: "0 4px", overflow: "hidden", textAlign: "center" }}>
                                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {ev.shortName}
                                </div>
                              </div>
                              <div style={{ padding: "0 3px 2px", flexShrink: 0, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                                {canAssignVenues && isEditingSeats ? (
                                  <InputNumber
                                    size="small"
                                    min={1}
                                    max={venue.capacity}
                                    autoFocus
                                    value={seatsDraft[ev.blockKey] ?? ev.seats}
                                    onChange={(val) => setSeatsDraft((prev) => ({ ...prev, [ev.blockKey]: val }))}
                                    onBlur={() => { commitSeats(ev, seatsDraft[ev.blockKey] ?? ev.seats); setEditingSeatsId(null); }}
                                    onPressEnter={() => { commitSeats(ev, seatsDraft[ev.blockKey] ?? ev.seats); setEditingSeatsId(null); }}
                                    style={{ width: "100%" }}
                                  />
                                ) : (
                                  <Text
                                    style={{ fontSize: 10, color: color.text, cursor: canAssignVenues ? "text" : "default" }}
                                    onClick={() => canAssignVenues && setEditingSeatsId(ev.blockKey)}
                                  >
                                    {ev.seats} seat{ev.seats === 1 ? "" : "s"}
                                  </Text>
                                )}
                              </div>
                              {showGrips && (
                                <div
                                  onMouseDown={startResize(ev, "bottom")}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Drag to change the end time"
                                  style={{
                                    height: 6,
                                    flexShrink: 0,
                                    cursor: "ns-resize",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <div style={{ width: 20, height: 2, borderRadius: 1, background: color.text, opacity: 0.7 }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

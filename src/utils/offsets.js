// Offset vocabulary shared by notification templates and task templates —
// the same labels the Notification Templates form uses, so the two read
// alike. Mirrors the OffsetDirection / OffsetUnit / EventTimeReference enums
// in the backend, plus TaskOffsetBasis for tasks.

export const OFFSET_BASIS_OPTIONS = [
  { value: "trigger_time", label: "Relative to the Trigger" },
  { value: "event_time", label: "Relative to the Event" },
];

// A due time may also count from the task's own open time; an open time
// can't, so this option is offered for due times only.
export const DUE_OFFSET_BASIS_OPTIONS = [
  ...OFFSET_BASIS_OPTIONS,
  { value: "open_time", label: "Relative to the Open Time" },
];

export const EVENT_TIME_REFERENCE_OPTIONS = [
  { value: "event_date", label: "Event Date" },
  { value: "start_time", label: "Start Time" },
  { value: "end_time", label: "End Time" },
];

export const OFFSET_DIRECTION_OPTIONS = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];

export const OFFSET_UNIT_OPTIONS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

// How many tasks a template makes, and — for a series — which exam of it the
// times are measured from.
export const TASK_SCOPE_OPTIONS = [
  { value: "per_exam", label: "Per Exam" },
  { value: "per_series", label: "Per Exam Series" },
];

export const SERIES_ANCHOR_OPTIONS = [
  { value: "first_exam", label: "First Exam of the Series" },
  { value: "last_exam", label: "Last Exam of the Series" },
];

const SINGULAR = { minutes: "minute", hours: "hour", days: "day", weeks: "week", months: "month" };

const unitWord = (value, unit) => (value === 1 ? SINGULAR[unit] ?? unit : unit);

// A series task measures from one exam of the batch rather than "the event",
// so its timings read "12 weeks before the first exam's date".
function pointPhrase(basis, reference, seriesAnchor) {
  if (basis === "trigger_time") return "the trigger";
  if (basis === "open_time") return "the open time";
  const whose = seriesAnchor === "first_exam" ? "the first exam's" : seriesAnchor === "last_exam" ? "the last exam's" : "the";
  if (reference === "event_date") return `${whose} ${seriesAnchor ? "date" : "event date"}`;
  if (reference === "start_time") return `${whose} start time`;
  if (reference === "end_time") return `${whose} end time`;
  return seriesAnchor ? `${whose} exam` : "the event";
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Reads a stored offset back as a sentence: "16 weeks before the event
// date", "2 days after the open time". With no offset it names the point
// itself: "On the event date", "At the trigger".
export function describeOffset(basis, reference, direction, value, unit, seriesAnchor = null) {
  if (!basis) return "—";
  const point = pointPhrase(basis, reference, seriesAnchor);
  if (!value) return capitalise(point.endsWith("date") ? `on ${point}` : `at ${point}`);
  return capitalise(`${value} ${unitWord(value, unit)} ${direction} ${point}`);
}

export function describeGracePeriod(value, unit) {
  if (!value || !unit) return "None";
  return `${value} ${unitWord(value, unit)}`;
}

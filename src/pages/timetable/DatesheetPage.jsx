import EventCalendarView from "./EventCalendarView";

// Event is Exam-only now — Moderation Meeting was split into its own table
// (see [[project_moderation_meeting_split]] memory), so there's no category
// filtering left to do here.
export default function DatesheetPage() {
  return <EventCalendarView bulkAddEnabled />;
}

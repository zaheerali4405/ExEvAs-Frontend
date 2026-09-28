import { Descriptions, theme } from "antd";
import dayjs from "dayjs";
import { taskSubject } from "../../utils/taskStatus";

const formatDate = (val) => (val ? dayjs(val).format("DD MMM YYYY") : "Not set yet");

// "2 Days", "1 Week" — the way the details read.
const GRACE_UNIT = { minutes: "Minute", hours: "Hour", days: "Day", weeks: "Week", months: "Month" };
const graceText = (value, unit) =>
  value && unit ? `${value} ${GRACE_UNIT[unit] ?? unit}${value === 1 ? "" : "s"}` : "None";

// The date a task's exam starts: its own date, or for a series the earliest
// date among its exams.
const startingDateOf = (subject) => {
  const dates = subject.exams.map((e) => e.eventDate).filter(Boolean);
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (new Date(d) < new Date(earliest) ? d : earliest));
};

// A task's Exam Details and Task Details, the same wherever a task is shown:
// the task preview on the Tasks and My Tasks pages, and the senior's review of
// a status update.
export default function TaskDetailsSections({ task }) {
  const { token } = theme.useToken();
  const subject = taskSubject(task);
  const labelStyle = { width: 110, color: token.colorTextSecondary };

  return (
    <>
      <Descriptions title="Exam Details" size="small" column={1} labelStyle={labelStyle}>
        <Descriptions.Item label="Exam">{subject.fullTitle}</Descriptions.Item>
        <Descriptions.Item label="Starting Date">{formatDate(startingDateOf(subject))}</Descriptions.Item>
      </Descriptions>

      <Descriptions title="Task Details" size="small" column={1} labelStyle={labelStyle}>
        <Descriptions.Item label="Task">{task.name}</Descriptions.Item>
        <Descriptions.Item label="Instructions">
          <span style={{ whiteSpace: "pre-line" }}>{task.instructions || "None"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Open Date">{formatDate(task.openAt)}</Descriptions.Item>
        <Descriptions.Item label="Due Date">{formatDate(task.dueAt)}</Descriptions.Item>
        <Descriptions.Item label="Grace Period">{graceText(task.gracePeriodValue, task.gracePeriodUnit)}</Descriptions.Item>
      </Descriptions>
    </>
  );
}

import { useState } from "react";
import { Tag, Typography, Popover, Button, Select, DatePicker, Badge, Input, theme } from "antd";
import { FilterOutlined, SearchOutlined, CloseOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { taskSubject } from "../../utils/taskStatus";
import { useIsMobile, isFilterActive } from "./taskInboxUtils";

const { Text } = Typography;

// The visual pieces of the inbox-style task pages — the admin's Tasks page
// and My Tasks: a list of tasks on the left with its search, filters, view
// tabs and sort, and a preview of the selected one on the right. The logic
// they share is in taskInboxUtils.js.

// The two panes. They fill the height the page leaves them and scroll on
// their own, so the page itself never scrolls. On a phone only one shows at
// a time: the list, or the selected task with a way back.
export function InboxLayout({ listHeader, list, preview, showPreview, onBack }) {
  const { token } = theme.useToken();
  const isMobile = useIsMobile();
  const pane = { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 420,
        display: "grid",
        gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(300px, 380px) minmax(0, 1fr)",
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        overflow: "hidden",
      }}
    >
      {(!isMobile || !showPreview) && (
        <div style={{ ...pane, borderRight: isMobile ? "none" : `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>{listHeader}</div>
          <div style={{ flex: 1, overflowY: "auto" }}>{list}</div>
        </div>
      )}
      {(!isMobile || showPreview) && (
        <div style={{ ...pane, overflowY: "auto" }}>
          {isMobile && (
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>Back</Button>
            </div>
          )}
          <div style={{ padding: "16px 20px" }}>{preview}</div>
        </div>
      )}
    </div>
  );
}

// The view tabs above the list, with counts.
export function ViewTabs({ tabs, active, onChange }) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              cursor: "pointer",
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: token.borderRadius,
              border: `1px solid ${on ? token.colorPrimary : token.colorBorderSecondary}`,
              background: on ? token.colorPrimaryBg : "transparent",
              color: on ? token.colorPrimaryText : token.colorTextSecondary,
            }}
          >
            {t.label} <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <Input
      allowClear
      prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Filters ──────────────────────────────────────────────────────────────

// The funnel button and its popover. The count on it is how many filters
// are on. Given sortOptions, it also carries the sort order at the top —
// sorting isn't a filter, so it doesn't count towards the badge and Clear
// all leaves it alone.
export function FilterButton({ filters, values, onChange, sortOptions, sortValue, onSortChange }) {
  const [open, setOpen] = useState(false);
  const activeCount = filters.filter((f) => isFilterActive(f, values[f.key])).length;
  const set = (key, value) => onChange({ ...values, [key]: value });

  const content = (
    <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 12 }}>
      {sortOptions && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Sort by</Text>
          <Select style={{ width: "100%" }} options={sortOptions} value={sortValue} onChange={onSortChange} />
        </div>
      )}
      {filters.map((f) => (
        <div key={f.key}>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>{f.label}</Text>
          {f.type === "dateRange" ? (
            <DatePicker.RangePicker
              style={{ width: "100%" }}
              value={values[f.key] ?? null}
              onChange={(range) => set(f.key, range)}
              format="DD MMM YYYY"
              allowClear
            />
          ) : (
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Any"
              options={f.options}
              value={values[f.key] ?? []}
              onChange={(v) => set(f.key, v)}
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button size="small" onClick={() => onChange({})} disabled={activeCount === 0}>Clear all</Button>
        <Button size="small" type="primary" onClick={() => setOpen(false)}>Done</Button>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomLeft" open={open} onOpenChange={setOpen}>
      <Badge count={activeCount} size="small" color="#1AB394">
        <Button icon={<FilterOutlined />} aria-label="Filters" />
      </Badge>
    </Popover>
  );
}

// One removable chip per filter that's on, under the search.
export function FilterChips({ filters, values, onChange }) {
  const active = filters.filter((f) => isFilterActive(f, values[f.key]));
  if (active.length === 0) return null;
  const describe = (f, v) => {
    if (f.type === "dateRange") return `${v[0].format("DD MMM")} – ${v[1].format("DD MMM YYYY")}`;
    const labels = v.map((x) => f.options.find((o) => o.value === x)?.label ?? x);
    return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {active.map((f) => (
        <Tag
          key={f.key}
          color="processing"
          style={{ marginInlineEnd: 0 }}
          closeIcon={<CloseOutlined />}
          onClose={(e) => {
            e.preventDefault();
            const next = { ...values };
            delete next[f.key];
            onChange(next);
          }}
        >
          {f.label}: {describe(f, values[f.key])}
        </Tag>
      ))}
    </div>
  );
}

// ── The list ──────────────────────────────────────────────────────────────

export function GroupHeader({ children }) {
  return (
    <div style={{ padding: "10px 14px 4px", fontSize: 12, color: "#8c8c8c" }}>{children}</div>
  );
}

// ── A task in the list ─────────────────────────────────────────────────────

// A row shows only the task's name and its exam or series name; the preview
// carries everything else. Long names are cut off, with the whole name on
// hover.
export function TaskListItem({ task, selected, onClick }) {
  const { token } = theme.useToken();
  const subject = taskSubject(task);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{
        cursor: "pointer",
        padding: "10px 14px 10px 11px",
        borderLeft: `3px solid ${selected ? token.colorPrimary : "transparent"}`,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: selected ? token.controlItemBgActive : "transparent",
      }}
    >
      <Text ellipsis style={{ display: "block" }}>{task.name}</Text>
      <Text type="secondary" ellipsis={{ tooltip: subject.fullTitle }} style={{ fontSize: 12, display: "block" }}>
        {subject.fullTitle}
      </Text>
    </div>
  );
}

export function ListEmpty({ children }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "#8c8c8c", fontSize: 13 }}>{children}</div>
  );
}

export function PreviewEmpty({ children }) {
  return (
    <div style={{ padding: "64px 16px", textAlign: "center", color: "#8c8c8c", fontSize: 13 }}>{children}</div>
  );
}

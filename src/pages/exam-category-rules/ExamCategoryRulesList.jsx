import { useState, useEffect, useMemo } from "react";
import { Table, Alert, Spin, Typography, Tag, Modal, Checkbox, Tooltip, Space, Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getExamCategories } from "../../api/examCategoriesApi";
import { getExamScopes } from "../../api/examScopesApi";
import { getExamCategoryRules, setExamCategoryRule } from "../../api/examCategoryRulesApi";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

// Mirrors DEFAULT_EXAM_RULES in events.service.ts — what a pair with no row
// of its own falls back to.
const DEFAULTS = {
  allowsMultiplePapers: false,
  allowsMultipleVenues: false,
  allowsDateRange: false,
  allowsDateSplit: false,
  needsTimeSlot: true,
  needsVenue: true,
  needsStaff: true,
  needsEquipment: true,
  allowsRetake: true,
};

// Same wording as the old per-category form, so the flags read identically
// now that they're set per scope instead.
const FLAGS = [
  { key: "allowsMultiplePapers", label: "Combine multiple papers", short: "Multi-paper", hint: "An event may bundle more than one course/paper into one occurrence — never forced, just allowed." },
  { key: "allowsMultipleVenues", label: "Multiple venues",         short: "Multi-venue", hint: "One occurrence may be spread across several venues, each with its own reserved seat count. Off means exactly one venue. Separate from the Venue requirement, which decides whether a venue is needed at all." },
  { key: "allowsDateRange",      label: "Date range",             short: "Date range",  hint: "Spans a date range (not a single date) — the occurrence's block stretches across every day it covers." },
  { key: "allowsDateSplit",      label: "Split batches",          short: "Split",       hint: "One paper may have more than one original batch — a large cohort routinely gets split into several separate stations/rounds. Independent of Date range." },
  { key: "needsTimeSlot",        label: "Time slot",              short: "Time",        hint: "Needs a start/end time, not just a date. Gates Scheduled status." },
  { key: "needsVenue",           label: "Venue",                  short: "Venue",       hint: "Needs a venue assignment before it can be Scheduled." },
  { key: "needsStaff",           label: "Staff",                  short: "Staff",       hint: "Staff/invigilator duty can be assigned (tracked separately, doesn't gate Scheduled status)." },
  { key: "needsEquipment",       label: "Equipment",              short: "Equipment",   hint: "Needs an equipment assignment before it can be Scheduled." },
  { key: "allowsRetake",         label: "Retake",                 short: "Retake",      hint: "Whether the retake concept applies at all." },
];

// The four flags that feed recomputeStatus — worth marking, since changing
// one re-evaluates every existing event under that pair.
const GATING = new Set(["allowsDateRange", "needsTimeSlot", "needsVenue", "needsEquipment"]);

const pairKey = (categoryId, scopeId) => `${categoryId}-${scopeId}`;

// How an exam of a given category is actually run under a given scope. These
// 8 flags used to sit on the category alone, which forced one answer across
// every scope — but an Internal Theory paper and a Professional one
// genuinely differ in whether a venue has to be booked. Edited per cell
// rather than as 224 inline checkboxes, which no one could read.
export default function ExamCategoryRulesList() {
  const { can } = useAuth();
  const canEdit = can("exam-category.update");

  const [categories, setCategories] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [rulesByPair, setRulesByPair] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { category, scope, draft }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [catsRes, scopesRes, rulesRes] = await Promise.all([
          getExamCategories(),
          getExamScopes(),
          getExamCategoryRules(),
        ]);
        setCategories(catsRes.data.filter((c) => c.isActive));
        setScopes(scopesRes.data.filter((s) => s.isActive));
        setRulesByPair(
          Object.fromEntries(
            rulesRes.data.map((r) => [pairKey(r.examCategoryId, r.examScopeId), r])
          )
        );
      } catch (err) {
        setError(err.response?.data?.message || "Could not load the rules matrix.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [categories]
  );
  const sortedScopes = useMemo(
    () => [...scopes].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [scopes]
  );

  const rulesFor = (categoryId, scopeId) => ({
    ...DEFAULTS,
    ...(rulesByPair[pairKey(categoryId, scopeId)] || {}),
  });

  const openEditor = (category, scope) => {
    setEditing({ category, scope, draft: rulesFor(category.id, scope.id) });
  };

  const saveEditor = async () => {
    const { category, scope, draft } = editing;
    setSaving(true);
    setError("");
    try {
      const flags = Object.fromEntries(FLAGS.map((f) => [f.key, !!draft[f.key]]));
      const { data } = await setExamCategoryRule(category.id, scope.id, flags);
      setRulesByPair((prev) => ({ ...prev, [pairKey(category.id, scope.id)]: data }));
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save these rules.");
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (category, scope) => {
    const rules = rulesFor(category.id, scope.id);
    const on = FLAGS.filter((f) => rules[f.key]);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", minHeight: 22 }}>
          {on.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 11 }}>Nothing enabled</Text>
          ) : (
            on.map((f) => (
              <Tooltip key={f.key} title={f.hint}>
                {/* Red for a requirement, green for a permission — the two
                    kinds of flag read apart at a glance, without having to
                    parse the label. */}
                <Tag color={f.key.startsWith("needs") ? "red" : "green"} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                  {f.short}
                </Tag>
              </Tooltip>
            ))
          )}
        </div>
        {canEdit && (
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditor(category, scope)}>
            Edit
          </Button>
        )}
      </div>
    );
  };

  const columns = [
    {
      title: "Exam Category",
      dataIndex: "shortName",
      fixed: "left",
      width: 150,
      // Short name only — the full names run long enough to dominate the
      // row, and the point of this page is comparing rules across scopes.
      // Falls back to the full name for a category that has no short one.
      render: (_, record) => (
        <span style={{ fontWeight: 600 }} title={record.name}>
          {record.shortName || record.name}
        </span>
      ),
    },
    ...sortedScopes.map((scope) => ({
      title: scope.name,
      key: scope.id,
      align: "center",
      width: 240,
      render: (_, category) => renderCell(category, scope),
    })),
  ];

  return (
    <DashboardLayout>
      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />
      )}

      <PageCard>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Table
            rowKey="id"
            dataSource={sortedCategories}
            columns={columns}
            size="small"
            pagination={false}
            scroll={{ x: 150 + sortedScopes.length * 240 }}
          />
        )}
      </PageCard>

      <Modal
        title={editing ? `${editing.category.name} — ${editing.scope.name}` : ""}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEditor}
        okText="Save"
        confirmLoading={saving}
        centered
        width={520}
      >
        {editing && (
          <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 12 }}>
            {FLAGS.map((f) => (
              <Tooltip key={f.key} title={f.hint} placement="left">
                <Checkbox
                  checked={!!editing.draft[f.key]}
                  onChange={(e) =>
                    setEditing((prev) => ({ ...prev, draft: { ...prev.draft, [f.key]: e.target.checked } }))
                  }
                >
                  {f.label}
                  {GATING.has(f.key) && (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                      (affects Scheduled status)
                    </Text>
                  )}
                </Checkbox>
              </Tooltip>
            ))}
          </Space>
        )}
      </Modal>
    </DashboardLayout>
  );
}

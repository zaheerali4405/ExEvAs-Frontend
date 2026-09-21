import { useState, useEffect, useMemo } from "react";
import { Table, Alert, Spin, ColorPicker, Button, Tooltip, Space } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getExamCategories } from "../../api/examCategoriesApi";
import { getExamScopes } from "../../api/examScopesApi";
import {
  getExamCategoryColors, setExamCategoryColor, clearExamCategoryColor,
} from "../../api/examCategoryColorsApi";
import { useAuth } from "../../context/AuthContext";

// Mirrors the backend's own DEFAULT_EVENT_COLORS — what an unset part falls
// back to when an event block is drawn.
const DEFAULTS = { backgroundColor: "#f0f0f0", textColor: "#262626", borderColor: "#bfbfbf" };

const PARTS = [
  { key: "backgroundColor", label: "Background" },
  { key: "textColor",       label: "Text" },
  { key: "borderColor",     label: "Border" },
];

const pairKey = (categoryId, scopeId) => `${categoryId}-${scopeId}`;

// The colors an event block is drawn with are a (category × scope) pair, not
// a property of either one alone — so they're edited as a matrix here rather
// than buried one cell at a time inside each category's own form. Every cell
// is saved on change; there's no separate Save step, since a color picker's
// own "done" already reads as a commit.
export default function ExamCategoryColorsList() {
  const { can } = useAuth();
  const canEdit = can("exam-category.update");

  const [categories, setCategories] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [colorsByPair, setColorsByPair] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingPair, setSavingPair] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [catsRes, scopesRes, colorsRes] = await Promise.all([
          getExamCategories(),
          getExamScopes(),
          getExamCategoryColors(),
        ]);
        setCategories(catsRes.data.filter((c) => c.isActive));
        setScopes(scopesRes.data.filter((s) => s.isActive));
        setColorsByPair(
          Object.fromEntries(
            colorsRes.data.map((row) => [pairKey(row.examCategoryId, row.examScopeId), row])
          )
        );
      } catch (err) {
        setError(err.response?.data?.message || "Could not load the color matrix.");
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

  const savePart = async (categoryId, scopeId, part, value) => {
    const key = pairKey(categoryId, scopeId);
    const previous = colorsByPair[key];
    // Optimistic — a color picker that snaps back on every pick feels broken
    // even when the write lands a moment later.
    setColorsByPair((prev) => ({ ...prev, [key]: { ...prev[key], examCategoryId: categoryId, examScopeId: scopeId, [part]: value } }));
    setSavingPair(key);
    setError("");
    try {
      const { data } = await setExamCategoryColor(categoryId, scopeId, { [part]: value });
      setColorsByPair((prev) => ({ ...prev, [key]: data }));
    } catch (err) {
      setColorsByPair((prev) => ({ ...prev, [key]: previous }));
      setError(err.response?.data?.message || "Could not save this color.");
    } finally {
      setSavingPair(null);
    }
  };

  const clearPair = async (categoryId, scopeId) => {
    const key = pairKey(categoryId, scopeId);
    const previous = colorsByPair[key];
    setColorsByPair((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSavingPair(key);
    setError("");
    try {
      await clearExamCategoryColor(categoryId, scopeId);
    } catch (err) {
      setColorsByPair((prev) => ({ ...prev, [key]: previous }));
      setError(err.response?.data?.message || "Could not clear this pair.");
    } finally {
      setSavingPair(null);
    }
  };

  const renderCell = (category, scope) => {
    const key = pairKey(category.id, scope.id);
    const row = colorsByPair[key] || {};
    const resolved = {
      backgroundColor: row.backgroundColor || DEFAULTS.backgroundColor,
      textColor: row.textColor || DEFAULTS.textColor,
      borderColor: row.borderColor || DEFAULTS.borderColor,
    };
    const isConfigured = !!(row.backgroundColor || row.textColor || row.borderColor);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        {/* A live sample of the actual event block, so the three pickers are
            judged on the thing they produce rather than in isolation. */}
        <div
          style={{
            width: "100%",
            padding: "2px 6px",
            borderRadius: 3,
            fontSize: 11,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            background: resolved.backgroundColor,
            color: resolved.textColor,
            border: `1px solid ${resolved.borderColor}`,
          }}
          title={isConfigured ? undefined : "Not configured — rendering neutral defaults"}
        >
          {category.shortName || category.name}
        </div>

        <Space size={4}>
          {PARTS.map((part) => (
            <Tooltip key={part.key} title={`${part.label}${row[part.key] ? ` — ${row[part.key]}` : " — not set"}`}>
              <span>
                <ColorPicker
                  size="small"
                  disabled={!canEdit}
                  value={row[part.key] || DEFAULTS[part.key]}
                  onChangeComplete={(c) => savePart(category.id, scope.id, part.key, c.toHexString())}
                />
              </span>
            </Tooltip>
          ))}
          {canEdit && (
            <Tooltip title="Clear this pair">
              <Button
                size="small"
                type="text"
                icon={<ClearOutlined />}
                disabled={!isConfigured}
                loading={savingPair === key}
                onClick={() => clearPair(category.id, scope.id)}
              />
            </Tooltip>
          )}
        </Space>
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
      // row, and the point of this page is comparing colors across scopes.
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
      width: 210,
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
            scroll={{ x: 150 + sortedScopes.length * 210 }}
          />
        )}
      </PageCard>
    </DashboardLayout>
  );
}

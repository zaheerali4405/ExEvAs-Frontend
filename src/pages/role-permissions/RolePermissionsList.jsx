import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Select, Alert, Checkbox, Typography, Spin } from "antd";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getRolePermissions,
  assignPermission,
  unassignPermission,
} from "../../api/rolePermissionsApi";
import { getRoles } from "../../api/rolesApi";
import { getPermissions } from "../../api/permissionsApi";
import { useAuth } from "../../context/useAuth";

const { Text } = Typography;

// Human-readable labels
const ACTION_LABELS = {
  "read-all":            "Read All",
  "read":                "Read",
  "create":              "Create",
  "update":              "Update",
  "activate":            "Activate",
  "lock":                "Lock",
  "toggle-2fa":          "Toggle 2FA",
  "assign":              "Assign",
  "unassign":            "Unassign",
  "set-main":            "Set Main",
  "read-departmental":   "Read Departmental",
  "create-departmental": "Create Departmental",
  "update-time":         "Update Time",
  "update-status":       "Update Status",
  "schedule-weekend":    "Schedule Weekend",
  "update-past":         "Update Past Events",
  "send":                "Send",
};

const ACTION_ORDER = [
  "read-all", "read", "create", "update", "activate",
  "lock", "toggle-2fa", "assign", "unassign", "set-main",
  "read-departmental", "create-departmental",
  "update-time", "update-status", "schedule-weekend", "update-past", "send",
];

const RESOURCE_LABELS = {
  "user":               "User",
  "designation":        "Designation",
  "role":               "Role",
  "permission":         "Permission",
  "user-designation":   "User Designation",
  "designation-role":   "Designation Role",
  "role-permission":    "Role Permission",
  "user-role":          "User Role",
  "institute":          "Institute",
  "program":            "Program",
  "session":            "Session",
  "degree-level":       "Degree Level",
  "class":              "Class",
  "course-paper":       "Course/Paper",
  "subject":            "Subject",
  "department":         "Department",
  "exam-type":          "Exam Type",
  "exam-scope":         "Exam Scope",
  "exam-category":     "Exam Category",
  "employee":           "Employee",
  "student":            "Student",
  "venue":              "Venue",
  "equipment":          "Equipment",
  "moderation-meeting": "Moderation Meeting",
  "event":              "Event",
  "event-venue":        "Event Venue",
  "event-equipment":    "Event Equipment",
  "event-department":   "Event Department",
  "event-staff":        "Event Staff",
  "system-settings":    "System Settings",
  "notification":       "Notification",
  "notification-template": "Notification Template",
};

// Preserve seed order for resources
const RESOURCE_ORDER = Object.keys(RESOURCE_LABELS);

// Resources collapsed under a single expandable group row
const RESOURCE_GROUPS = [
  {
    key: "group:user-rbac",
    label: "User and RBAC",
    resources: [
      "user", "designation", "role", "permission",
      "user-designation", "designation-role", "role-permission", "user-role",
    ],
  },
  {
    key: "group:academic-structure",
    label: "Academic Structure",
    resources: [
      "institute", "program", "session", "degree-level", "class", "exam-type", "exam-scope", "exam-category",
      "course-paper", "subject", "department", "employee", "student"
    ],
  },
    {
    key: "group:setup",
    label: "Setup",
    resources: [
      "venue", "equipment", "event-venue", "event-equipment", "event-department", "event-staff"
    ],
  },
  {
    key: "group:notifications",
    label: "Notifications",
    resources: ["notification", "notification-template"],
  },
];

const NO_IDS = new Set();

export default function RolePermissionsList() {
  const [searchParams] = useSearchParams();
  const paramRoleId = searchParams.get("roleId");
  const { can } = useAuth();

  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  // Tagged with the role they were loaded for, so a stale set is never shown
  // against a different selection and "still loading" can be read off the
  // mismatch.
  const [assigned, setAssigned] = useState({ roleId: null, ids: NO_IDS });

  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [error, setError] = useState("");

  const assignedIds = assigned.roleId === selectedRoleId ? assigned.ids : NO_IDS;
  const loadingAssigned = !!selectedRoleId && assigned.roleId !== selectedRoleId;

  useEffect(() => {
    let ignore = false;
    Promise.all([getRoles(), getPermissions()])
      .then(([rolesRes, permsRes]) => {
        if (ignore) return;
        setRoles(rolesRes.data);
        setAllPermissions(permsRes.data);
        // Resolve query-param roleId to the actual typed id from the loaded roles
        if (paramRoleId) {
          const match = rolesRes.data.find((r) => String(r.id) === String(paramRoleId));
          if (match) setSelectedRoleId(match.id);
        }
      })
      .catch(() => {
        if (!ignore) setError("Could not load roles or permissions.");
      })
      .finally(() => {
        if (!ignore) setLoadingBase(false);
      });
    return () => { ignore = true; };
  }, [paramRoleId]);

  useEffect(() => {
    if (!selectedRoleId) return;
    let ignore = false;
    getRolePermissions(selectedRoleId)
      .then(({ data }) => {
        if (!ignore) setAssigned({ roleId: selectedRoleId, ids: new Set(data.map((r) => r.permissionId)) });
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.response?.data?.message || "Could not load assigned permissions.");
        setAssigned({ roleId: selectedRoleId, ids: NO_IDS });
      });
    return () => { ignore = true; };
  }, [selectedRoleId]);

  const handleRoleChange = (val) => {
    setError("");
    setSelectedRoleId(val ?? null);
  };

  const handleToggle = async (permId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(permId));
    setError("");
    const roleId = selectedRoleId;
    try {
      if (checked) {
        await assignPermission(roleId, permId);
      } else {
        await unassignPermission(roleId, permId);
      }
      setAssigned((prev) => {
        if (prev.roleId !== roleId) return prev;
        const ids = new Set(prev.ids);
        if (checked) ids.add(permId);
        else ids.delete(permId);
        return { ...prev, ids };
      });
    } catch (err) {
      setError(err.response?.data?.message || "Could not update permission.");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(permId);
        return next;
      });
    }
  };

  // Build permissionMap: { resource: { action: permissionObj } }
  // and collect all unique actions present
  const { permissionMap, actions } = useMemo(() => {
    const map = {};
    const actionSet = new Set();

    allPermissions.forEach((p) => {
      const dotIdx = p.permissionKey.lastIndexOf(".");
      if (dotIdx === -1) return;
      const resource = p.permissionKey.slice(0, dotIdx);
      const action = p.permissionKey.slice(dotIdx + 1);
      if (!map[resource]) map[resource] = {};
      map[resource][action] = p;
      actionSet.add(action);
    });

    const sortedActions = ACTION_ORDER.filter((a) => actionSet.has(a));
    // append any unknown actions not in ACTION_ORDER
    actionSet.forEach((a) => { if (!ACTION_ORDER.includes(a)) sortedActions.push(a); });

    return { permissionMap: map, actions: sortedActions };
  }, [allPermissions]);

  // Rows: resources in seed order, then any unknown ones alphabetically
  const resources = useMemo(() => {
    const known = RESOURCE_ORDER.filter((r) => permissionMap[r]);
    const unknown = Object.keys(permissionMap)
      .filter((r) => !RESOURCE_ORDER.includes(r))
      .sort();
    return [...known, ...unknown];
  }, [permissionMap]);

  const dataSource = useMemo(() => {
    const grouped = new Set(RESOURCE_GROUPS.flatMap((g) => g.resources));
    const rows = [];
    resources.forEach((res) => {
      if (grouped.has(res)) return; // placed inside its group below, in resource order
      rows.push({ key: res, resource: res });
    });

    RESOURCE_GROUPS.forEach((group) => {
      const children = group.resources
        .filter((res) => permissionMap[res])
        .map((res) => ({ key: res, resource: res }));
      if (children.length === 0) return;
      // insert the group row at the position of its first member, to preserve overall ordering
      const firstIdx = resources.findIndex((r) => group.resources.includes(r));
      const insertAt = rows.findIndex((r) => resources.indexOf(r.resource) > firstIdx);
      const groupRow = { key: group.key, isGroup: true, label: group.label, children };
      if (insertAt === -1) rows.push(groupRow);
      else rows.splice(insertAt, 0, groupRow);
    });

    return rows;
  }, [resources, permissionMap]);

  // Not memoized: the checkbox cells close over handleToggle, which is new on
  // every render, so a memo here could never be reused anyway.
  const columns = (() => {
    const resourceCol = {
      title: "Resource",
      dataIndex: "resource",
      width: 180,
      fixed: "left",
      render: (val, record) =>
        record.isGroup ? (
          <Text strong>{record.label}</Text>
        ) : (
          <Text strong>{RESOURCE_LABELS[val] ?? val}</Text>
        ),
    };

    const actionCols = actions.map((action) => ({
      title: ACTION_LABELS[action] ?? action,
      key: action,
      align: "center",
      width: 100,
      render: (_, row) => {
        const perm = permissionMap[row.resource]?.[action];
        if (!perm) return null; // this resource has no such action

        const isToggling = togglingIds.has(perm.id);
        const isChecked = assignedIds.has(perm.id);

        if (isToggling) return <Spin size="small" />;

        const canToggle = isChecked
          ? can("role-permission.unassign")
          : can("role-permission.assign");

        return (
          <Checkbox
            checked={isChecked}
            disabled={!selectedRoleId || !canToggle}
            onChange={(e) => handleToggle(perm.id, e.target.checked)}
          />
        );
      },
    }));

    return [resourceCol, ...actionCols];
  })();

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            onClose={() => setError("")}
            style={{ marginBottom: 16, flexShrink: 0 }}
          />
        )}

        <PageCard style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {/* Role selector */}
          <div style={{ marginBottom: 20, flexShrink: 0 }}>
            <Text strong style={{ display: "block", marginBottom: 6 }}>
              Select Role
            </Text>
            <Select
              className="assignment-select"
              placeholder="Select a role to manage its permissions"
              loading={loadingBase}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              value={selectedRoleId}
              onChange={handleRoleChange}
              style={{ width: "100%", maxWidth: 400 }}
              allowClear
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          {/* Permissions matrix — scrolls internally; header row and first
              column stay fixed via Table's own scroll + fixed column. */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Table
              className="fill-parent-table"
              rowKey="key"
              dataSource={dataSource}
              columns={columns}
              loading={loadingBase || loadingAssigned}
              size="small"
              pagination={false}
              scroll={{ x: "max-content", y: "100%" }}
              locale={{ emptyText: "No permissions found." }}
              expandable={{ childrenColumnName: "children" }}
            />
          </div>
        </PageCard>
      </div>
    </DashboardLayout>
  );
}

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
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

// Human-readable labels
const ACTION_LABELS = {
  "read-all":    "Read All",
  "read":        "Read",
  "create":      "Create",
  "update":      "Update",
  "activate":    "Activate",
  "lock":        "Lock",
  "toggle-2fa":  "Toggle 2FA",
  "assign":      "Assign",
  "unassign":    "Unassign",
  "set-main":    "Set Main",
};

const ACTION_ORDER = [
  "read-all", "read", "create", "update", "activate",
  "lock", "toggle-2fa", "assign", "unassign", "set-main",
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
  "venue":              "Venue",
  "equipment":          "Equipment",
  "event-category":     "Event Category",
  "event":              "Event",
};

// Preserve seed order for resources
const RESOURCE_ORDER = Object.keys(RESOURCE_LABELS);

export default function RolePermissionsList() {
  const [searchParams] = useSearchParams();
  const { can } = useAuth();

  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [assignedRecords, setAssignedRecords] = useState([]);

  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingBase(true);
      try {
        const [rolesRes, permsRes] = await Promise.all([getRoles(), getPermissions()]);
        setRoles(rolesRes.data);
        setAllPermissions(permsRes.data);

        // Resolve query-param roleId to the actual typed id from the loaded roles
        const paramId = searchParams.get("roleId");
        if (paramId) {
          const match = rolesRes.data.find((r) => String(r.id) === String(paramId));
          if (match) setSelectedRoleId(match.id);
        }
      } catch {
        setError("Could not load roles or permissions.");
      } finally {
        setLoadingBase(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedRoleId) {
      setAssignedIds(new Set());
      setAssignedRecords([]);
      return;
    }
    (async () => {
      setLoadingAssigned(true);
      setError("");
      try {
        const { data } = await getRolePermissions(selectedRoleId);
        setAssignedRecords(data);
        setAssignedIds(new Set(data.map((r) => r.permissionId)));
      } catch (err) {
        setError(err.response?.data?.message || "Could not load assigned permissions.");
      } finally {
        setLoadingAssigned(false);
      }
    })();
  }, [selectedRoleId]);

  const handleToggle = async (permId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(permId));
    setError("");
    try {
      if (checked) {
        const { data } = await assignPermission(selectedRoleId, permId);
        setAssignedRecords((prev) => [...prev, data]);
        setAssignedIds((prev) => new Set(prev).add(permId));
      } else {
        await unassignPermission(selectedRoleId, permId);
        setAssignedRecords((prev) => prev.filter((r) => r.permissionId !== permId));
        setAssignedIds((prev) => {
          const next = new Set(prev);
          next.delete(permId);
          return next;
        });
      }
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

  const dataSource = resources.map((res) => ({ key: res, resource: res }));

  const columns = useMemo(() => {
    const resourceCol = {
      title: "Resource",
      dataIndex: "resource",
      width: 180,
      fixed: "left",
      render: (val) => (
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
  }, [actions, permissionMap, assignedIds, togglingIds, selectedRoleId, can]);

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

      <PageCard>
        {/* Role selector */}
        <div style={{ marginBottom: 20 }}>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            Select Role
          </Text>
          <Select
            className="assignment-select"
            placeholder="Select a role to manage its permissions"
            loading={loadingBase}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            value={selectedRoleId}
            onChange={(val) => setSelectedRoleId(val ?? null)}
            style={{ width: "100%", maxWidth: 400 }}
            allowClear
            showSearch
            filterOption={(input, option) =>
              option.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>

        {/* Permissions matrix */}
        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="key"
            dataSource={dataSource}
            columns={columns}
            loading={loadingBase || loadingAssigned}
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No permissions found." }}
          />
        </div>
      </PageCard>
    </DashboardLayout>
  );
}

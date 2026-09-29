import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Select, Alert, Checkbox, Tag, Typography, Spin } from "antd";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getUserRoles, assignRoleToUser, unassignRoleFromUser } from "../../api/userRolesApi";
import { getUsers } from "../../api/usersApi";
import { getRoles } from "../../api/rolesApi";
import { useAuth } from "../../context/useAuth";

const { Text } = Typography;

const NO_IDS = new Set();

export default function UserRolesList() {
  const [searchParams] = useSearchParams();
  const paramUserId = searchParams.get("userId");
  const { can } = useAuth();

  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  // Tagged with the user they were loaded for, so a stale set is never shown
  // against a different selection and "still loading" can be read off the
  // mismatch.
  const [assigned, setAssigned] = useState({ userId: null, ids: NO_IDS });

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [error, setError] = useState("");

  const assignedIds = assigned.userId === selectedUserId ? assigned.ids : NO_IDS;
  const loadingAssigned = !!selectedUserId && assigned.userId !== selectedUserId;

  useEffect(() => {
    let ignore = false;
    Promise.all([getUsers(), getRoles()])
      .then(([usersRes, rolesRes]) => {
        if (ignore) return;
        setUsers(usersRes.data);
        setAllRoles(rolesRes.data);
        if (paramUserId) {
          const match = usersRes.data.find((u) => String(u.id) === String(paramUserId));
          if (match) setSelectedUserId(match.id);
        }
      })
      .catch(() => {
        if (!ignore) setError("Could not load users or roles.");
      })
      .finally(() => {
        if (!ignore) setLoadingBase(false);
      });
    return () => { ignore = true; };
  }, [paramUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    let ignore = false;
    getUserRoles(selectedUserId)
      .then(({ data }) => {
        if (!ignore) setAssigned({ userId: selectedUserId, ids: new Set(data.map((r) => r.roleId)) });
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.response?.data?.message || "Could not load assigned roles.");
        setAssigned({ userId: selectedUserId, ids: NO_IDS });
      });
    return () => { ignore = true; };
  }, [selectedUserId]);

  const handleUserChange = (val) => {
    setError("");
    setSelectedUserId(val ?? null);
  };

  const handleToggle = async (roleId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(roleId));
    setError("");
    const userId = selectedUserId;
    try {
      if (checked) {
        await assignRoleToUser(userId, roleId);
      } else {
        await unassignRoleFromUser(userId, roleId);
      }
      setAssigned((prev) => {
        if (prev.userId !== userId) return prev;
        const ids = new Set(prev.ids);
        if (checked) ids.add(roleId);
        else ids.delete(roleId);
        return { ...prev, ids };
      });
    } catch (err) {
      setError(err.response?.data?.message || "Could not update role assignment.");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(roleId);
        return next;
      });
    }
  };

  const columns = [
    {
      title: "S.No.",
      width: 70,
      fixed: "left",
      render: (_, __, index) => index + 1,
    },
    {
      title: "Role Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Description",
      dataIndex: "description",
      render: (val) => val || "—",
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 100,
      render: (isActive) => (
        <Tag color={isActive ? "success" : "default"}>
          {isActive ? "Active" : "Inactive"}
        </Tag>
      ),
    },
    {
      title: "Assigned",
      width: 100,
      align: "center",
      render: (_, record) => {
        const isToggling = togglingIds.has(record.id);
        const isChecked = assignedIds.has(record.id);

        if (isToggling) return <Spin size="small" />;

        const canToggle = isChecked
          ? can("user-role.unassign")
          : can("user-role.assign");

        return (
          <Checkbox
            checked={isChecked}
            disabled={!selectedUserId || !canToggle}
            onChange={(e) => handleToggle(record.id, e.target.checked)}
          />
        );
      },
    },
  ];

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.username ? `${u.username} (${u.email})` : u.email,
      })),
    [users]
  );

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
          {/* User selector */}
          <div style={{ marginBottom: 20, flexShrink: 0 }}>
            <Text strong style={{ display: "block", marginBottom: 6 }}>
              Select User
            </Text>
            <Select
              className="assignment-select"
              placeholder="Select a user to manage their roles"
              loading={loadingBase}
              options={userOptions}
              value={selectedUserId}
              onChange={handleUserChange}
              style={{ width: "100%", maxWidth: 400 }}
              allowClear
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          {/* Roles table */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Table
              className="fill-parent-table"
              rowKey="id"
              dataSource={allRoles}
              columns={columns}
              loading={loadingBase || loadingAssigned}
              size="small"
              pagination={false}
              scroll={{ x: "max-content", y: "100%" }}
              locale={{ emptyText: "No roles found." }}
            />
          </div>
        </PageCard>
      </div>
    </DashboardLayout>
  );
}

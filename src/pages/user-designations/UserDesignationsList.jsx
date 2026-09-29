import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Select, Alert, Checkbox, Tag, Typography, Spin, Tooltip } from "antd";
import { StarFilled, StarOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getUserDesignations,
  assignDesignationToUser,
  setMainDesignation,
  unassignDesignationFromUser,
} from "../../api/userDesignationsApi";
import { getUsers } from "../../api/usersApi";
import { getDesignations } from "../../api/designationsApi";
import { useAuth } from "../../context/useAuth";

const { Text } = Typography;

const NO_ASSIGNMENTS = {};

export default function UserDesignationsList() {
  const [searchParams] = useSearchParams();
  const paramUserId = searchParams.get("userId");
  const { can } = useAuth();

  const [users, setUsers] = useState([]);
  const [allDesignations, setAllDesignations] = useState([]);

  // map: designationId -> { id, isMain }, tagged with the user it was loaded
  // for, so a stale map is never shown against a different selection and
  // "still loading" can be read off the mismatch.
  const [assigned, setAssigned] = useState({ userId: null, map: NO_ASSIGNMENTS });

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [togglingIds, setTogglingIds] = useState(new Set());   // designationIds being assigned/unassigned
  const [settingMainId, setSettingMainId] = useState(null);    // designationId being set as main
  const [error, setError] = useState("");

  const assignedMap = assigned.userId === selectedUserId ? assigned.map : NO_ASSIGNMENTS;
  const loadingAssigned = !!selectedUserId && assigned.userId !== selectedUserId;

  // Changes to the selected user's map are dropped if the selection has
  // moved on since the request went out.
  const updateAssignedMap = (userId, update) =>
    setAssigned((prev) => (prev.userId === userId ? { ...prev, map: update(prev.map) } : prev));

  useEffect(() => {
    let ignore = false;
    Promise.all([getUsers(), getDesignations()])
      .then(([usersRes, desRes]) => {
        if (ignore) return;
        setUsers(usersRes.data);
        setAllDesignations(desRes.data);
        if (paramUserId) {
          const match = usersRes.data.find((u) => String(u.id) === String(paramUserId));
          if (match) setSelectedUserId(match.id);
        }
      })
      .catch(() => {
        if (!ignore) setError("Could not load users or designations.");
      })
      .finally(() => {
        if (!ignore) setLoadingBase(false);
      });
    return () => { ignore = true; };
  }, [paramUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    let ignore = false;
    getUserDesignations(selectedUserId)
      .then(({ data }) => {
        if (ignore) return;
        const map = {};
        data.forEach((r) => { map[r.designationId] = { id: r.id, isMain: r.isMain }; });
        setAssigned({ userId: selectedUserId, map });
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.response?.data?.message || "Could not load assigned designations.");
        setAssigned({ userId: selectedUserId, map: NO_ASSIGNMENTS });
      });
    return () => { ignore = true; };
  }, [selectedUserId]);

  const handleUserChange = (val) => {
    setError("");
    setSelectedUserId(val ?? null);
  };

  const handleToggle = async (designationId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(designationId));
    setError("");
    const userId = selectedUserId;
    try {
      if (checked) {
        const { data } = await assignDesignationToUser(userId, designationId);
        updateAssignedMap(userId, (map) => ({
          ...map,
          [designationId]: { id: data.id, isMain: data.isMain },
        }));
      } else {
        await unassignDesignationFromUser(userId, designationId);
        updateAssignedMap(userId, (map) => {
          const next = { ...map };
          delete next[designationId];
          return next;
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not update designation assignment.");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(designationId);
        return next;
      });
    }
  };

  const handleSetMain = async (designationId) => {
    setSettingMainId(designationId);
    setError("");
    const userId = selectedUserId;
    try {
      await setMainDesignation(userId, designationId);
      // Update isMain in map: demote old main, promote new one
      updateAssignedMap(userId, (map) => {
        const next = {};
        Object.entries(map).forEach(([dId, val]) => {
          next[dId] = { ...val, isMain: Number(dId) === Number(designationId) };
        });
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.message || "Could not set main designation.");
    } finally {
      setSettingMainId(null);
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
      title: "Designation Name",
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
      title: "Main",
      width: 80,
      align: "center",
      render: (_, record) => {
        const entry = assignedMap[record.id];
        if (!entry) return null; // not assigned — no star

        if (settingMainId === record.id) return <Spin size="small" />;

        if (entry.isMain) {
          return (
            <Tooltip title="Main designation">
              <StarFilled style={{ color: "#1AB394", fontSize: 18 }} />
            </Tooltip>
          );
        }

        if (!can("user-designation.set-main")) {
          return (
            <Tooltip title="Not main designation">
              <StarOutlined style={{ color: "#bfbfbf", fontSize: 18 }} />
            </Tooltip>
          );
        }

        return (
          <Tooltip title="Set as main">
            <StarOutlined
              style={{ color: "#bfbfbf", fontSize: 18, cursor: "pointer" }}
              onClick={() => handleSetMain(record.id)}
            />
          </Tooltip>
        );
      },
    },
    {
      title: "Assigned",
      width: 100,
      align: "center",
      render: (_, record) => {
        const isToggling = togglingIds.has(record.id);
        const isChecked = !!assignedMap[record.id];

        if (isToggling) return <Spin size="small" />;

        const canToggle = isChecked
          ? can("user-designation.unassign")
          : can("user-designation.assign");

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
              placeholder="Select a user to manage their designations"
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

          {/* Designations table */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Table
              className="fill-parent-table"
              rowKey="id"
              dataSource={allDesignations}
              columns={columns}
              loading={loadingBase || loadingAssigned}
              size="small"
              pagination={false}
              scroll={{ x: "max-content", y: "100%" }}
              locale={{ emptyText: "No designations found." }}
            />
          </div>
        </PageCard>
      </div>
    </DashboardLayout>
  );
}

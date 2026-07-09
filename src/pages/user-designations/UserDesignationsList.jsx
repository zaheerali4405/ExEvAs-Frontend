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
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

export default function UserDesignationsList() {
  const [searchParams] = useSearchParams();
  const { can } = useAuth();

  const [users, setUsers] = useState([]);
  const [allDesignations, setAllDesignations] = useState([]);

  // assignedMap: designationId -> { id, isMain }
  const [assignedMap, setAssignedMap] = useState({});

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [togglingIds, setTogglingIds] = useState(new Set());   // designationIds being assigned/unassigned
  const [settingMainId, setSettingMainId] = useState(null);    // designationId being set as main
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingBase(true);
      try {
        const [usersRes, desRes] = await Promise.all([getUsers(), getDesignations()]);
        setUsers(usersRes.data);
        setAllDesignations(desRes.data);

        const paramId = searchParams.get("userId");
        if (paramId) {
          const match = usersRes.data.find((u) => String(u.id) === String(paramId));
          if (match) setSelectedUserId(match.id);
        }
      } catch {
        setError("Could not load users or designations.");
      } finally {
        setLoadingBase(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setAssignedMap({}); return; }
    (async () => {
      setLoadingAssigned(true);
      setError("");
      try {
        const { data } = await getUserDesignations(selectedUserId);
        // Build map: designationId -> { id, isMain }
        const map = {};
        data.forEach((r) => { map[r.designationId] = { id: r.id, isMain: r.isMain }; });
        setAssignedMap(map);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load assigned designations.");
      } finally {
        setLoadingAssigned(false);
      }
    })();
  }, [selectedUserId]);

  const handleToggle = async (designationId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(designationId));
    setError("");
    try {
      if (checked) {
        const { data } = await assignDesignationToUser(selectedUserId, designationId);
        setAssignedMap((prev) => ({
          ...prev,
          [designationId]: { id: data.id, isMain: data.isMain },
        }));
      } else {
        await unassignDesignationFromUser(selectedUserId, designationId);
        setAssignedMap((prev) => {
          const next = { ...prev };
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
    try {
      await setMainDesignation(selectedUserId, designationId);
      // Update isMain in map: demote old main, promote new one
      setAssignedMap((prev) => {
        const next = {};
        Object.entries(prev).forEach(([dId, val]) => {
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
        label: `${[u.firstName, u.lastName].filter(Boolean).join(" ")} (${u.username})`,
      })),
    [users]
  );

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
        {/* User selector */}
        <div style={{ marginBottom: 20 }}>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            Select User
          </Text>
          <Select
            className="assignment-select"
            placeholder="Select a user to manage their designations"
            loading={loadingBase}
            options={userOptions}
            value={selectedUserId}
            onChange={(val) => setSelectedUserId(val ?? null)}
            style={{ width: "100%", maxWidth: 400 }}
            allowClear
            showSearch
            filterOption={(input, option) =>
              option.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>

        {/* Designations table */}
        <div style={{ overflowX: "auto" }}>
          <Table
            rowKey="id"
            dataSource={allDesignations}
            columns={columns}
            loading={loadingBase || loadingAssigned}
            size="small"
            pagination={false}
            locale={{ emptyText: "No designations found." }}
          />
        </div>
      </PageCard>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Select, Alert, Checkbox, Tag, Typography, Spin } from "antd";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import {
  getDesignationRoles,
  assignRoleToDesignation,
  unassignRoleFromDesignation,
} from "../../api/designationRolesApi";
import { getDesignations } from "../../api/designationsApi";
import { getRoles } from "../../api/rolesApi";
import { useAuth } from "../../context/AuthContext";

const { Text } = Typography;

export default function DesignationRolesList() {
  const [searchParams] = useSearchParams();
  const { can } = useAuth();

  const [designations, setDesignations] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [assignedRecords, setAssignedRecords] = useState([]);

  const [selectedDesignationId, setSelectedDesignationId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [error, setError] = useState("");

  // Load designations + all roles once
  useEffect(() => {
    (async () => {
      setLoadingBase(true);
      try {
        const [desRes, rolesRes] = await Promise.all([getDesignations(), getRoles()]);
        setDesignations(desRes.data);
        setAllRoles(rolesRes.data);

        const paramId = searchParams.get("designationId");
        if (paramId) {
          const match = desRes.data.find((d) => String(d.id) === String(paramId));
          if (match) setSelectedDesignationId(match.id);
        }
      } catch {
        setError("Could not load designations or roles.");
      } finally {
        setLoadingBase(false);
      }
    })();
  }, []);

  // Load assigned roles when designation changes
  useEffect(() => {
    if (!selectedDesignationId) {
      setAssignedIds(new Set());
      setAssignedRecords([]);
      return;
    }
    (async () => {
      setLoadingAssigned(true);
      setError("");
      try {
        const { data } = await getDesignationRoles(selectedDesignationId);
        setAssignedRecords(data);
        setAssignedIds(new Set(data.map((r) => r.roleId)));
      } catch (err) {
        setError(err.response?.data?.message || "Could not load assigned roles.");
      } finally {
        setLoadingAssigned(false);
      }
    })();
  }, [selectedDesignationId]);

  const handleToggle = async (roleId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(roleId));
    setError("");
    try {
      if (checked) {
        const { data } = await assignRoleToDesignation(selectedDesignationId, roleId);
        setAssignedRecords((prev) => [...prev, data]);
        setAssignedIds((prev) => new Set(prev).add(roleId));
      } else {
        await unassignRoleFromDesignation(selectedDesignationId, roleId);
        setAssignedRecords((prev) => prev.filter((r) => r.roleId !== roleId));
        setAssignedIds((prev) => {
          const next = new Set(prev);
          next.delete(roleId);
          return next;
        });
      }
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
          ? can("designation-role.unassign")
          : can("designation-role.assign");

        return (
          <Checkbox
            checked={isChecked}
            disabled={!selectedDesignationId || !canToggle}
            onChange={(e) => handleToggle(record.id, e.target.checked)}
          />
        );
      },
    },
  ];

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
          {/* Designation selector */}
          <div style={{ marginBottom: 20, flexShrink: 0 }}>
            <Text strong style={{ display: "block", marginBottom: 6 }}>
              Select Designation
            </Text>
            <Select
              className="assignment-select"
              placeholder="Select a designation to manage its roles"
              loading={loadingBase}
              options={designations.map((d) => ({ value: d.id, label: d.name }))}
              value={selectedDesignationId}
              onChange={(val) => setSelectedDesignationId(val ?? null)}
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

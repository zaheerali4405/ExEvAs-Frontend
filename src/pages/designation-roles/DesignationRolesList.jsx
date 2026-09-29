import { useState, useEffect } from "react";
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
import { useAuth } from "../../context/useAuth";

const { Text } = Typography;

const NO_IDS = new Set();

export default function DesignationRolesList() {
  const [searchParams] = useSearchParams();
  const paramDesignationId = searchParams.get("designationId");
  const { can } = useAuth();

  const [designations, setDesignations] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  // Tagged with the designation they were loaded for, so a stale set is
  // never shown against a different selection and "still loading" can be
  // read off the mismatch.
  const [assigned, setAssigned] = useState({ designationId: null, ids: NO_IDS });

  const [selectedDesignationId, setSelectedDesignationId] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [error, setError] = useState("");

  const assignedIds = assigned.designationId === selectedDesignationId ? assigned.ids : NO_IDS;
  const loadingAssigned = !!selectedDesignationId && assigned.designationId !== selectedDesignationId;

  // Load designations + all roles once, preselecting the one named in the URL
  useEffect(() => {
    let ignore = false;
    Promise.all([getDesignations(), getRoles()])
      .then(([desRes, rolesRes]) => {
        if (ignore) return;
        setDesignations(desRes.data);
        setAllRoles(rolesRes.data);
        if (paramDesignationId) {
          const match = desRes.data.find((d) => String(d.id) === String(paramDesignationId));
          if (match) setSelectedDesignationId(match.id);
        }
      })
      .catch(() => {
        if (!ignore) setError("Could not load designations or roles.");
      })
      .finally(() => {
        if (!ignore) setLoadingBase(false);
      });
    return () => { ignore = true; };
  }, [paramDesignationId]);

  // Load assigned roles when designation changes
  useEffect(() => {
    if (!selectedDesignationId) return;
    let ignore = false;
    getDesignationRoles(selectedDesignationId)
      .then(({ data }) => {
        if (!ignore) setAssigned({ designationId: selectedDesignationId, ids: new Set(data.map((r) => r.roleId)) });
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.response?.data?.message || "Could not load assigned roles.");
        setAssigned({ designationId: selectedDesignationId, ids: NO_IDS });
      });
    return () => { ignore = true; };
  }, [selectedDesignationId]);

  const handleDesignationChange = (val) => {
    setError("");
    setSelectedDesignationId(val ?? null);
  };

  const handleToggle = async (roleId, checked) => {
    setTogglingIds((prev) => new Set(prev).add(roleId));
    setError("");
    const designationId = selectedDesignationId;
    try {
      if (checked) {
        await assignRoleToDesignation(designationId, roleId);
      } else {
        await unassignRoleFromDesignation(designationId, roleId);
      }
      setAssigned((prev) => {
        if (prev.designationId !== designationId) return prev;
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
              onChange={handleDesignationChange}
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

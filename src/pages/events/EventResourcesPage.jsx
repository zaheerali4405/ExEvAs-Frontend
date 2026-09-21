import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  Table, Select, InputNumber, Button, Alert, Space, Tooltip, Typography, Spin, Empty, Modal, Form, Tag,
} from "antd";
import { DeleteOutlined, EditOutlined, ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons";
import DashboardLayout from "../../layouts/DashboardLayout";
import PageCard from "../../components/PageCard";
import { getEvent } from "../../api/eventsApi";
import { getEventVenues, assignEventVenue, updateEventVenue, unassignEventVenue } from "../../api/eventVenuesApi";
import {
  getEventEquipment, assignEventEquipment, updateEventEquipment, unassignEventEquipment,
} from "../../api/eventEquipmentApi";
import { getEventDepartments, assignEventDepartment, unassignEventDepartment } from "../../api/eventDepartmentsApi";
import { getEventStaff, assignEventStaff, updateEventStaff, unassignEventStaff } from "../../api/eventStaffApi";
import { getVenues } from "../../api/venuesApi";
import { getEquipment } from "../../api/equipmentApi";
import { getDepartments } from "../../api/departmentsApi";
import { getEmployees } from "../../api/employeesApi";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;


const VENUE_CATEGORY_LABELS = {
  static: "Static",
  mobile: "Mobile",
  moderation: "Moderation",
};

const STATUS_LABELS = {
  hold:        "Hold",
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const STATUS_TAG_COLORS = {
  hold:        "default",
  scheduled:   "processing",
  in_progress: "warning",
  completed:   "success",
  cancelled:   "error",
};

const DUTY_TYPE_OPTIONS = [
  { value: "superintendent",        label: "Superintendent" },
  { value: "deputy_superintendent", label: "Deputy Superintendent" },
  { value: "invigilator",           label: "Invigilator" },
  { value: "nomes_admin",           label: "NOMES Admin" },
  { value: "facilitator",           label: "Facilitator" },
  { value: "water_man",             label: "Water Man" },
  { value: "janitorial",            label: "Janitorial" },
];
const DUTY_TYPE_LABELS = Object.fromEntries(DUTY_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const employeeLabel = (e) =>
  `${e.firstName}${e.lastName ? ` ${e.lastName}` : ""} (${e.department?.name ?? "—"})`;

export default function EventResourcesPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [assignedVenues, setAssignedVenues] = useState([]);
  const [allVenues, setAllVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [seats, setSeats] = useState(null);
  const [assigningVenue, setAssigningVenue] = useState(false);
  const [removingVenueId, setRemovingVenueId] = useState(null);
  const [editingVenueRow, setEditingVenueRow] = useState(null);
  const [venueModalLoading, setVenueModalLoading] = useState(false);
  const [venueForm] = Form.useForm();

  const [assignedEquipment, setAssignedEquipment] = useState([]);
  const [allEquipment, setAllEquipment] = useState([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(null);
  const [equipmentQuantity, setEquipmentQuantity] = useState(1);
  const [assigningEquipment, setAssigningEquipment] = useState(false);
  const [removingEquipmentId, setRemovingEquipmentId] = useState(null);
  const [editingEquipmentRow, setEditingEquipmentRow] = useState(null);
  const [equipmentModalLoading, setEquipmentModalLoading] = useState(false);
  const [equipmentForm] = Form.useForm();

  const canEditPastEvents = can("event.update-past");
  // A normal *.assign/*.unassign holder can only touch resources on today's
  // or future-dated events — a past event's resources require
  // event.update-past, same rule as editing the event's own details/time/
  // status. An event with no date yet is never "past".
  const isPastEvent = !!event?.eventDate && dayjs(event.eventDate).isBefore(dayjs().startOf("day"), "day");
  const pastLocked = isPastEvent && !canEditPastEvents;

  const canViewVenues = can("event-venue.read-all");
  const canAssignVenues = can("event-venue.assign") && !pastLocked;
  const canUnassignVenues = can("event-venue.unassign") && !pastLocked;
  const canViewEquipment = can("event-equipment.read-all");
  const canAssignEquipment = can("event-equipment.assign") && !pastLocked;
  const canUnassignEquipment = can("event-equipment.unassign") && !pastLocked;

  const [assignedDepartments, setAssignedDepartments] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [assigningDepartment, setAssigningDepartment] = useState(false);
  const [removingDepartmentId, setRemovingDepartmentId] = useState(null);

  const canViewDepartments = can("event-department.read-all");
  const canAssignDepartments = can("event-department.assign") && !pastLocked;
  const canUnassignDepartments = can("event-department.unassign") && !pastLocked;

  const [assignedStaff, setAssignedStaff] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedDutyType, setSelectedDutyType] = useState(null);
  const [assigningStaff, setAssigningStaff] = useState(false);
  const [removingStaffEmployeeId, setRemovingStaffEmployeeId] = useState(null);
  const [editingStaffRow, setEditingStaffRow] = useState(null);
  const [staffModalLoading, setStaffModalLoading] = useState(false);
  const [staffForm] = Form.useForm();

  const canViewStaff = can("event-staff.read-all");
  const canAssignStaff = can("event-staff.assign") && !pastLocked;
  const canUnassignStaff = can("event-staff.unassign") && !pastLocked;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await getEvent(eventId);
        setEvent(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load event.");
      } finally {
        setLoading(false);
      }

      if (canViewVenues) {
        try {
          const { data } = await getEventVenues(eventId);
          setAssignedVenues(data);
        } catch {
          // Non-fatal
        }
      }
      if (canAssignVenues) {
        try {
          const { data } = await getVenues();
          setAllVenues(data);
        } catch {
          // Non-fatal
        }
      }

      if (canViewEquipment) {
        try {
          const { data } = await getEventEquipment(eventId);
          setAssignedEquipment(data);
        } catch {
          // Non-fatal
        }
      }
      if (canAssignEquipment) {
        try {
          const { data } = await getEquipment();
          setAllEquipment(data);
        } catch {
          // Non-fatal
        }
      }

      if (canViewDepartments) {
        try {
          const { data } = await getEventDepartments(eventId);
          setAssignedDepartments(data);
        } catch {
          // Non-fatal
        }
      }
      if (canAssignDepartments || canAssignStaff) {
        try {
          const { data } = await getDepartments();
          setAllDepartments(data);
        } catch {
          // Non-fatal
        }
      }

      if (canViewStaff) {
        try {
          const { data } = await getEventStaff(eventId);
          setAssignedStaff(data);
        } catch {
          // Non-fatal
        }
      }
      if (canAssignStaff) {
        try {
          const { data } = await getEmployees();
          setAllEmployees(data);
        } catch {
          // Non-fatal
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // How many venues one occurrence may hold comes from its (exam category,
  // exam scope) pair, resolved server-side and served on the event itself —
  // set per cell on the Exam Category Rules page. The same check runs again
  // in EventVenuesService, so this only decides whether to offer the form.
  const canAddMoreVenues = !!event?.rules?.allowsMultipleVenues || assignedVenues.length === 0;

  const availableVenueOptions = useMemo(() => {
    const assignedIds = new Set(assignedVenues.map((v) => v.venueId));
    return allVenues
      .filter((v) => v.isActive && !assignedIds.has(v.id))
      .map((v) => ({ value: v.id, label: `${v.name} (${VENUE_CATEGORY_LABELS[v.category] ?? "—"}, capacity ${v.capacity})` }));
  }, [allVenues, assignedVenues]);

  const selectedVenue = useMemo(
    () => allVenues.find((v) => v.id === selectedVenueId) ?? null,
    [allVenues, selectedVenueId]
  );

  const availableEquipmentOptions = useMemo(() => {
    const assignedIds = new Set(assignedEquipment.map((e) => e.equipmentId));
    return allEquipment
      .filter((e) => e.isActive && !assignedIds.has(e.id))
      .map((e) => ({ value: e.id, label: e.name }));
  }, [allEquipment, assignedEquipment]);

  // Whole department hierarchy (top-level root + every descendant, across all
  // institutes) of every department already linked to this event — an
  // employee from any of these is ineligible for staff duty (conflict of
  // interest), mirroring EventStaffService.assertEmployeeEligible.
  const blockedDepartmentIds = useMemo(() => {
    if (!allDepartments.length || !assignedDepartments.length) return new Set();
    const byId = new Map(allDepartments.map((d) => [d.id, d]));
    const childrenOf = new Map();
    allDepartments.forEach((d) => {
      if (d.parentId == null) return;
      const siblings = childrenOf.get(d.parentId) || [];
      siblings.push(d.id);
      childrenOf.set(d.parentId, siblings);
    });
    const rootOf = (id) => {
      let current = byId.get(id);
      while (current?.parentId != null) current = byId.get(current.parentId);
      return current?.id ?? id;
    };
    const blocked = new Set();
    const collectSubtree = (id) => {
      if (blocked.has(id)) return;
      blocked.add(id);
      (childrenOf.get(id) || []).forEach(collectSubtree);
    };
    assignedDepartments.forEach((ed) => collectSubtree(rootOf(ed.departmentId)));
    return blocked;
  }, [allDepartments, assignedDepartments]);

  const availableEmployeeOptions = useMemo(() => {
    const assignedIds = new Set(assignedStaff.map((s) => s.employeeId));
    return allEmployees
      .filter((e) => e.isActive && !assignedIds.has(e.id) && !blockedDepartmentIds.has(e.departmentId))
      .map((e) => ({ value: e.id, label: employeeLabel(e) }));
  }, [allEmployees, assignedStaff, blockedDepartmentIds]);

  // Edit-staff modal offers currently-eligible/unassigned employees plus
  // whichever employee the row being edited already has (so leaving it
  // unchanged is always an option, even if their department is now blocked).
  const editStaffOptions = useMemo(() => {
    if (!editingStaffRow) return availableEmployeeOptions;
    const current = allEmployees.find((e) => e.id === editingStaffRow.employeeId);
    if (!current) return availableEmployeeOptions;
    return [{ value: current.id, label: employeeLabel(current) }, ...availableEmployeeOptions];
  }, [availableEmployeeOptions, allEmployees, editingStaffRow]);

  const availableDepartmentOptions = useMemo(() => {
    const assignedIds = new Set(assignedDepartments.map((d) => d.departmentId));
    return allDepartments
      .filter((d) => d.isActive && !assignedIds.has(d.id))
      .map((d) => ({ value: d.id, label: d.name }));
  }, [allDepartments, assignedDepartments]);

  // Edit-venue modal offers currently-unassigned venues plus whichever venue
  // the row being edited already has (so leaving it unchanged is an option).
  const editVenueOptions = useMemo(() => {
    if (!editingVenueRow) return availableVenueOptions;
    const current = allVenues.find((v) => v.id === editingVenueRow.venueId);
    if (!current) return availableVenueOptions;
    return [
      { value: current.id, label: `${current.name} (${VENUE_CATEGORY_LABELS[current.category] ?? "—"}, capacity ${current.capacity})` },
      ...availableVenueOptions,
    ];
  }, [availableVenueOptions, allVenues, editingVenueRow]);

  const editEquipmentOptions = useMemo(() => {
    if (!editingEquipmentRow) return availableEquipmentOptions;
    const current = allEquipment.find((e) => e.id === editingEquipmentRow.equipmentId);
    if (!current) return availableEquipmentOptions;
    return [
      { value: current.id, label: current.name },
      ...availableEquipmentOptions,
    ];
  }, [availableEquipmentOptions, allEquipment, editingEquipmentRow]);

  // Assigning/unassigning a resource can flip the event's status server-side
  // (Hold<->Scheduled) — refetch so the header and any status-dependent UI
  // stay accurate.
  const refreshEventStatus = async () => {
    try {
      const { data } = await getEvent(eventId);
      setEvent(data);
    } catch {
      // Non-fatal: the header just shows the last-known status.
    }
  };

  const handleAssignVenue = async () => {
    if (!selectedVenueId || !seats) return;
    setAssigningVenue(true);
    setError("");
    try {
      const { data } = await assignEventVenue(eventId, selectedVenueId, seats);
      setAssignedVenues((prev) => [...prev, data]);
      setSelectedVenueId(null);
      setSeats(null);
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not assign venue.");
    } finally {
      setAssigningVenue(false);
    }
  };

  const handleUnassignVenue = async (venueId) => {
    setRemovingVenueId(venueId);
    setError("");
    try {
      await unassignEventVenue(eventId, venueId);
      setAssignedVenues((prev) => prev.filter((v) => v.venueId !== venueId));
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove venue.");
    } finally {
      setRemovingVenueId(null);
    }
  };

  const openEditVenueModal = (record) => {
    setEditingVenueRow(record);
    venueForm.setFieldsValue({ venueId: record.venueId, seats: record.seats });
  };

  const handleEditVenueFinish = async (values) => {
    setVenueModalLoading(true);
    setError("");
    try {
      const { data } = await updateEventVenue(eventId, editingVenueRow.venueId, values.venueId, values.seats);
      setAssignedVenues((prev) => prev.map((v) => (v.id === editingVenueRow.id ? data : v)));
      setEditingVenueRow(null);
      venueForm.resetFields();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update venue assignment.");
    } finally {
      setVenueModalLoading(false);
    }
  };

  const handleAssignEquipment = async () => {
    if (!selectedEquipmentId) return;
    setAssigningEquipment(true);
    setError("");
    try {
      const { data } = await assignEventEquipment(eventId, selectedEquipmentId, equipmentQuantity);
      setAssignedEquipment((prev) => [...prev, data]);
      setSelectedEquipmentId(null);
      setEquipmentQuantity(1);
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not assign equipment.");
    } finally {
      setAssigningEquipment(false);
    }
  };

  const handleUnassignEquipment = async (equipmentId) => {
    setRemovingEquipmentId(equipmentId);
    setError("");
    try {
      await unassignEventEquipment(eventId, equipmentId);
      setAssignedEquipment((prev) => prev.filter((e) => e.equipmentId !== equipmentId));
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove equipment.");
    } finally {
      setRemovingEquipmentId(null);
    }
  };

  const handleAssignStaff = async () => {
    if (!selectedEmployeeId || !selectedDutyType) return;
    setAssigningStaff(true);
    setError("");
    try {
      const { data } = await assignEventStaff(eventId, selectedEmployeeId, selectedDutyType);
      setAssignedStaff((prev) => [...prev, data]);
      setSelectedEmployeeId(null);
      setSelectedDutyType(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not assign staff.");
    } finally {
      setAssigningStaff(false);
    }
  };

  const handleUnassignStaff = async (employeeId) => {
    setRemovingStaffEmployeeId(employeeId);
    setError("");
    try {
      await unassignEventStaff(eventId, employeeId);
      setAssignedStaff((prev) => prev.filter((s) => s.employeeId !== employeeId));
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove staff.");
    } finally {
      setRemovingStaffEmployeeId(null);
    }
  };

  const openEditStaffModal = (record) => {
    setEditingStaffRow(record);
    staffForm.setFieldsValue({ employeeId: record.employeeId, dutyType: record.dutyType });
  };

  const handleEditStaffFinish = async (values) => {
    setStaffModalLoading(true);
    setError("");
    try {
      const { data } = await updateEventStaff(eventId, editingStaffRow.employeeId, values.employeeId, values.dutyType);
      setAssignedStaff((prev) => prev.map((s) => (s.id === editingStaffRow.id ? data : s)));
      setEditingStaffRow(null);
      staffForm.resetFields();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update staff assignment.");
    } finally {
      setStaffModalLoading(false);
    }
  };

  const handleAssignDepartment = async () => {
    if (!selectedDepartmentId) return;
    setAssigningDepartment(true);
    setError("");
    try {
      const { data } = await assignEventDepartment(eventId, selectedDepartmentId);
      setAssignedDepartments((prev) => [...prev, data]);
      setSelectedDepartmentId(null);
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not link department.");
    } finally {
      setAssigningDepartment(false);
    }
  };

  const handleUnassignDepartment = async (departmentId) => {
    setRemovingDepartmentId(departmentId);
    setError("");
    try {
      await unassignEventDepartment(eventId, departmentId);
      setAssignedDepartments((prev) => prev.filter((d) => d.departmentId !== departmentId));
      await refreshEventStatus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove department.");
    } finally {
      setRemovingDepartmentId(null);
    }
  };

  const openEditEquipmentModal = (record) => {
    setEditingEquipmentRow(record);
    equipmentForm.setFieldsValue({ equipmentId: record.equipmentId, quantity: record.quantity });
  };

  const handleEditEquipmentFinish = async (values) => {
    setEquipmentModalLoading(true);
    setError("");
    try {
      const { data } = await updateEventEquipment(
        eventId, editingEquipmentRow.equipmentId, values.equipmentId, values.quantity
      );
      setAssignedEquipment((prev) => prev.map((e) => (e.id === editingEquipmentRow.id ? data : e)));
      setEditingEquipmentRow(null);
      equipmentForm.resetFields();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update equipment assignment.");
    } finally {
      setEquipmentModalLoading(false);
    }
  };

  const venueColumns = [
    { title: "Name", render: (_, r) => r.venue?.name ?? "—" },
    { title: "Category", render: (_, r) => VENUE_CATEGORY_LABELS[r.venue?.category] ?? "—" },
    { title: "Location", render: (_, r) => r.venue?.location ?? "—" },
    { title: "Seats Reserved", width: 130, render: (_, r) => r.seats ?? "—" },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, r) => (
        <Space>
          {canAssignVenues && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditVenueModal(r)} />
            </Tooltip>
          )}
          {canUnassignVenues && (
            <Tooltip title="Remove">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={removingVenueId === r.venueId}
                onClick={() => handleUnassignVenue(r.venueId)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const departmentColumns = [
    { title: "Name", render: (_, r) => r.department?.name ?? "—" },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, r) => (
        <Space>
          {canUnassignDepartments && (
            <Tooltip title="Remove">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={removingDepartmentId === r.departmentId}
                onClick={() => handleUnassignDepartment(r.departmentId)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const staffColumns = [
    { title: "Name", render: (_, r) => `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() || "—" },
    { title: "Department", render: (_, r) => r.employee?.department?.name ?? "—" },
    { title: "Duty", width: 160, render: (_, r) => DUTY_TYPE_LABELS[r.dutyType] ?? r.dutyType },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, r) => (
        <Space>
          {canAssignStaff && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditStaffModal(r)} />
            </Tooltip>
          )}
          {canUnassignStaff && (
            <Tooltip title="Remove">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={removingStaffEmployeeId === r.employeeId}
                onClick={() => handleUnassignStaff(r.employeeId)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const equipmentColumns = [
    { title: "Name", render: (_, r) => r.equipment?.name ?? "—" },
    { title: "Description", render: (_, r) => r.equipment?.description || "—" },
    { title: "Quantity", width: 100, render: (_, r) => r.quantity },
    {
      title: "Actions",
      width: 100,
      align: "center",
      render: (_, r) => (
        <Space>
          {canAssignEquipment && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditEquipmentModal(r)} />
            </Tooltip>
          )}
          {canUnassignEquipment && (
            <Tooltip title="Remove">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={removingEquipmentId === r.equipmentId}
                onClick={() => handleUnassignEquipment(r.equipmentId)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout
      headerAction={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/events")}>
          Back to Events
        </Button>
      }
    >
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

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : event ? (
        <>
          <PageCard
            style={{
              marginBottom: 16,
              textAlign: "center",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            <Title level={5} style={{ margin: 0 }}>{event.fullName}</Title>
            <Space size={8} style={{ marginTop: 4 }}>
              <Text type="secondary">{event.examType?.fullName ?? "—"}</Text>
              <Tag color={STATUS_TAG_COLORS[event.status]}>{STATUS_LABELS[event.status]}</Tag>
            </Space>
          </PageCard>

          {pastLocked && (
            <Alert
              type="warning"
              showIcon
              message="This event's date has already passed — resources can no longer be changed without permission to edit past events."
              style={{ marginBottom: 16 }}
            />
          )}

          {canViewDepartments ? (
            <PageCard style={{ marginBottom: 16, paddingTop: 12 }}>
              <Title level={5} style={{ marginTop: 0 }}>Departments</Title>

              {canAssignDepartments && (
                <Space style={{ marginBottom: 16 }} wrap>
                  <Select
                    className="assignment-select"
                    placeholder="Select a department to link"
                    options={availableDepartmentOptions}
                    value={selectedDepartmentId}
                    onChange={setSelectedDepartmentId}
                    showSearch
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                    style={{ width: 280 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!selectedDepartmentId}
                    loading={assigningDepartment}
                    onClick={handleAssignDepartment}
                  >
                    Assign
                  </Button>
                </Space>
              )}

              <div style={{ overflowX: "auto" }}>
                <Table
                  rowKey="id"
                  dataSource={assignedDepartments}
                  columns={departmentColumns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="No departments linked." /> }}
                />
              </div>
            </PageCard>
          ) : null}

          {canViewVenues ? (
            <PageCard style={{ marginBottom: 16, paddingTop: 12 }}>
              <Title level={5} style={{ marginTop: 0 }}>Venues</Title>

              {canAssignVenues && canAddMoreVenues && (
                <Space style={{ marginBottom: 16 }} wrap>
                  <Select
                    className="assignment-select"
                    placeholder="Select a venue to assign"
                    options={availableVenueOptions}
                    value={selectedVenueId}
                    onChange={(val) => { setSelectedVenueId(val); setSeats(null); }}
                    showSearch
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                    style={{ width: 320 }}
                  />
                  <InputNumber
                    className="assignment-select"
                    placeholder="No. of seats"
                    min={1}
                    max={selectedVenue?.capacity}
                    value={seats}
                    onChange={setSeats}
                    disabled={!selectedVenueId}
                    style={{ width: 130 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!selectedVenueId || !seats}
                    loading={assigningVenue}
                    onClick={handleAssignVenue}
                  >
                    Assign
                  </Button>
                </Space>
              )}

              <div style={{ overflowX: "auto" }}>
                <Table
                  rowKey="id"
                  dataSource={assignedVenues}
                  columns={venueColumns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="No venues assigned." /> }}
                />
              </div>
            </PageCard>
          ) : null}

          {canViewEquipment ? (
            <PageCard style={{ paddingTop: 12 }}>
              <Title level={5} style={{ marginTop: 0 }}>Equipment</Title>

              {canAssignEquipment && (
                <Space style={{ marginBottom: 16 }} wrap>
                  <Select
                    className="assignment-select"
                    placeholder="Select equipment to assign"
                    options={availableEquipmentOptions}
                    value={selectedEquipmentId}
                    onChange={setSelectedEquipmentId}
                    showSearch
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                    style={{ width: 240 }}
                  />
                  <InputNumber
                    className="assignment-select"
                    min={1}
                    value={equipmentQuantity}
                    onChange={(val) => setEquipmentQuantity(val || 1)}
                    style={{ width: 100 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!selectedEquipmentId}
                    loading={assigningEquipment}
                    onClick={handleAssignEquipment}
                  >
                    Assign
                  </Button>
                </Space>
              )}

              <div style={{ overflowX: "auto" }}>
                <Table
                  rowKey="id"
                  dataSource={assignedEquipment}
                  columns={equipmentColumns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="No equipment assigned." /> }}
                />
              </div>
            </PageCard>
          ) : null}

          {canViewStaff ? (
            <PageCard style={{ marginTop: 16, paddingTop: 12 }}>
              <Title level={5} style={{ marginTop: 0 }}>Staff</Title>

              {canAssignStaff && (
                <Space style={{ marginBottom: 16 }} wrap>
                  <Select
                    className="assignment-select"
                    placeholder="Select an employee to assign"
                    options={availableEmployeeOptions}
                    value={selectedEmployeeId}
                    onChange={setSelectedEmployeeId}
                    showSearch
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                    style={{ width: 300 }}
                  />
                  <Select
                    className="assignment-select"
                    placeholder="Select duty"
                    options={DUTY_TYPE_OPTIONS}
                    value={selectedDutyType}
                    onChange={setSelectedDutyType}
                    style={{ width: 200 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!selectedEmployeeId || !selectedDutyType}
                    loading={assigningStaff}
                    onClick={handleAssignStaff}
                  >
                    Assign
                  </Button>
                </Space>
              )}

              <div style={{ overflowX: "auto" }}>
                <Table
                  rowKey="id"
                  dataSource={assignedStaff}
                  columns={staffColumns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="No staff assigned." /> }}
                />
              </div>
            </PageCard>
          ) : null}

          {!canViewDepartments && !canViewVenues && !canViewEquipment && !canViewStaff && (
            <PageCard>
              <Text type="secondary">You do not have permission to view resources for this event.</Text>
            </PageCard>
          )}
        </>
      ) : null}

      {/* Edit Venue Assignment Modal */}
      <Modal
        title="Edit Venue Assignment"
        open={!!editingVenueRow}
        onCancel={() => { setEditingVenueRow(null); venueForm.resetFields(); }}
        onOk={() => venueForm.submit()}
        okText="Save"
        confirmLoading={venueModalLoading}
        destroyOnHidden
        centered
      >
        <Form
          form={venueForm}
          layout="vertical"
          onFinish={handleEditVenueFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="venueId"
            label="Venue"
            rules={[{ required: true, message: "Please select a venue." }]}
          >
            <Select
              className="assignment-select"
              placeholder="Select venue"
              options={editVenueOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item
            name="seats"
            label="No. of Seats"
            rules={[{ required: true, message: "Please enter number of seats." }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Equipment Assignment Modal */}
      <Modal
        title="Edit Equipment Assignment"
        open={!!editingEquipmentRow}
        onCancel={() => { setEditingEquipmentRow(null); equipmentForm.resetFields(); }}
        onOk={() => equipmentForm.submit()}
        okText="Save"
        confirmLoading={equipmentModalLoading}
        destroyOnHidden
        centered
      >
        <Form
          form={equipmentForm}
          layout="vertical"
          onFinish={handleEditEquipmentFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="equipmentId"
            label="Equipment"
            rules={[{ required: true, message: "Please select equipment." }]}
          >
            <Select
              className="assignment-select"
              placeholder="Select equipment"
              options={editEquipmentOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[{ required: true, message: "Please enter quantity." }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
      {/* Edit Staff Assignment Modal */}
      <Modal
        title="Edit Staff Assignment"
        open={!!editingStaffRow}
        onCancel={() => { setEditingStaffRow(null); staffForm.resetFields(); }}
        onOk={() => staffForm.submit()}
        okText="Save"
        confirmLoading={staffModalLoading}
        destroyOnHidden
        centered
      >
        <Form
          form={staffForm}
          layout="vertical"
          onFinish={handleEditStaffFinish}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="employeeId"
            label="Employee"
            rules={[{ required: true, message: "Please select an employee." }]}
          >
            <Select
              className="assignment-select"
              placeholder="Select employee"
              options={editStaffOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item
            name="dutyType"
            label="Duty"
            rules={[{ required: true, message: "Please select a duty." }]}
          >
            <Select className="assignment-select" placeholder="Select duty" options={DUTY_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
}

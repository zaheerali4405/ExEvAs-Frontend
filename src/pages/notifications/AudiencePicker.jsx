import { useState, useEffect, useMemo } from "react";
import { Tabs, Select, Table, Input } from "antd";
import { getEmployees } from "../../api/employeesApi";
import { getStudents } from "../../api/studentsApi";

const employeeName = (e) => [e.firstName, e.lastName].filter(Boolean).join(" ");
const studentName = (s) => [s.firstName, s.lastName].filter(Boolean).join(" ");
const classLabel = (cls) => {
  if (!cls) return "—";
  const program = cls.program?.shortName || cls.program?.fullName || "";
  const degreeLevel = cls.degreeLevel?.shortName || cls.degreeLevel?.fullName || "";
  const session = cls.session?.name || "";
  return [program, degreeLevel, session].filter(Boolean).join(" – ");
};

// ~6 rows visible before scrolling, small-size table (row height ~39px).
const TABLE_SCROLL_Y = 234;

// Manual notification audience picker — three tabs (Faculty / Administrative
// Staff / Candidates), each a filterable, checkbox-selectable table that
// scrolls internally rather than paginating. Selection is tracked directly
// as resolved User ids (employee.user.id / student.user.id) since that's
// exactly the recipientUserIds shape the backend expects — no separate
// "audience rule" is stored, this is a one-time direct pick.
export default function AudiencePicker({ value = [], onChange }) {
  const [employees, setEmployees] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState(null);
  const [adminDepartmentFilter, setAdminDepartmentFilter] = useState(null);
  const [classFilter, setClassFilter] = useState(null);
  const [facultySearch, setFacultySearch] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [empRes, stuRes] = await Promise.all([getEmployees(), getStudents()]);
        setEmployees(empRes.data.filter((e) => e.isActive));
        setStudents(stuRes.data.filter((s) => s.isActive));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const faculty = useMemo(() => employees.filter((e) => e.employeeCategory === "faculty"), [employees]);
  const adminStaff = useMemo(() => employees.filter((e) => e.employeeCategory === "administrative"), [employees]);

  const facultyUserIds = useMemo(() => new Set(faculty.map((e) => e.user.id)), [faculty]);
  const adminUserIds = useMemo(() => new Set(adminStaff.map((e) => e.user.id)), [adminStaff]);
  const studentUserIds = useMemo(() => new Set(students.map((s) => s.user.id)), [students]);

  const selectedFacultyKeys = value.filter((id) => facultyUserIds.has(id));
  const selectedAdminKeys = value.filter((id) => adminUserIds.has(id));
  const selectedStudentKeys = value.filter((id) => studentUserIds.has(id));

  // Pins already-selected rows to the top of a tab's own list, preserving
  // relative order within each group — so ticking a row keeps it visible
  // instead of it staying wherever the unfiltered/sorted data placed it.
  const pinSelectedFirst = (list, selectedIds, keyFn) => {
    const selected = new Set(selectedIds);
    const picked = [];
    const rest = [];
    for (const item of list) {
      (selected.has(keyFn(item)) ? picked : rest).push(item);
    }
    return [...picked, ...rest];
  };

  const departmentOptions = useMemo(() => {
    const seen = new Map();
    faculty.forEach((e) => { if (e.department) seen.set(e.department.id, e.department.name); });
    return [...seen.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [faculty]);

  const adminDepartmentOptions = useMemo(() => {
    const seen = new Map();
    adminStaff.forEach((e) => { if (e.department) seen.set(e.department.id, e.department.name); });
    return [...seen.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [adminStaff]);

  const classOptions = useMemo(() => {
    const seen = new Map();
    students.forEach((s) => { if (s.class) seen.set(s.class.id, classLabel(s.class)); });
    return [...seen.entries()].map(([id, label]) => ({ value: id, label }));
  }, [students]);

  const filterEmployees = (list, departmentFilterValue, search) => {
    const term = search.trim().toLowerCase();
    return list.filter((e) => {
      if (departmentFilterValue && e.department?.id !== departmentFilterValue) return false;
      if (term && !employeeName(e).toLowerCase().includes(term)) return false;
      return true;
    });
  };

  const filteredFaculty = useMemo(
    () => pinSelectedFirst(filterEmployees(faculty, departmentFilter, facultySearch), selectedFacultyKeys, (e) => e.user.id),
    [faculty, departmentFilter, facultySearch, selectedFacultyKeys]
  );
  const filteredAdminStaff = useMemo(
    () => pinSelectedFirst(filterEmployees(adminStaff, adminDepartmentFilter, adminSearch), selectedAdminKeys, (e) => e.user.id),
    [adminStaff, adminDepartmentFilter, adminSearch, selectedAdminKeys]
  );

  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    const matching = students.filter((s) => {
      if (classFilter && s.class?.id !== classFilter) return false;
      if (term && !studentName(s).toLowerCase().includes(term)) return false;
      return true;
    });
    return pinSelectedFirst(matching, selectedStudentKeys, (s) => s.user.id);
  }, [students, classFilter, studentSearch, selectedStudentKeys]);

  const employeeColumns = [
    { title: "Name", render: (_, e) => employeeName(e) },
    { title: "Department", render: (_, e) => e.department?.name ?? "—" },
  ];

  const studentColumns = [
    { title: "Name", render: (_, s) => studentName(s) },
    { title: "Class", render: (_, s) => classLabel(s.class) },
  ];

  return (
    <div>
      <Tabs
        items={[
          {
            key: "faculty",
            label: `Faculty${selectedFacultyKeys.length ? ` (${selectedFacultyKeys.length})` : ""}`,
            children: (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Select
                    placeholder="Filter by department"
                    allowClear
                    options={departmentOptions}
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    style={{ width: 220 }}
                  />
                  <Input
                    placeholder="Search name..."
                    allowClear
                    value={facultySearch}
                    onChange={(e) => setFacultySearch(e.target.value)}
                    style={{ width: 220 }}
                  />
                </div>
                <Table
                  rowKey={(e) => e.user.id}
                  dataSource={filteredFaculty}
                  columns={employeeColumns}
                  loading={loading}
                  size="small"
                  pagination={false}
                  scroll={{ y: TABLE_SCROLL_Y }}
                  rowSelection={{
                    selectedRowKeys: selectedFacultyKeys,
                    onChange: (keys) => onChange([...keys, ...selectedAdminKeys, ...selectedStudentKeys]),
                  }}
                />
              </>
            ),
          },
          {
            key: "admin-staff",
            label: `Adm Staff${selectedAdminKeys.length ? ` (${selectedAdminKeys.length})` : ""}`,
            children: (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Select
                    placeholder="Filter by department"
                    allowClear
                    options={adminDepartmentOptions}
                    value={adminDepartmentFilter}
                    onChange={setAdminDepartmentFilter}
                    style={{ width: 220 }}
                  />
                  <Input
                    placeholder="Search name..."
                    allowClear
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    style={{ width: 220 }}
                  />
                </div>
                <Table
                  rowKey={(e) => e.user.id}
                  dataSource={filteredAdminStaff}
                  columns={employeeColumns}
                  loading={loading}
                  size="small"
                  pagination={false}
                  scroll={{ y: TABLE_SCROLL_Y }}
                  rowSelection={{
                    selectedRowKeys: selectedAdminKeys,
                    onChange: (keys) => onChange([...selectedFacultyKeys, ...keys, ...selectedStudentKeys]),
                  }}
                />
              </>
            ),
          },
          {
            key: "candidates",
            label: `Candidates${selectedStudentKeys.length ? ` (${selectedStudentKeys.length})` : ""}`,
            children: (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Select
                    placeholder="Filter by class"
                    allowClear
                    options={classOptions}
                    value={classFilter}
                    onChange={setClassFilter}
                    style={{ width: 260 }}
                  />
                  <Input
                    placeholder="Search name..."
                    allowClear
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    style={{ width: 220 }}
                  />
                </div>
                <Table
                  rowKey={(s) => s.user.id}
                  dataSource={filteredStudents}
                  columns={studentColumns}
                  loading={loading}
                  size="small"
                  pagination={false}
                  scroll={{ y: TABLE_SCROLL_Y }}
                  rowSelection={{
                    selectedRowKeys: selectedStudentKeys,
                    onChange: (keys) => onChange([...selectedFacultyKeys, ...selectedAdminKeys, ...keys]),
                  }}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

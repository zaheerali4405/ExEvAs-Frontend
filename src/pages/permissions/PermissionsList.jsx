import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Download, Search, Trash2 } from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";
import ConfirmDialog from "../../components/ConfirmDialog";
import SortButton from "../../components/table/SortButton";
import Pagination from "../../components/table/Pagination";
import { getPermissions, setPermissionStatus } from "../../api/permissionsApi";
import { exportToExcel } from "../../utils/exportExcel";

const searchableColumns = [
  { key: "permissionKey", label: "Permission Key" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500, 1000, "All"];

export default function PermissionsList() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);

  const [searchBy, setSearchBy] = useState(""); // '' = "Search By" (all columns)
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchPermissions = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getPermissions();
      setPermissions(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const getFieldValue = (item, key) => {
    if (key === "status") return item.isActive ? "Active" : "Inactive";
    return item[key] ?? "";
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return permissions;
    const term = searchTerm.toLowerCase();

    if (!searchBy) {
      // No column selected — search across all searchable columns
      return permissions.filter((item) =>
        searchableColumns.some((col) =>
          String(getFieldValue(item, col.key)).toLowerCase().includes(term),
        ),
      );
    }

    return permissions.filter((item) =>
      String(getFieldValue(item, searchBy)).toLowerCase().includes(term),
    );
  }, [permissions, searchBy, searchTerm]);

  const sorted = useMemo(() => {
    if (!sortColumn || !sortDirection) return filtered;
    return [...filtered].sort((a, b) => {
      const valA = String(getFieldValue(a, sortColumn)).toLowerCase();
      const valB = String(getFieldValue(b, sortColumn)).toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortColumn, sortDirection]);

  const effectivePageSize = pageSize === "All" ? sorted.length || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(sorted.length / effectivePageSize));
  const paginated = sorted.slice(
    (currentPage - 1) * effectivePageSize,
    currentPage * effectivePageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchBy, pageSize]);

  const handleSort = (column) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortDirection("asc");
    }
  };

  const handleToggleClick = (permission) => {
    setConfirmTarget({
      id: permission.id,
      permissionKey: permission.permissionKey,
      nextStatus: !permission.isActive,
    });
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    try {
      await setPermissionStatus(confirmTarget.id, confirmTarget.nextStatus);
      setPermissions((prev) =>
        prev.map((p) =>
          p.id === confirmTarget.id
            ? { ...p, isActive: confirmTarget.nextStatus }
            : p,
        ),
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not update status.");
    } finally {
      setConfirmTarget(null);
    }
  };

  const handleExport = () => {
    // Export only what's currently visible on screen (current page)
    exportToExcel(
      paginated,
      [
        {
          label: "S.No.",
          accessor: (_, idx) => (currentPage - 1) * effectivePageSize + idx + 1,
        },
        { label: "Permission Key", accessor: (r) => r.permissionKey },
        { label: "Description", accessor: (r) => r.description || "" },
        {
          label: "Status",
          accessor: (r) => (r.isActive ? "Active" : "Inactive"),
        },
      ],
      "permissions",
    );
  };

  const columns = [
    { key: "permissionKey", label: "Permission Key" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
  ];

  const startEntry =
    sorted.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const endEntry = Math.min(currentPage * effectivePageSize, sorted.length);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-700">Permissions</h1>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Add Permission
        </button>
      </div>

      {error && <div className="alert-danger mb-4">{error}</div>}

      <div className="bg-white rounded-md border border-gray-200 overflow-scroll md:overflow-hidden p-5">
        {/* Header section */}
        <div className="flex items-center justify-end gap-2">
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="input-field w-auto cursor-pointer border-gray-300"
          >
            <option value="">Search By</option>
            {searchableColumns.map((col) => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </select>

          <div className="relative w-auto">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9"
            />
          </div>

          <button
            onClick={handleExport}
            className="btn-transparent flex items-center gap-2 py-1"
          >
            <Download size={16} />
            Download Excel
          </button>
        </div>

        {/* Table body */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 font-bold text-gray-600 w-16">
                S.No.
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left py-3 font-bold text-gray-600"
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    <SortButton
                      active={sortColumn === col.key}
                      direction={sortDirection}
                      onClick={() => handleSort(col.key)}
                    />
                  </div>
                </th>
              ))}
              <th className="text-right py-3 font-bold text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center px-4 py-8"
                  style={{ color: "var(--page-text)" }}
                >
                  Loading...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center px-4 py-8"
                  style={{ color: "var(--page-text)" }}
                >
                  No permissions found.
                </td>
              </tr>
            ) : (
              paginated.map((permission, idx) => (
                <tr
                  key={permission.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-100 transition-colors"
                >
                  <td
                    className=""
                    style={{ color: "var(--page-text)" }}
                  >
                    {(currentPage - 1) * effectivePageSize + idx + 1}
                  </td>
                  <td className="font-medium text-gray-600">
                    {permission.permissionKey}
                  </td>
                  <td
                    className=""
                    style={{ color: "var(--page-text)" }}
                  >
                    {permission.description || "—"}
                  </td>
                  <td className="">
                    <button onClick={() => handleToggleClick(permission)}>
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium cursor-pointer ${
                          permission.isActive
                            ? "bg-teal-50 text-[#1AB394]"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {permission.isActive ? "Active" : "Inactive"}
                      </span>
                    </button>
                  </td>
                  <td className="flex items-center justify-end py-3 gap-2">
                    <button className="p-1.5 rounded-sm border border-yellow-200 text-yellow-400 hover:text-yellow-500 hover:bg-yellow-50 cursor-pointer">
                      <Pencil size={16} />
                    </button>
                    <button className="p-1.5 rounded-sm border border-red-200 text-red-400 hover:text-red-500 hover:bg-red-50 cursor-pointer">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer section */}
        <div className="flex items-start justify-between pt-2 border-t border-gray-200">
          <div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--page-text)" }}
            >
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === "All" ? "All" : Number(val));
                }}
                className="input-field w-auto cursor-pointer"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>Entries</span>
            </div>
            <p className="text-sm" style={{ color: "var(--page-text)" }}>
              Showing {startEntry} to {endEntry} of {sorted.length} Entries
            </p>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title={
          confirmTarget?.nextStatus
            ? "Activate Permission"
            : "Deactivate Permission"
        }
        message={
          confirmTarget
            ? `Are you sure you want to ${confirmTarget.nextStatus ? "activate" : "deactivate"} "${confirmTarget.permissionKey}"?`
            : ""
        }
        confirmLabel={confirmTarget?.nextStatus ? "Activate" : "Deactivate"}
        danger={!confirmTarget?.nextStatus}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmTarget(null)}
      />
    </DashboardLayout>
  );
}

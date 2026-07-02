import * as XLSX from 'xlsx';

export function exportToExcel(data, columns, filename) {
  const exportData = data.map((row, index) => {
    const obj = {};
    columns.forEach((col) => {
      obj[col.label] = col.accessor(row, index);
    });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
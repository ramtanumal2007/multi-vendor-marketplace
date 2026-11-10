/**
 * Client-safe, UTF-8 encoded CSV export utility for Vendosmith Admin Operations.
 * Protects against CSV injection and formats filenames with report type + date.
 */

export function downloadCsv(
  reportType: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const sanitizeCell = (cell: string | number | boolean | null | undefined): string => {
    if (cell === null || cell === undefined) return '""';
    let str = String(cell);
    // Escape double quotes
    str = str.replace(/"/g, '""');
    // Prevent Excel formula injection (=, +, -, @)
    if (/^[=+\-@]/.test(str)) {
      str = "'" + str;
    }
    return `"${str}"`;
  };

  const csvRows: string[] = [
    headers.map(sanitizeCell).join(","),
    ...rows.map((row) => row.map(sanitizeCell).join(",")),
  ];

  // UTF-8 BOM to ensure Excel and spreadsheet tools open accents and currency symbols accurately
  const csvContent = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `vendosmith_${reportType}_${dateStr}.csv`;

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

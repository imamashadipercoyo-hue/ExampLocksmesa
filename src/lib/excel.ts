import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';

export interface ExcelExportSheet {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  widths?: number[];
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvText(text: string): Record<string, string>[] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t')
    ? '\t'
    : headerLine.includes(';')
    ? ';'
    : ',';

  const headers = parseCsvLine(headerLine, delimiter).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_')
  );

  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i], delimiter);
    const obj: Record<string, string> = {};
    headers.forEach((key, idx) => {
      if (key) {
        obj[key] = String(values[idx] ?? '').trim();
      }
    });
    records.push(obj);
  }
  return records;
}

/**
 * Reads an uploaded .xlsx or .csv file into normalized lowercase-keyed record rows.
 */
export async function readSpreadsheetRows(file: File): Promise<Record<string, string>[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt')) {
    const text = await file.text();
    return parseCsvText(text);
  }

  const sheetData = await readSheet(file);
  if (!Array.isArray(sheetData) || sheetData.length < 2) {
    return [];
  }

  const rawHeaders = sheetData[0].map((cell) =>
    String(cell ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
  );

  const records: Record<string, string>[] = [];
  for (let r = 1; r < sheetData.length; r += 1) {
    const row = sheetData[r];
    if (!row || row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) {
      continue;
    }
    const obj: Record<string, string> = {};
    rawHeaders.forEach((key, idx) => {
      if (!key) return;
      const cell = row[idx];
      if (cell === null || cell === undefined) {
        obj[key] = '';
      } else if (cell instanceof Date) {
        obj[key] = cell.toISOString().slice(0, 10);
      } else {
        obj[key] = String(cell).trim();
      }
    });
    records.push(obj);
  }
  return records;
}

function buildSheetData(headers: string[], rows: Array<Array<string | number>>): SheetData {
  const headerRow: Row = headers.map((h) => ({
    value: h,
    fontWeight: 'bold',
    backgroundColor: '#0B1F3A',
    color: '#FFFFFF',
  }));

  const dataRows: Row[] = rows.map((row) =>
    row.map((cell) => ({
      value: cell,
      type: typeof cell === 'number' ? Number : String,
    }))
  );

  return [headerRow, ...dataRows];
}

/**
 * Exports one or more formatted sheets to a real .xlsx workbook download.
 */
export async function downloadExcelWorkbook(
  fileName: string,
  sheets: ExcelExportSheet[]
): Promise<void> {
  const payload = sheets.map((s) => ({
    sheet: s.name,
    data: buildSheetData(s.headers, s.rows),
    columns: s.widths ? s.widths.map((w) => ({ width: w })) : undefined,
  }));

  await writeXlsxFile(payload, {
    fontFamily: 'Calibri',
    fontSize: 11,
  }).toFile(fileName);
}

/**
 * File parsing utilities for CSV and Excel files
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { detectFileType, readFileAsText, readFileAsArrayBuffer, FileType } from './fileUtils';

export interface ParsedData {
  headers: string[];
  rows: Record<string, string | number>[];
  rowCount: number;
  columnCount: number;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedData;
  error?: string;
}

/**
 * Parses a CSV file using papaparse
 * @param fileContent - The CSV file content as string
 * @returns ParsedData with headers and rows
 */
function parseCSV(fileContent: string): ParsedData {
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  const headers = result.meta.fields || [];
  const rows = result.data as Record<string, string>[];

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
}

/**
 * Parses an Excel file using xlsx
 * @param arrayBuffer - The Excel file content as ArrayBuffer
 * @param sheetIndex - Optional sheet index (default: 0 for first sheet)
 * @returns ParsedData with headers and rows
 */
function parseExcel(arrayBuffer: ArrayBuffer, sheetIndex: number = 0): ParsedData {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  
  if (sheetNames.length === 0) {
    throw new Error('Excel file contains no sheets');
  }

  const sheetName = sheetNames[sheetIndex] || sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with header row
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as (string | number)[][];

  if (jsonData.length === 0) {
    throw new Error('Excel sheet is empty');
  }

  // First row is headers
  const headers = (jsonData[0] as string[]).map(h => String(h).trim()).filter(h => h);
  
  // Remaining rows are data
  const dataRows = jsonData.slice(1);
  const rows: Record<string, string | number>[] = dataRows.map((row) => {
    const rowObj: Record<string, string | number> = {};
    headers.forEach((header, index) => {
      rowObj[header] = row[index] !== undefined ? row[index] : '';
    });
    return rowObj;
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
}

/**
 * Main function to parse a file (CSV or Excel)
 * @param file - The file to parse
 * @returns Promise that resolves to ParseResult
 */
export async function parseFile(file: File): Promise<ParseResult> {
  try {
    const fileTypeInfo = detectFileType(file);

    if (fileTypeInfo.type === 'unknown') {
      return {
        success: false,
        error: `Unsupported file type. Expected CSV or Excel file, got: ${fileTypeInfo.extension || 'unknown'}`,
      };
    }

    let parsedData: ParsedData;

    if (fileTypeInfo.type === 'csv') {
      const fileContent = await readFileAsText(file);
      parsedData = parseCSV(fileContent);
    } else if (fileTypeInfo.type === 'excel') {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      parsedData = parseExcel(arrayBuffer);
    } else {
      return {
        success: false,
        error: 'Unsupported file type',
      };
    }

    // Validate parsed data
    if (parsedData.headers.length === 0) {
      return {
        success: false,
        error: 'File appears to be empty or has no headers',
      };
    }

    return {
      success: true,
      data: parsedData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while parsing file',
    };
  }
}


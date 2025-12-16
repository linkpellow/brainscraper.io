/**
 * File utility functions for detecting file types and reading files
 */

export type FileType = 'csv' | 'excel' | 'unknown';

export interface FileTypeInfo {
  type: FileType;
  extension: string;
}

/**
 * Detects the file type from a File object
 * @param file - The file to check
 * @returns FileTypeInfo with type and extension
 */
export function detectFileType(file: File): FileTypeInfo {
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop() || '';
  
  // Check by extension first (more reliable)
  if (extension === 'csv') {
    return { type: 'csv', extension: 'csv' };
  }
  
  if (['xls', 'xlsx', 'xlsm'].includes(extension)) {
    return { type: 'excel', extension };
  }
  
  // Fallback to MIME type
  const mimeType = file.type.toLowerCase();
  if (mimeType === 'text/csv' || mimeType.includes('csv')) {
    return { type: 'csv', extension: 'csv' };
  }
  
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || 
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return { type: 'excel', extension: extension || 'xlsx' };
  }
  
  return { type: 'unknown', extension };
}

/**
 * Reads a file as text (for CSV files)
 * @param file - The file to read
 * @returns Promise that resolves to the file content as string
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Reads a file as ArrayBuffer (for Excel files)
 * @param file - The file to read
 * @returns Promise that resolves to the file content as ArrayBuffer
 */
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (e.target?.result && e.target.result instanceof ArrayBuffer) {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}


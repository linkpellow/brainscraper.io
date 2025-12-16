import { describe, it, expect, vi } from 'vitest';
import { detectFileType, readFileAsText, readFileAsArrayBuffer } from '../fileUtils';

describe('fileUtils', () => {
  describe('detectFileType', () => {
    it('should detect CSV files by extension', () => {
      const file = new File([''], 'test.csv', { type: 'text/csv' });
      const result = detectFileType(file);
      expect(result.type).toBe('csv');
      expect(result.extension).toBe('csv');
    });

    it('should detect XLSX files by extension', () => {
      const file = new File([''], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const result = detectFileType(file);
      expect(result.type).toBe('excel');
      expect(result.extension).toBe('xlsx');
    });

    it('should detect XLS files by extension', () => {
      const file = new File([''], 'test.xls', { type: 'application/vnd.ms-excel' });
      const result = detectFileType(file);
      expect(result.type).toBe('excel');
      expect(result.extension).toBe('xls');
    });

    it('should detect XLSM files by extension', () => {
      const file = new File([''], 'test.xlsm', { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
      const result = detectFileType(file);
      expect(result.type).toBe('excel');
      expect(result.extension).toBe('xlsm');
    });

    it('should detect CSV by MIME type when extension is missing', () => {
      const file = new File([''], 'test', { type: 'text/csv' });
      const result = detectFileType(file);
      expect(result.type).toBe('csv');
    });

    it('should detect Excel by MIME type when extension is missing', () => {
      const file = new File([''], 'test', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const result = detectFileType(file);
      expect(result.type).toBe('excel');
    });

    it('should return unknown for unsupported file types', () => {
      const file = new File([''], 'test.pdf', { type: 'application/pdf' });
      const result = detectFileType(file);
      expect(result.type).toBe('unknown');
    });
  });

  describe('readFileAsText', () => {
    it('should read file content as text', async () => {
      const content = 'name,age\nJohn,30\nJane,25';
      const file = new File([content], 'test.csv', { type: 'text/csv' });
      
      const result = await readFileAsText(file);
      expect(result).toBe(content);
    });

    it('should reject on file read error', async () => {
      // Create a mock file that will fail to read
      const file = new File([''], 'test.csv', { type: 'text/csv' });
      
      // Mock FileReader to simulate error
      const originalFileReader = window.FileReader;
      // @ts-ignore
      window.FileReader = class extends originalFileReader {
        readAsText() {
          setTimeout(() => {
            // @ts-ignore - accessing private property for test
            if (this.onerror) {
              this.onerror(new ErrorEvent('error', { message: 'Read error' }));
            }
          }, 0);
        }
      };

      await expect(readFileAsText(file)).rejects.toThrow();

      // Restore original
      window.FileReader = originalFileReader;
    });
  });

  describe('readFileAsArrayBuffer', () => {
    it('should read file content as ArrayBuffer', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      const file = new File([content], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const result = await readFileAsArrayBuffer(file);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(5);
    });
  });
});


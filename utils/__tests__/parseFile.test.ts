import { describe, it, expect } from 'vitest';
import { parseFile } from '../parseFile';

describe('parseFile', () => {
  it('should parse a simple CSV file', async () => {
    const csvContent = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await parseFile(file);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.headers).toEqual(['name', 'age', 'city']);
    expect(result.data?.rowCount).toBe(2);
    expect(result.data?.columnCount).toBe(3);
    expect(result.data?.rows[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
  });

  it('should handle CSV with empty lines', async () => {
    const csvContent = 'name,age\nJohn,30\n\nJane,25';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await parseFile(file);

    expect(result.success).toBe(true);
    expect(result.data?.rowCount).toBe(2); // Empty line should be skipped
  });

  it('should handle CSV with quoted fields', async () => {
    const csvContent = 'name,description\nJohn,"A person, who likes coding"\nJane,Developer';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await parseFile(file);

    expect(result.success).toBe(true);
    expect(result.data?.rows[0].description).toBe('A person, who likes coding');
  });

  it('should reject unsupported file types', async () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    const result = await parseFile(file);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('should handle empty CSV files', async () => {
    const csvContent = 'name,age\n';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await parseFile(file);

    expect(result.success).toBe(true);
    expect(result.data?.rowCount).toBe(0);
    expect(result.data?.headers).toEqual(['name', 'age']);
  });

  it('should handle CSV files with only headers', async () => {
    const csvContent = 'name,age,city';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await parseFile(file);

    expect(result.success).toBe(true);
    expect(result.data?.headers).toEqual(['name', 'age', 'city']);
    expect(result.data?.rowCount).toBe(0);
  });
});


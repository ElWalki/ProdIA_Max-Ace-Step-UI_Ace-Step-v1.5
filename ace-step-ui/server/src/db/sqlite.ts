import { db } from './pool.js';
import { randomUUID } from 'crypto';

// UUID generation helper (SQLite doesn't have gen_random_uuid())
export function generateUUID(): string {
  return randomUUID();
}

// JSON helper for SQLite (serialize objects to strings)
export function toJSON(obj: unknown): string {
  return JSON.stringify(obj);
}

// JSON helper for SQLite (parse JSON strings)
export function fromJSON<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

// Array helper for SQLite (store arrays as JSON strings)
export function toArray(arr: unknown[]): string {
  return JSON.stringify(arr || []);
}

// Array helper for SQLite (parse array from JSON string)
export function fromArray<T>(str: string | null | undefined): T[] {
  if (!str) return [];
  try {
    return JSON.parse(str) as T[];
  } catch {
    return [];
  }
}

// ISO date string helper
export function toISODate(date?: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

// Parse ISO date string
export function fromISODate(str: string | null | undefined): Date | null {
  if (!str) return null;
  return new Date(str);
}

// Transaction helper
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// Batch insert helper
export function batchInsert(
  table: string,
  columns: string[],
  rows: unknown[][]
): void {
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  );

  const insertMany = db.transaction((items: unknown[][]) => {
    for (const row of items) {
      stmt.run(...row);
    }
  });

  insertMany(rows);
}

export { db };

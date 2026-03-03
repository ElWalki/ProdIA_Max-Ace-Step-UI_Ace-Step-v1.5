import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.dirname(config.database.path);
import { mkdirSync } from 'fs';
try {
  mkdirSync(dataDir, { recursive: true });
} catch {
  // Directory already exists
}

const dbInstance = new Database(config.database.path);
dbInstance.pragma('journal_mode = WAL');
dbInstance.pragma('foreign_keys = ON');
dbInstance.pragma('busy_timeout = 5000');

export { dbInstance as db };

// Convert parameters to SQLite-compatible types
function sanitizeParams(params?: unknown[]): unknown[] | undefined {
  if (!params) return params;
  return params.map(p => {
    // Convert undefined to null
    if (p === undefined) return null;
    // Convert boolean to integer (SQLite stores booleans as 0/1)
    if (typeof p === 'boolean') return p ? 1 : 0;
    // Convert arrays and objects to JSON strings
    if (Array.isArray(p) || (typeof p === 'object' && p !== null)) {
      return JSON.stringify(p);
    }
    return p;
  });
}

// Query result type - use 'any' for rows to avoid strict typing issues
interface QueryResult {
  rows: any[];
  rowCount: number;
}

// Convert SQL and execute
function executeQuery(sql: string, params?: unknown[], dbRef: Database.Database = dbInstance): QueryResult {
  // Sanitize parameters for SQLite
  const sanitizedParams = sanitizeParams(params);

  // Convert PostgreSQL $1, $2 placeholders to SQLite ?
  let convertedSql = sql;
  if (sanitizedParams && sanitizedParams.length > 0) {
    // Replace $N with ?
    convertedSql = sql.replace(/\$(\d+)/g, '?');
  }

  // Handle common PostgreSQL -> SQLite conversions
  convertedSql = convertedSql
    .replace(/ILIKE/gi, 'LIKE')
    .replace(/CURRENT_TIMESTAMP/gi, "datetime('now')")
    .replace(/COALESCE/gi, 'COALESCE')
    .replace(/::text/gi, '')
    .replace(/::integer/gi, '')
    .replace(/::boolean/gi, '')
    .replace(/GREATEST\(([^,]+),\s*(\d+)\)/gi, 'MAX($1, $2)');

  // Auto-generate UUID for INSERT statements that need an id
  const insertMatch = convertedSql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const tableName = insertMatch[1];
    const columns = insertMatch[2].split(',').map(c => c.trim().toLowerCase());

    // Tables that need auto-generated IDs
    const tablesNeedingId = ['users', 'songs', 'playlists', 'generation_jobs', 'comments', 'reference_tracks', 'contact_submissions'];

    if (tablesNeedingId.includes(tableName.toLowerCase()) && !columns.includes('id')) {
      // Add id to the INSERT
      const newId = randomUUID();
      const updatedColumns = 'id, ' + insertMatch[2];
      const valuesMatch = convertedSql.match(/VALUES\s*\(([^)]+)\)/i);
      if (valuesMatch) {
        const updatedValues = `VALUES ('${newId}', ${valuesMatch[1]})`;
        convertedSql = convertedSql.replace(/\([^)]+\)\s*VALUES/i, `(${updatedColumns}) VALUES`);
        convertedSql = convertedSql.replace(/VALUES\s*\([^)]+\)/i, updatedValues);
      }
    }
  }

  try {
    // Determine if it's a SELECT/returning query
    const isSelect = /^\s*(SELECT|RETURNING)/i.test(convertedSql) ||
                     convertedSql.includes('RETURNING');

    if (isSelect || convertedSql.includes('RETURNING')) {
      const stmt = dbRef.prepare(convertedSql);
      const rows = sanitizedParams ? stmt.all(...sanitizedParams) : stmt.all();
      return { rows, rowCount: rows.length };
    } else {
      const stmt = dbRef.prepare(convertedSql);
      const result = sanitizedParams ? stmt.run(...sanitizedParams) : stmt.run();
      return { rows: [], rowCount: result.changes };
    }
  } catch (error) {
    console.error('SQLite query error:', error);
    console.error('SQL:', convertedSql);
    console.error('Params:', sanitizedParams);
    throw error;
  }
}

// Client-like interface for transaction support
class SqliteClient {
  private inTransaction = false;

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    return executeQuery(sql, params, dbInstance);
  }

  release() {
    // No-op for SQLite - connection doesn't need to be released
    if (this.inTransaction) {
      // If released while in transaction, rollback
      try {
        dbInstance.exec('ROLLBACK');
      } catch {
        // Ignore if no transaction
      }
      this.inTransaction = false;
    }
  }
}

// Helper for compatibility with existing code that expects pool-like interface
export const pool = {
  query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
    return executeQuery(sql, params);
  },

  // For transaction support (used by like endpoint)
  connect: async () => {
    const client = new SqliteClient();
    // Override query to handle BEGIN/COMMIT/ROLLBACK
    const originalQuery = client.query.bind(client);
    client.query = async (sql: string, params?: unknown[]) => {
      const upperSql = sql.trim().toUpperCase();
      if (upperSql === 'BEGIN') {
        dbInstance.exec('BEGIN IMMEDIATE');
        (client as any).inTransaction = true;
        return { rows: [], rowCount: 0 };
      }
      if (upperSql === 'COMMIT') {
        dbInstance.exec('COMMIT');
        (client as any).inTransaction = false;
        return { rows: [], rowCount: 0 };
      }
      if (upperSql === 'ROLLBACK') {
        dbInstance.exec('ROLLBACK');
        (client as any).inTransaction = false;
        return { rows: [], rowCount: 0 };
      }
      return originalQuery(sql, params);
    };
    return client;
  },

  end: async () => {
    dbInstance.close();
  }
};

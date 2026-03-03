import { pool } from '../db/pool.js';

export interface CleanupResult {
  deleted: number;
  errors: number;
}

export async function runCleanupJob(): Promise<CleanupResult> {
  // Local storage doesn't have expiring files - no cleanup needed
  console.log('Cleanup job: No action needed for local storage');
  return { deleted: 0, errors: 0 };
}

export async function cleanupDeletedSongs(): Promise<number> {
  // Clean up songs without audio that are older than 7 days (SQLite syntax)
  const result = await pool.query(
    `DELETE FROM songs
     WHERE audio_url IS NULL
       AND created_at < datetime('now', '-7 days')
     RETURNING id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    console.log(`Cleaned up ${count} orphaned songs`);
  }
  return count;
}

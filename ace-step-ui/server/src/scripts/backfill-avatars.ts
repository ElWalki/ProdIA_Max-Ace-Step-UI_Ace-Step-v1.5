import { pool } from '../db/pool.js';

async function run() {
  const users = await pool.query(
    `SELECT id, email FROM users
     WHERE avatar_url IS NULL AND email IS NOT NULL`
  );

  let updated = 0;
  for (const row of users.rows) {
    const email = String(row.email || '').toLowerCase();
    if (!email) continue;
    const hash = await hashEmail(email);
    const gravatar = `https://www.gravatar.com/avatar/${hash}?d=identicon&s=256`;
    await pool.query(
      `UPDATE users SET avatar_url = $1 WHERE id = $2`,
      [gravatar, row.id]
    );
    updated += 1;
  }

  console.log(`[backfill] Updated ${updated} users with gravatar identicons.`);
  await pool.end();
}

async function hashEmail(email: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

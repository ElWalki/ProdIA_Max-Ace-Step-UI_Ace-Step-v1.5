import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'data/acestep.db'));

// 1. Audio URL patterns
const patterns = db.prepare(`
  SELECT substr(audio_url, 1, 50) as prefix, COUNT(*) as cnt 
  FROM songs WHERE audio_url IS NOT NULL 
  GROUP BY substr(audio_url, 1, 50) 
  ORDER BY cnt DESC LIMIT 15
`).all();
console.log('=== Audio URL patterns ===');
patterns.forEach(p => console.log(`  ${p.prefix}  => ${p.cnt} songs`));

// 2. Songs with files that exist
const allSongs = db.prepare('SELECT id, title, audio_url, created_at FROM songs WHERE audio_url IS NOT NULL ORDER BY created_at DESC').all();
let exist = 0, missing = 0;
const missingDates = {};
for (const s of allSongs) {
  const fullPath = path.join(__dirname, 'public', s.audio_url);
  if (fs.existsSync(fullPath)) {
    exist++;
  } else {
    missing++;
    const date = s.created_at.substring(0, 10);
    missingDates[date] = (missingDates[date] || 0) + 1;
  }
}
console.log(`\n=== File status ===`);
console.log(`Files EXIST: ${exist}`);
console.log(`Files MISSING: ${missing}`);

// 3. Check if the DB was recently modified (migrations?)
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(`\n=== DB tables ===`);
tables.forEach(t => console.log(`  ${t.name}`));

// 4. Check migrations table if it exists
try {
  const migrations = db.prepare('SELECT * FROM migrations ORDER BY id DESC LIMIT 5').all();
  console.log(`\n=== Recent migrations ===`);
  migrations.forEach(m => console.log(`  ${JSON.stringify(m)}`));
} catch(e) {
  console.log('\nNo migrations table');
}

// 5. Check if maybe there's another DB or data folder
const otherPaths = [
  'c:/Users/Walki-bass/Desktop/esto va a la carpeta de acestep en vscode/ProdIA_Max/ace-step-ui/server/data/acestep.db',
  'c:/Users/Walki-bass/Desktop/esto va a la carpeta de acestep en vscode/ProdIA_Max/ace-step-ui/server/public/audio',
  'c:/Users/Walki-bass/Desktop/esto va a la carpeta de acestep en vscode/acestep/ace-step-ui/server/data/acestep.db',
  'c:/Users/Walki-bass/Desktop/esto va a la carpeta de acestep en vscode/acestep/ace-step-ui/server/public/audio',
];
console.log(`\n=== Other paths check ===`);
for (const p of otherPaths) {
  const exists = fs.existsSync(p);
  if (exists) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(p, { recursive: true });
      console.log(`  ${p} => DIR with ${files.length} entries`);
    } else {
      console.log(`  ${p} => FILE ${(stat.size / 1024).toFixed(0)} KB, modified ${stat.mtime}`);
    }
  } else {
    console.log(`  ${p} => NOT FOUND`);
  }
}

// 6. Check the 5 root-level mp3 files (job_* and secjob_*) - are they in the DB?
const rootFiles = ['job_1772649069328_804bup8_0.mp3', 'job_1772655981466_9p2kghg_0.mp3', 'secjob_1772647965159_7ygwjpl_0.mp3', 'secjob_1772648094574_bmkjpm5_0.mp3', 'secjob_1772648187846_ar32nb7_0.mp3'];
console.log(`\n=== Root-level audio files (no user subfolder) ===`);
for (const f of rootFiles) {
  const song = db.prepare("SELECT id, title, audio_url, created_at FROM songs WHERE audio_url LIKE ?").get(`%${f}%`);
  if (song) {
    console.log(`  ${f} => IN DB: ${song.title} (${song.created_at})`);
  } else {
    console.log(`  ${f} => NOT in DB (orphaned file)`);
  }
}

db.close();

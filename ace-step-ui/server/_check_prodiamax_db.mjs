import Database from 'better-sqlite3';

const db = new Database('c:/Users/Walki-bass/Desktop/esto va a la carpeta de acestep en vscode/ProdIA_Max/ace-step-ui/server/data/acestep.db');

const count = db.prepare('SELECT COUNT(*) as c FROM songs').get();
console.log('ProdIA_Max total songs:', count.c);

const liked = db.prepare('SELECT COUNT(*) as c FROM liked_songs').get();
console.log('ProdIA_Max liked songs:', liked.c);

const recent = db.prepare('SELECT id, title, audio_url, created_at FROM songs ORDER BY created_at DESC LIMIT 5').all();
console.log('\nRecent songs:');
recent.forEach(s => console.log(`  ${s.created_at} | ${s.title} | ${s.audio_url}`));

const oldest = db.prepare('SELECT created_at, title FROM songs ORDER BY created_at ASC LIMIT 3').all();
console.log('\nOldest songs:');
oldest.forEach(s => console.log(`  ${s.created_at} | ${s.title}`));

const byDate = db.prepare('SELECT date(created_at) as d, COUNT(*) as c FROM songs GROUP BY date(created_at) ORDER BY d DESC LIMIT 10').all();
console.log('\nSongs by date:');
byDate.forEach(r => console.log(`  ${r.d} => ${r.c} songs`));

// Check audio URL pattern
const withAudio = db.prepare("SELECT audio_url FROM songs WHERE audio_url IS NOT NULL LIMIT 5").all();
console.log('\nSample audio URLs:');
withAudio.forEach(s => console.log(`  ${s.audio_url}`));

db.close();

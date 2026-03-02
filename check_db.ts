import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, 'src/db/venus.db');
console.log('Checking DB at:', DB_PATH);

try {
    const db = new Database(DB_PATH);

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('TABLES:', tables.map((t: any) => t.name));

    const counts: any = {};
    for (const table of tables as any[]) {
        counts[table.name] = db.query(`SELECT count(*) as count FROM ${table.name}`).get();
    }
    console.log('COUNTS:', JSON.stringify(counts, null, 2));

    if (counts.long_term_memory?.count > 0) {
        console.log('SAMPLES (long_term_memory):', db.query('SELECT id, topic, content FROM long_term_memory LIMIT 2').all());
    }
    if (counts.memory_links?.count > 0) {
        console.log('SAMPLES (memory_links):', db.query('SELECT * FROM memory_links LIMIT 2').all());
    }

} catch (err) {
    console.error('ERROR:', err);
}

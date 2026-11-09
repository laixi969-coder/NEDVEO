import{openPostgres}from'./postgres.js';
import{sqliteLeases}from'./leases.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path='.data/nedveo.sqlite') {
 const databaseUrl=process.env.NEDVEO_DATABASE_URL||process.env.DATABASE_URL;
 if(databaseUrl&&path!==':memory:')return openPostgres(databaseUrl);
 if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path); db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(tenant,kind,id)); CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));`);
 return {db,...sqliteLeases(db),list:(tenant,kind)=>db.prepare('SELECT data FROM records WHERE tenant=? AND kind=? ORDER BY rowid').all(tenant,kind).map(r=>JSON.parse(r.data)),get:(tenant,kind,id)=>{const r=db.prepare('SELECT data FROM records WHERE tenant=? AND kind=? AND id=?').get(tenant,kind,id);return r?JSON.parse(r.data):null;},put:(tenant,kind,id,data)=>{db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(tenant,kind,id) DO UPDATE SET data=excluded.data').run(tenant,kind,id,JSON.stringify(data));return data;},remove:(tenant,kind,id)=>db.prepare('DELETE FROM records WHERE tenant=? AND kind=? AND id=?').run(tenant,kind,id)};
}

export function sqliteLeases(db){
 return {
  acquireLease(tenant,id,owner,ttl=390000){db.exec('BEGIN IMMEDIATE');try{const row=db.prepare("SELECT data FROM records WHERE tenant=? AND kind='leases' AND id=?").get(tenant,id),old=row?JSON.parse(row.data):null;if(old&&old.expires_at>Date.now()&&old.owner!==owner){db.exec('COMMIT');return false}const value={id,owner,expires_at:Date.now()+ttl};db.prepare("INSERT INTO records(tenant,kind,id,data) VALUES(?,'leases',?,?) ON CONFLICT(tenant,kind,id) DO UPDATE SET data=excluded.data").run(tenant,id,JSON.stringify(value));db.exec('COMMIT');return true}catch(e){db.exec('ROLLBACK');throw e}},
  releaseLease(tenant,id,owner){return db.prepare("DELETE FROM records WHERE tenant=? AND kind='leases' AND id=? AND json_extract(data,'$.owner')=?").run(tenant,id,owner)},
  ownsLease(tenant,id,owner){const row=db.prepare("SELECT data FROM records WHERE tenant=? AND kind='leases' AND id=?").get(tenant,id),value=row?JSON.parse(row.data):null;return !!(value&&value.owner===owner&&value.expires_at>Date.now())}
 }
}

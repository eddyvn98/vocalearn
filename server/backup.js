import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {schemaVersion,SCHEMA_VERSION} from './migrations.js';
const sqlString=value=>`'${String(value).replaceAll("'","''")}'`;
export function verifyDatabase(path){
  if(!existsSync(path))throw new Error('Database file does not exist');
  const db=new DatabaseSync(path);
  try{
    const integrity=String(db.prepare('PRAGMA integrity_check').get().integrity_check||'');
    const version=schemaVersion(db);
    const users=Number(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='users'").get().count||0);
    if(integrity!=='ok'||!users)throw new Error('Database verification failed');
    return {path:resolve(path),integrity,version,current:version===SCHEMA_VERSION};
  }finally{db.close();}
}
export function createBackup(sourcePath,targetPath){
  const source=resolve(sourcePath),target=resolve(targetPath);
  if(!existsSync(source))throw new Error('Source database does not exist');
  if(existsSync(target))throw new Error('Backup target already exists');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});
  const db=new DatabaseSync(source);
  try{
    db.exec('PRAGMA wal_checkpoint(FULL);');
    db.exec(`VACUUM INTO ${sqlString(target)};`);
  }finally{db.close();}
  return verifyDatabase(target);
}
export function restoreBackup(backupPath,targetPath){
  const backup=resolve(backupPath),target=resolve(targetPath);
  verifyDatabase(backup);
  if(existsSync(target))throw new Error('Restore target already exists');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});
  copyFileSync(backup,target);
  try{return verifyDatabase(target);}
  catch(error){throw new Error(`Restored database failed verification: ${error.message}`);}
}

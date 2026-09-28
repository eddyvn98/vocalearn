import {DatabaseSync} from 'node:sqlite';
import {cpSync,existsSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function integrityCheck(db){
  const rows=db.prepare('PRAGMA integrity_check').all();
  const ok=rows.length===1&&String(rows[0].integrity_check).toLowerCase()==='ok';
  if(!ok)throw new Error('SQLite integrity check failed: '+rows.map(row=>row.integrity_check).join('; '));
  return true;
}
export function verifyDatabase(path){
  if(!existsSync(path))throw new Error('Database does not exist: '+path);
  const db=new DatabaseSync(path,{readOnly:true});
  try{integrityCheck(db);return {ok:true,userVersion:Number(db.prepare('PRAGMA user_version').get()?.user_version||0)};}
  finally{db.close();}
}
export function backupData({dbPath,mediaPath,destination}){
  if(!dbPath||dbPath===':memory:')throw new Error('A file-backed DB_PATH is required');
  const dest=resolve(destination),dbOut=join(dest,'vocalearn.sqlite'),mediaOut=join(dest,'media');
  if(existsSync(dest))throw new Error('Backup destination already exists');
  mkdirSync(dest,{recursive:true,mode:0o700});
  const db=new DatabaseSync(dbPath);
  try{
    integrityCheck(db);db.exec('PRAGMA wal_checkpoint(FULL)');db.exec('VACUUM INTO '+quote(dbOut));
  }catch(error){rmSync(dest,{recursive:true,force:true});throw error;}
  finally{db.close();}
  if(mediaPath&&existsSync(mediaPath))cpSync(mediaPath,mediaOut,{recursive:true,errorOnExist:true});
  verifyDatabase(dbOut);
  return {database:dbOut,media:existsSync(mediaOut)?mediaOut:null};
}
export function restoreData({backup,destinationDb,destinationMedia}){
  const source=resolve(backup),sourceDb=join(source,'vocalearn.sqlite'),sourceMedia=join(source,'media');
  verifyDatabase(sourceDb);
  if(existsSync(destinationDb))throw new Error('Restore target database already exists');
  mkdirSync(dirname(destinationDb),{recursive:true,mode:0o700});
  const temp=destinationDb+'.restore-'+process.pid;cpSync(sourceDb,temp,{errorOnExist:true});verifyDatabase(temp);renameSync(temp,destinationDb);
  if(destinationMedia&&existsSync(sourceMedia)){
    if(existsSync(destinationMedia))throw new Error('Restore target media directory already exists');
    mkdirSync(dirname(destinationMedia),{recursive:true,mode:0o700});cpSync(sourceMedia,destinationMedia,{recursive:true,errorOnExist:true});
  }
  return {database:destinationDb,media:destinationMedia&&existsSync(destinationMedia)?destinationMedia:null};
}

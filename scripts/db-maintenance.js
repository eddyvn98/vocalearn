import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backupData,restoreData,verifyDatabase} from '../server/operations.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),command=args.shift();
const value=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const dbPath=resolve(value('--db')||process.env.DB_PATH||resolve(root,'data/vocalearn.sqlite'));
const mediaPath=resolve(value('--media')||process.env.MEDIA_PATH||resolve(dirname(dbPath),'media'));
try{
  if(command==='verify')console.log(JSON.stringify(verifyDatabase(dbPath)));
  else if(command==='backup'){
    const destination=value('--to');if(!destination)throw new Error('Usage: npm run db:backup -- --to <new-directory>');
    console.log(JSON.stringify(backupData({dbPath,mediaPath,destination}),null,2));
  }else if(command==='restore'){
    const backup=value('--from');if(!backup)throw new Error('Usage: npm run db:restore -- --from <backup-directory> [--db path] [--media path]');
    console.log(JSON.stringify(restoreData({backup,destinationDb:dbPath,destinationMedia:mediaPath}),null,2));
  }else throw new Error('Commands: verify, backup, restore');
}catch(error){console.error(error.message);process.exitCode=1;}

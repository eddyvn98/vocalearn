import {resolve} from 'node:path';
import {createBackup} from '../server/backup.js';
try{process.loadEnvFile?.();}catch{}
const source=process.env.DB_PATH||'./data/vocalearn.sqlite';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const target=process.argv[2]||`./backups/vocalearn-${stamp}.sqlite`;
try{
  const result=createBackup(resolve(source),resolve(target));
  console.log(JSON.stringify({ok:true,...result}));
}catch(error){console.error(error.message);process.exitCode=1;}

import {resolve} from 'node:path';
import {restoreBackup} from '../server/backup.js';
const [backup,target]=process.argv.slice(2);
if(!backup||!target){console.error('Usage: npm run restore:verify -- <backup.sqlite> <fresh-target.sqlite>');process.exitCode=1;}
else{
  try{console.log(JSON.stringify({ok:true,...restoreBackup(resolve(backup),resolve(target))}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}

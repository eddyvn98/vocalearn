import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const roots=['core','server','public/js','scripts','tests'];
async function walk(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
let files=[];
for(const root of roots)files.push(...await walk(root));
let failed=false;
for(const file of files.filter(f=>/\.m?js$/.test(f))){
  const lines=(await readFile(file,'utf8')).trimEnd().split('\n').length;
  if(lines>=300){console.error(`${file}: ${lines} lines (limit: below 300)`);failed=true;}
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(checked.status!==0){console.error(checked.stderr);failed=true;}
}
if(failed)process.exitCode=1;
else console.log(`Syntax and file-size checks passed for ${files.filter(f=>/\.m?js$/.test(f)).length} JavaScript modules.`);

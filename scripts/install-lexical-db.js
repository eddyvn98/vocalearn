import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream,existsSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const URL=process.env.LEXICAL_DB_URL||'https://github.com/minhqnd/dictionary/releases/download/v2.0.0/dictionary.db';
const SHA256=process.env.LEXICAL_DB_SHA256||'9259403f0675b2991a1bd0ef6d0dbc5933afdb135632af095a60662f09bbf1d3';
const target=resolve(process.env.LEXICAL_DB_PATH||'./data/dictionary.db');
const marker=target+'.sha256';

async function digest(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}
async function current(){
  if(!existsSync(target)||!existsSync(marker)||statSync(target).size<1024)return false;
  try{return String(await readFile(marker,'utf8')).trim()===SHA256;}catch{return false;}
}
async function main(){
  await mkdir(dirname(target),{recursive:true});
  if(await current()){console.log('Lexical DB already installed:',target);return;}
  const temp=target+'.download-'+process.pid;
  rmSync(temp,{force:true});
  console.log('Downloading local lexical database...');
  const response=await fetch(URL,{redirect:'follow'});
  if(!response.ok||!response.body)throw new Error('Lexical DB download failed: HTTP '+response.status);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(temp,{mode:0o600}));
  const actual=await digest(temp);
  if(actual!==SHA256){rmSync(temp,{force:true});throw new Error('Lexical DB checksum mismatch');}
  renameSync(temp,target);writeFileSync(marker,SHA256+'\n',{mode:0o600});
  console.log('Lexical DB installed:',target,statSync(target).size,'bytes');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

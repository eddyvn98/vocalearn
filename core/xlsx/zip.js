import {zipSync,unzipSync,crc32 as fflateCrc32} from 'fflate';

const encoder=new TextEncoder(),decoder=new TextDecoder();
export const bytes=value=>typeof value==='string'?encoder.encode(value):new Uint8Array(value);
export const text=value=>decoder.decode(value);
export const crc32=data=>fflateCrc32(bytes(data))>>>0;

const safeName=name=>name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..');

export function zip(entries){
  const files=Object.fromEntries(Object.entries(entries).map(([name,value])=>[name,bytes(value)]));
  return zipSync(files,{level:0});
}

function declaredEntries(data){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const fail=()=>{throw new Error('Invalid or unsupported ZIP archive');};
  if(data.length<22||data.length>20*1024*1024)fail();
  let end=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){
    if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===data.length){end=i;break;}
  }
  if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail();
  const count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true);
  let pos=view.getUint32(end+16,true),total=0;
  const centralEnd=pos+centralSize,names=new Set();
  if(count>2000||centralEnd>end)fail();
  for(let i=0;i<count;i++){
    if(pos+46>centralEnd||view.getUint32(pos,true)!==0x02014b50)fail();
    const flag=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true);
    const packed=view.getUint32(pos+20,true),size=view.getUint32(pos+24,true);
    const n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
    if(flag&1||![0,8].includes(method)||pos+46+n+extra+comment>centralEnd)fail();
    const name=text(data.subarray(pos+46,pos+46+n));
    if(!safeName(name)||names.has(name))fail();
    names.add(name);total+=size;
    if(size>16*1024*1024||total>64*1024*1024)throw new Error('XLSX exceeds expanded-size limit');
    if(packed>20*1024*1024)fail();
    pos+=46+n+extra+comment;
  }
  return {count,total,names};
}

export async function unzip(input){
  const data=bytes(input),declared=declaredEntries(data);
  let files;
  try{files=unzipSync(data);}catch{throw new Error('Invalid or unsupported ZIP archive');}
  const entries=Object.entries(files);
  if(entries.length!==declared.count)throw new Error('ZIP entry count mismatch');
  let total=0;
  const out=Object.create(null);
  for(const [name,value] of entries){
    if(!declared.names.has(name)||!safeName(name))throw new Error('Invalid or unsupported ZIP archive');
    total+=value.length;
    if(value.length>16*1024*1024||total>64*1024*1024)throw new Error('XLSX exceeds expanded-size limit');
    out[name]=value;
  }
  if(total!==declared.total)throw new Error('ZIP expanded size mismatch');
  return out;
}

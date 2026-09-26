import {parseXml,descendants,first,value,attribute,relationships} from './xml.js';
import {text} from './zip.js';

const xml=(files,path)=>parseXml(files[path]?text(files[path]):'');
const base64=data=>{let out='';for(const b of data)out+=String.fromCharCode(b);return btoa(out);};
export function imageData(files,path) {
  const data=files[path],ext=path.split('.').at(-1)?.toLowerCase();
  if(!data||!['png','jpeg','jpg','webp'].includes(ext))throw new Error('Missing or unsupported embedded image');
  return `data:image/${ext==='jpg'?'jpeg':ext};base64,${base64(data)}`;
}
function add(map,row,image) {
  if(!Number.isInteger(row)||row<1||!image)return;
  const list=map.get(row)||[];
  if(!list.includes(image))list.push(image);
  map.set(row,list);
}
export function floatingImages(files,sheetPath,document,warnings=[]) {
  const out=new Map(),sheetRels=relationships(files,sheetPath);
  for(const drawing of descendants(document,'drawing')){
    const drawingPath=sheetRels.find(r=>r.id===attribute(drawing,'id'))?.target;
    if(!drawingPath)continue;
    const links=relationships(files,drawingPath),drawingDoc=xml(files,drawingPath);
    for(const anchor of [...descendants(drawingDoc,'oneCellAnchor'),...descendants(drawingDoc,'twoCellAnchor')]){
      const row=Number(value(first(first(anchor,'from')||anchor,'row')))+1;
      const rid=attribute(first(anchor,'blip'),'embed'),target=links.find(r=>r.id===rid)?.target;
      try{add(out,row,imageData(files,target||''));}
      catch(error){warnings.push({row,message:error.message});}
    }
  }
  return out;
}
function cellImageEntries(files) {
  const path=Object.keys(files).find(name=>/^xl\/cellimages\.xml$/i.test(name));
  if(!path)return [];
  const doc=xml(files,path),links=relationships(files,path);
  return descendants(doc,'cellImage').map((node,index)=>{
    const pic=first(node,'pic')||node,properties=first(pic,'cNvPr'),blip=first(pic,'blip');
    const rid=attribute(blip,'embed'),target=links.find(r=>r.id===rid)?.target;
    return {index,name:attribute(properties,'name')||'',description:attribute(properties,'descr')||'',
      id:attribute(properties,'id')||'',target};
  });
}
const imageToken=formula=>{
  const match=String(formula||'').match(/(?:DISPIMG|IMAGE)\s*\(\s*"([^"]+)"/i);
  return match?.[1]||'';
};
function rowOf(cell){return Number(cell.attrs.r?.match(/\d+$/)?.[0]||0);}
function directEntry(cell,entries) {
  const token=imageToken(value(first(cell,'f')));
  if(token){
    const normalized=token.toLocaleLowerCase('en');
    const hit=entries.find(entry=>[entry.name,entry.description,entry.id].some(v=>String(v).toLocaleLowerCase('en')===normalized));
    if(hit)return hit;
  }
  const metadata=Number(cell.attrs.vm??cell.attrs.cm);
  if(Number.isInteger(metadata)){
    if(entries[metadata])return entries[metadata];
    if(metadata>0&&entries[metadata-1])return entries[metadata-1];
  }
  return null;
}
export function placeInCellImages(files,document,warnings=[]) {
  const entries=cellImageEntries(files);
  if(!entries.length)return new Map();
  const cells=descendants(document,'c').filter(cell=>{
    const formula=value(first(cell,'f')),raw=value(first(cell,'v'));
    return !!imageToken(formula)||cell.attrs.vm!==undefined||cell.attrs.cm!==undefined||raw==='#VALUE!';
  });
  const out=new Map(),used=new Set(),unmapped=[];
  for(const cell of cells){
    const entry=directEntry(cell,entries);
    if(entry){used.add(entry.index);try{add(out,rowOf(cell),imageData(files,entry.target||''));}
      catch(error){warnings.push({row:rowOf(cell),message:error.message});}}
    else unmapped.push(cell);
  }
  const remaining=entries.filter(entry=>!used.has(entry.index));
  // Some Microsoft 365 files expose only a rich-value metadata marker. If cardinality
  // matches, preserve worksheet order rather than silently dropping the cell images.
  if(unmapped.length&&unmapped.length===remaining.length){
    unmapped.forEach((cell,index)=>{
      try{add(out,rowOf(cell),imageData(files,remaining[index].target||''));}
      catch(error){warnings.push({row:rowOf(cell),message:error.message});}
    });
  } else if(unmapped.length||remaining.length) {
    warnings.push({row:0,message:'Some Place in Cell images could not be mapped to worksheet cells'});
  }
  return out;
}
export function mergeImageMaps(...maps) {
  const out=new Map();
  for(const map of maps)for(const [row,images] of map)for(const image of images)add(out,row,image);
  return out;
}

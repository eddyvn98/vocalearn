import {unzip, text} from './zip.js';
import {parseXml, descendants, first, value, attribute, relationships} from './xml.js';
const xml = (files,path) => parseXml(files[path] ? text(files[path]) : '');
const base64 = data => {let s=''; for(const b of data)s+=String.fromCharCode(b); return btoa(s);};
function imageData(files, path) {
  const data = files[path], ext = path.split('.').at(-1).toLowerCase();
  if (!data || !['png','jpeg','jpg','webp'].includes(ext)) throw new Error('Missing or unsupported embedded image');
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64(data)}`;
}
export async function readWorkbook(input, sheetIndex = 0) {
  const files = await unzip(input);
  const workbookPath = relationships(files, '').find(r=>r.type.endsWith('/officeDocument'))?.target || 'xl/workbook.xml';
  const workbook = xml(files,workbookPath), workbookRels = relationships(files,workbookPath);
  const sheets = descendants(workbook,'sheet');
  const sheet = sheets[sheetIndex]; if(!sheet)throw new Error('Worksheet not found');
  const path = workbookRels.find(r=>r.id===attribute(sheet,'id'))?.target;
  if(!path || !files[path])throw new Error('Missing worksheet relationship');
  const stringsPath = workbookRels.find(r=>r.type.endsWith('/sharedStrings'))?.target || 'xl/sharedStrings.xml';
  const strings = descendants(xml(files,stringsPath),'si').map(n=>descendants(n,'t').map(value).join(''));
  const document = xml(files,path), rows = [], warnings = [];
  for(const row of descendants(document,'row')) {
    const cells = {};
    for(const cell of row.children.filter(c=>c.name==='c')) {
      const col = cell.attrs.r?.match(/^[A-Z]+/)?.[0]; if(!col)continue;
      const raw = value(first(cell,'v'));
      if(first(cell,'f'))warnings.push({row:Number(row.attrs.r),message:'Formula cell uses cached value only'});
      cells[col] = cell.attrs.t==='s' ? strings[Number(raw)] ?? '' : cell.attrs.t==='inlineStr'
        ? descendants(cell,'t').map(value).join('') : raw;
    }
    rows.push({row:Number(row.attrs.r),cells});
  }
  const imageRows = new Map(), sheetRels = relationships(files,path);
  for(const drawing of descendants(document,'drawing')) {
    const dpath = sheetRels.find(r=>r.id===attribute(drawing,'id'))?.target;
    if(!dpath)continue;
    const links = relationships(files,dpath), doc = xml(files,dpath);
    for(const anchor of [...descendants(doc,'oneCellAnchor'),...descendants(doc,'twoCellAnchor')]) {
      const row = Number(value(first(first(anchor,'from') || anchor,'row'))) + 1;
      const id = attribute(first(anchor,'blip'),'embed'), target = links.find(r=>r.id===id)?.target;
      try {
        if(imageRows.has(row))throw new Error('Multiple images on one row require manual selection');
        imageRows.set(row,imageData(files,target || ''));
      } catch(error){warnings.push({row,message:error.message});}
    }
  }
  // Rich-data/cell images need a different relationship chain. Never silently lose them.
  if(Object.keys(files).some(k=>/^xl\/(richData|cellimages)/i.test(k)))warnings.push({row:0,
    message:'Place in Cell/rich-data images are not supported yet. Convert them to floating images before importing.'});
  return {rows,imageRows,warnings,sheets:sheets.map(s=>s.attrs.name),sheetIndex};
}

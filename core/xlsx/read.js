import {unzip, text} from './zip.js';
import {parseXml, descendants, first, value, attribute, relationships} from './xml.js';
import {floatingImages,placeInCellImages,mergeImageMaps} from './images.js';
const xml = (files,path) => parseXml(files[path] ? text(files[path]) : '');
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
  const imageRows=mergeImageMaps(
    floatingImages(files,path,document,warnings),
    placeInCellImages(files,document,warnings)
  );
  for(const [row,images] of imageRows)if(images.length>1)warnings.push({row,
    message:`${images.length} images found on this row; choose one in the import preview`});
  return {rows,imageRows,warnings,sheets:sheets.map(s=>s.attrs.name),sheetIndex};
}

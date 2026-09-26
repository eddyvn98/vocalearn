import {zip} from './zip.js';
import {escapeXml as esc} from './xml.js';
const NS = 'http://schemas.openxmlformats.org/';
const rel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const sheetNS = NS + 'spreadsheetml/2006/main';
const office = NS + 'officeDocument/2006/relationships';
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const rels = items => header + `<Relationships xmlns="${rel}">${items.map(([id,type,target])=>
  `<Relationship Id="${id}" Type="${office}/${type}" Target="${esc(target)}"/>`).join('')}</Relationships>`;
export function columnName(n) {
  let name = ''; for (n++; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
export function topicPath(id, categories) {
  const parts = [], seen = new Set();
  while (id && categories[id] && !seen.has(id)) {seen.add(id); parts.unshift(categories[id].name); id = categories[id].parentId;}
  return parts.join(' > ');
}
export function writeWorkbook(cards, categories, columns) {
  const files = {}, imageRels = [], anchors = [], types = new Map();
  const rows = [columns.map(c => c.headers[0])];
  for (const [i, card] of cards.entries()) {
    const row = {...card, word_id:card.word_id || card.id || '', category:card.category ||
      (card.categoryIds || []).map(id => topicPath(id,categories)).join(' | ')};
    rows.push(columns.map(c => c.key === 'image' ? '' : Array.isArray(row[c.key]) || row[c.key]&&typeof row[c.key]==='object' ? JSON.stringify(row[c.key]) : row[c.key] ?? ''));
    if (!card.image) continue;
    const image = card.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!image) throw new Error(`Unsupported image in row ${i + 2}`);
    const [,ext,encoded] = image, filename = `image${i + 1}.${ext}`, id = `rId${i + 1}`;
    files[`xl/media/${filename}`] = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    imageRels.push([id,'image',`../media/${filename}`]); types.set(ext,`image/${ext}`);
    const col = columns.findIndex(c => c.key === 'image');
    anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="762000" cy="762000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i+1}" name="Image ${i+1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
  }
  files['_rels/.rels'] = rels([['rId1','officeDocument','xl/workbook.xml']]);
  files['xl/workbook.xml'] = header + `<workbook xmlns="${sheetNS}" xmlns:r="${office}"><sheets><sheet name="VocaLearn" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = rels([['rId1','worksheet','worksheets/sheet1.xml']]);
  files['xl/worksheets/sheet1.xml'] = header + `<worksheet xmlns="${sheetNS}" xmlns:r="${office}"><sheetData>${rows.map((row,i)=>
    `<row r="${i+1}"${i && cards[i-1].image?' ht="64" customHeight="1"':''}>${row.map((v,j)=>`<c r="${columnName(j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData>${anchors.length?'<drawing r:id="rId1"/>':''}</worksheet>`;
  if (anchors.length) {
    files['xl/worksheets/_rels/sheet1.xml.rels'] = rels([['rId1','drawing','../drawings/drawing1.xml']]);
    files['xl/drawings/_rels/drawing1.xml.rels'] = rels(imageRels);
    files['xl/drawings/drawing1.xml'] = header + `<xdr:wsDr xmlns:xdr="${NS}drawingml/2006/spreadsheetDrawing" xmlns:a="${NS}drawingml/2006/main" xmlns:r="${office}">${anchors.join('')}</xdr:wsDr>`;
  }
  files['[Content_Types].xml'] = header + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...types].map(([e,t])=>`<Default Extension="${e}" ContentType="${t}"/>`).join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${anchors.length?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':''}</Types>`;
  const output = zip(files);
  if (output.length > 20 * 1024 * 1024) throw new Error('Export exceeds 20 MB; choose a smaller scope.');
  return output;
}

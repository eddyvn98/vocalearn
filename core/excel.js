import {deflateRawSync, inflateRawSync, crc32} from 'node:zlib';
import {normalize} from './grading.js';

export const COLUMNS = [
  {key: 'word', headers: ['từ', 'word', 'tu']},
  {key: 'meaning', headers: ['nghĩa', 'meaning', 'nghia']},
  {key: 'ipa', headers: ['phiên âm', 'ipa', 'phien am']},
  {key: 'pos', headers: ['từ loại', 'pos', 'part of speech', 'tu loai']},
  {key: 'sentence', headers: ['câu ví dụ', 'sentence', 'cau vi du', 'vi du']},
  {key: 'answers', headers: ['đáp án', 'answers', 'answer', 'dap an']},
  {key: 'note', headers: ['ghi chú', 'note', 'ghi chu']},
  {key: 'category', headers: ['chủ đề', 'topic', 'topics', 'category', 'chu de']},
  {key: 'image', headers: ['ảnh', 'image', 'picture', 'anh']},
  {key: 'audio', headers: ['âm thanh', 'audio', 'sound', 'am thanh']}
];

function zip(files) {
  const localHeaders = [], centralEntries = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const compressed = deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(compressed.length, 18); lh.writeUInt32LE(dataBuf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); nameBuf.copy(lh, 30);
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(compressed.length, 20); cd.writeUInt32LE(dataBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42); nameBuf.copy(cd, 46);
    localHeaders.push(lh, compressed); centralEntries.push(cd);
    offset += lh.length + compressed.length;
  }
  const cdSize = centralEntries.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localHeaders, ...centralEntries, eocd]);
}

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) {eocd = i; break;}
  if (eocd < 0) throw new Error('Invalid zip file');
  const count = buf.readUInt16LE(eocd + 8), cdOff = buf.readUInt32LE(eocd + 16);
  let p = cdOff; const out = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const locNameLen = buf.readUInt16LE(localOff + 26), locExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + locNameLen + locExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out[name] = method === 0 ? raw : inflateRawSync(raw);
    p += 46 + nameLen + extraLen + commLen;
  }
  return out;
}

const escXml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = n => String.fromCharCode(65 + n);

export function cardsToXlsx(cards, categories = {}) {
  const strings = [], strMap = new Map();
  const getStrId = s => {
    const str = String(s ?? '');
    if (strMap.has(str)) return strMap.get(str);
    const id = strings.length; strings.push(str); strMap.set(str, id); return id;
  };
  const files = [
    {name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`},
    {name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`},
    {name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="VocaLearn" sheetId="1" r:id="rId1"/></sheets></workbook>`}
  ];
  let sheetRows = '';
  // Header row
  const headerCells = COLUMNS.map((col, idx) => `<c r="${colName(idx)}1" t="s"><v>${getStrId(col.headers[0].toUpperCase())}</v></c>`).join('');
  sheetRows += `<row r="1">${headerCells}</row>`;
  // Data rows
  cards.forEach((c, rIdx) => {
    const rowNum = rIdx + 2;
    const catName = c.categoryIds?.map(id => categories[id]?.name || id).join(', ') || c.category || '';
    const ans = Array.isArray(c.answers) ? c.answers.join(';') : c.answers || '';
    const values = [c.word, c.meaning, c.ipa, c.pos, c.sentence, ans, c.note, catName, c.image, c.audio];
    let rowCells = '';
    values.forEach((v, cIdx) => {
      if (v) rowCells += `<c r="${colName(cIdx)}${rowNum}" t="s"><v>${getStrId(v)}</v></c>`;
    });
    sheetRows += `<row r="${rowNum}">${rowCells}</row>`;
    // Embedded image in media folder
    if (c.image && c.image.startsWith('data:image/')) {
      const match = c.image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
      if (match) files.push({name: `xl/media/image_${rIdx + 1}.${match[1]}`, data: Buffer.from(match[2], 'base64')});
    }
  });
  files.push({
    name: 'xl/worksheets/sheet1.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  });
  const sstEntries = strings.map(s => `<si><t>${escXml(s)}</t></si>`).join('');
  files.push({
    name: 'xl/sharedStrings.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${sstEntries}</sst>`
  });
  return zip(files);
}

export function xlsxToCards(buffer, existingWords = []) {
  const files = unzip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const sstXml = files['xl/sharedStrings.xml']?.toString('utf8') || '';
  const strings = [];
  const siMatches = sstXml.matchAll(/<si>(.*?)<\/si>/gs);
  for (const m of siMatches) {
    const textMatch = m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs);
    const text = Array.from(textMatch, tm => tm[1]).join('');
    strings.push(text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  }
  const sheetXml = files['xl/worksheets/sheet1.xml']?.toString('utf8');
  if (!sheetXml) throw new Error('Missing sheet1.xml in workbook');

  const rows = [];
  const rowMatches = sheetXml.matchAll(/<row\s+r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rm of rowMatches) {
    const rowNum = parseInt(rm[1], 10);
    const cells = {};
    const cellMatches = rm[2].matchAll(/<c\s+r="([A-Z]+)\d+"(?:\s+t="([a-z]+)")?[^>]*>(?:<v>(.*?)<\/v>)?<\/c>/gs);
    for (const cm of cellMatches) {
      const colLetter = cm[1], type = cm[2], val = cm[3];
      cells[colLetter] = type === 's' && val !== undefined ? (strings[parseInt(val, 10)] ?? '') : (val ?? '');
    }
    rows.push({rowNum, cells});
  }
  if (!rows.length) return {cards: [], errors: [], skipped: 0};

  // Find column mapping from header row
  const headerRow = rows[0];
  const colIndex = {};
  for (const [colLetter, val] of Object.entries(headerRow.cells)) {
    const norm = normalize(val);
    for (const def of COLUMNS) {
      if (def.headers.some(h => norm === normalize(h))) {
        colIndex[def.key] = colLetter; break;
      }
    }
  }
  if (!colIndex.word) colIndex.word = 'A';
  if (!colIndex.meaning) colIndex.meaning = 'B';

  const seen = new Set(existingWords.map(w => `${normalize(w.word)}|${normalize(w.meaning || '')}`));
  const cards = [], errors = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const {rowNum, cells} = rows[i];
    const word = (cells[colIndex.word] || '').trim();
    const meaning = (cells[colIndex.meaning] || '').trim();
    if (!word) continue; // Skip empty row
    const key = `${normalize(word)}|${normalize(meaning)}`;
    if (seen.has(key)) {skipped++; continue;}
    seen.add(key);

    const ipa = (cells[colIndex.ipa] || '').trim();
    const pos = (cells[colIndex.pos] || '').trim();
    const sentence = (cells[colIndex.sentence] || '').trim();
    const answersRaw = (cells[colIndex.answers] || '').trim();
    const note = (cells[colIndex.note] || '').trim();
    let image = (cells[colIndex.image] || '').trim();
    const audio = (cells[colIndex.audio] || '').trim();

    // Check media folder for embedded image
    const embeddedImg = files[`xl/media/image_${i}.png`] || files[`xl/media/image_${i}.jpeg`];
    if (embeddedImg && !image) {
      const mime = files[`xl/media/image_${i}.jpeg`] ? 'image/jpeg' : 'image/png';
      image = `data:${mime};base64,${embeddedImg.toString('base64')}`;
    }

    const answers = answersRaw ? answersRaw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : (word ? [word] : []);
    cards.push({word, meaning, ipa, pos, sentence, answers, note, image, audio, row: rowNum});
  }
  return {cards, errors, skipped};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWorkbook} from '../core/xlsx/read.js';
import {workbookToCards} from '../core/excel.js';
import {zip} from '../core/xlsx/zip.js';

const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relNs='http://schemas.openxmlformats.org/package/2006/relationships';
const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const sheetNs='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rels=items=>header+`<Relationships xmlns="${relNs}">${items.map(([id,type,target])=>
  `<Relationship Id="${id}" Type="${office}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);

function placeInCellBook(two=false) {
  const files={};
  files['_rels/.rels']=rels([['rId1','officeDocument','xl/workbook.xml']]);
  files['xl/workbook.xml']=header+`<workbook xmlns="${sheetNs}" xmlns:r="${office}"><sheets><sheet name="VocaLearn" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels']=rels([['rId1','worksheet','worksheets/sheet1.xml']]);
  files['xl/worksheets/sheet1.xml']=header+`<worksheet xmlns="${sheetNs}"><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Word</t></is></c><c r="B1" t="inlineStr"><is><t>Meaning</t></is></c><c r="C1" t="inlineStr"><is><t>Image</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>deploy</t></is></c><c r="B2" t="inlineStr"><is><t>triển khai</t></is></c>
      <c r="C2" t="e"><f>_xlfn.DISPIMG("img-one",1)</f><v>#VALUE!</v></c>
      ${two?'<c r="D2" t="e"><f>_xlfn.DISPIMG("img-two",1)</f><v>#VALUE!</v></c>':''}
    </row></sheetData></worksheet>`;
  files['xl/cellimages.xml']=header+`<etc:cellImages xmlns:etc="http://schemas.microsoft.com/office/spreadsheetml/2022/cellimages"
    xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${office}">
    <etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="img-one"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage>
    ${two?'<etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="img-two"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic></etc:cellImage>':''}
  </etc:cellImages>`;
  files['xl/_rels/cellimages.xml.rels']=rels([
    ['rId1','image','media/image1.png'],
    ...(two?[['rId2','image','media/image2.png']]:[])
  ]);
  files['xl/media/image1.png']=png;
  if(two)files['xl/media/image2.png']=Uint8Array.from([...png,1]);
  return zip(files);
}

test('Microsoft-style Place in Cell DISPIMG relationship is mapped to its worksheet row',async()=>{
  const book=await readWorkbook(placeInCellBook());
  assert.equal(book.imageRows.get(2).length,1);
  assert.match(book.imageRows.get(2)[0],/^data:image\/png;base64,/);
  const parsed=workbookToCards(book);
  assert.equal(parsed.cards.length,1);
  assert.equal(parsed.cards[0].word,'deploy');
  assert.match(parsed.cards[0].image,/^data:image\/png;base64,/);
  assert.deepEqual(parsed.cards[0].imageCandidates,[]);
});

test('Multiple embedded images on one row are retained for explicit preview selection',async()=>{
  const book=await readWorkbook(placeInCellBook(true));
  assert.equal(book.imageRows.get(2).length,2);
  assert.ok(book.warnings.some(w=>w.row===2&&/choose one/i.test(w.message)));
  const parsed=workbookToCards(book);
  assert.equal(parsed.cards[0].image,'');
  assert.equal(parsed.cards[0].imageCandidates.length,2);
});

test('Corrupt or non-XLSX input fails at file level',async()=>{
  await assert.rejects(()=>readWorkbook(Uint8Array.from([1,2,3,4])),/Invalid or unsupported ZIP archive/);
});

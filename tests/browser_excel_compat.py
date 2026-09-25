"""Browser acceptance for Place in Cell and explicit multi-image import choice."""

import os
from io import BytesIO
from pathlib import Path
import socket
import subprocess
import tempfile
import zipfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]
PNG=bytes.fromhex("89504e470d0a1a0a00000000")


def rels(items):
    body="".join(
        f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>'
        for rid,kind,target in items
    )
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>'


def place_in_cell_xlsx():
    sheet_ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    office="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    files={
        "_rels/.rels":rels([("rId1","officeDocument","xl/workbook.xml")]),
        "xl/workbook.xml":f'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="{sheet_ns}" xmlns:r="{office}"><sheets><sheet name="VocaLearn" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels":rels([("rId1","worksheet","worksheets/sheet1.xml")]),
        "xl/worksheets/sheet1.xml":f'''<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="{sheet_ns}"><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Word</t></is></c><c r="B1" t="inlineStr"><is><t>Meaning</t></is></c><c r="C1" t="inlineStr"><is><t>Image</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t>deploy</t></is></c><c r="B2" t="inlineStr"><is><t>triển khai</t></is></c>
            <c r="C2" t="e"><f>_xlfn.DISPIMG("img-one",1)</f><v>#VALUE!</v></c>
            <c r="D2" t="e"><f>_xlfn.DISPIMG("img-two",1)</f><v>#VALUE!</v></c>
          </row></sheetData></worksheet>''',
        "xl/cellimages.xml":f'''<?xml version="1.0" encoding="UTF-8"?><etc:cellImages xmlns:etc="http://schemas.microsoft.com/office/spreadsheetml/2022/cellimages"
          xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{office}">
          <etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="img-one"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage>
          <etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="img-two"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic></etc:cellImage>
        </etc:cellImages>''',
        "xl/_rels/cellimages.xml.rels":rels([
            ("rId1","image","media/image1.png"),("rId2","image","media/image2.png")
        ]),
        "xl/media/image1.png":PNG,
        "xl/media/image2.png":PNG+b"\x01",
    }
    buffer=BytesIO()
    with zipfile.ZipFile(buffer,"w",zipfile.ZIP_STORED) as archive:
        for name,value in files.items():
            archive.writestr(name,value)
    return buffer.getvalue()


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: Excel compatibility acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-excel-cell-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page();page.goto(origin,wait_until="networkidle")
                register_and_create_set(page,"excel-cell@example.test")
                page.locator('[data-action="library"]').click()
                page.locator('[data-action="import"]').click()
                page.locator("#import-file").set_input_files({
                    "name":"place-in-cell.xlsx",
                    "mimeType":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "buffer":place_in_cell_xlsx(),
                })
                expect(page.locator("#preview-import")).to_be_visible()
                page.locator("#preview-import").click()
                choices=page.locator('[data-import-image]')
                expect(choices).to_have_count(2)
                expect(page.locator('[data-action="confirmImport"]')).to_be_disabled()
                choices.nth(1).check()
                expect(page.locator('[data-action="confirmImport"]')).to_be_enabled()
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="confirmImport"]').click()
                expect(page.locator("dialog")).not_to_be_visible()
                row=page.locator(".word-row").filter(has_text="deploy")
                expect(row).to_have_count(1)
                row.locator('[data-action="edit"]').click()
                expect(page.locator("#media-image .editor-image")).to_have_attribute("data-media-status","available")
                page.locator('[data-action="close"]').click()
                print("PASS: Place in Cell images map to the row and multiple images require explicit preview choice")
                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()

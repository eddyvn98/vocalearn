"""Actual browser audio lifecycle acceptance."""
import tempfile, wave, io
from playwright.sync_api import sync_playwright, expect
from browser_support import start_server, stop_server, register_and_create_set

def wav_bytes():
  out=io.BytesIO()
  with wave.open(out,"wb") as w:
    w.setnchannels(1); w.setsampwidth(1); w.setframerate(8000); w.writeframes(bytes([128])*800)
  return out.getvalue()

def main():
  with tempfile.TemporaryDirectory(prefix="voca-audio-") as temp:
    server,log,origin=start_server(temp)
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={"width":1280,"height":900})
        errors=[]; page.on("pageerror",lambda e: errors.append(str(e)))
        register_and_create_set(page,origin)
        page.locator('[data-action="library"]').click()
        page.locator('[data-action="add"]').first.click()
        page.locator('[name="word"]').fill("apple")
        page.locator('[name="meaning"]').fill("quả táo")
        details=page.locator("#word-form details")
        details.locator("summary").click()
        page.locator("#audio-upload").set_input_files({"name":"apple.wav","mimeType":"audio/wav","buffer":wav_bytes()})
        expect(page.locator("#audio-status")).to_contain_text("apple.wav")
        page.locator('#word-form [type="submit"]').click()
        page.locator('[data-action="home"]').first.click()
        page.locator('[data-action="setupFree"]').click()
        page.locator("#setup-game").select_option("dictation")
        page.locator("#setup-game").dispatch_event("change")
        page.locator('#modal [data-action="startSession"]').click()
        play=page.locator('[data-action="playAudio"]')
        expect(play).to_be_visible()
        play.click()
        expect(page.locator("#answer")).to_be_visible(timeout=5000)
        assert not errors, errors
        print("PASS: uploaded WAV persists and dictation audio lifecycle enables answering")
        browser.close()
    finally:
      stop_server(server,log)

if __name__=="__main__":
  main()

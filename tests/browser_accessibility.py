"""Keyboard, IME and responsive browser acceptance checks."""
import tempfile
from playwright.sync_api import sync_playwright, expect
from browser_support import start_server, stop_server, register_and_create_set

VIEWPORTS=[(320,700),(390,844),(768,1024),(1024,768),(1440,900)]

def main():
  with tempfile.TemporaryDirectory(prefix="voca-a11y-") as temp:
    server,log,origin=start_server(temp)
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch()
        for width,height in VIEWPORTS:
          context=browser.new_context(viewport={"width":width,"height":height})
          page=context.new_page(); errors=[]
          page.on("pageerror",lambda e: errors.append(str(e)))
          register_and_create_set(page,origin)
          body_width=page.evaluate("document.body.scrollWidth")
          viewport_width=page.evaluate("document.documentElement.clientWidth")
          assert body_width <= viewport_width+1, f"horizontal overflow at {width}px: {body_width}>{viewport_width}"
          expect(page.locator("h1").first).to_be_visible()
          context.close()
        context=browser.new_context(viewport={"width":390,"height":844})
        page=context.new_page(); register_and_create_set(page,origin)
        page.keyboard.press("Tab")
        focused=page.evaluate("document.activeElement?.tagName")
        assert focused in ("A","BUTTON","INPUT","SELECT","TEXTAREA"), focused
        page.locator('[data-action="library"]').click()
        add_button=page.locator('[data-action="add"]').first
        add_button.focus()
        add_button.click()
        word=page.locator('[name="word"]')
        expect(word).to_be_focused()
        word.fill("nihongo")
        prevented=word.evaluate("""el => {
          const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true});
          el.dispatchEvent(event);
          return event.defaultPrevented;
        }""")
        assert prevented, "IME composing Enter must not submit"
        expect(page.locator("#word-form")).to_be_visible()
        page.locator('#modal [data-action="close"]').click()
        expect(add_button).to_be_focused()
        page.keyboard.press("Tab")
        assert page.evaluate("getComputedStyle(document.activeElement).outlineStyle") != "none"
        context.close(); browser.close()
        print("PASS: viewport matrix, keyboard focus and IME composing")
    finally:
      stop_server(server,log)

if __name__=="__main__":
  main()

"""User-like exploratory journey against the real Railway production app.

Creates a disposable production account, exercises major user flows, and writes
machine-readable PASS/FAIL/BLOCKED evidence plus screenshots. Device-only
capabilities are reported as BLOCKED instead of being fabricated.
"""
import json
import os
import time
import uuid
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ORIGIN=os.environ.get("PRODUCTION_ORIGIN","https://vocalearn-web-production.up.railway.app").rstrip("/")
EVIDENCE=Path("tests/browser-evidence")
EVIDENCE.mkdir(parents=True,exist_ok=True)
RESULTS=[]


def mark(name,status,detail=""):
    RESULTS.append({"name":name,"status":status,"detail":detail})
    print(f"{status}: {name}" + (f" — {detail}" if detail else ""))


def run_check(name,fn,blocked=False):
    if blocked:
        mark(name,"BLOCKED",blocked if isinstance(blocked,str) else "requires physical device")
        return
    try:
        detail=fn() or ""
        mark(name,"PASS",detail)
    except Exception as exc:
        mark(name,"FAIL",f"{type(exc).__name__}: {exc}")


def no_overflow(page):
    state=page.evaluate("() => ({w:innerWidth,s:document.documentElement.scrollWidth})")
    assert state["s"]<=state["w"]+1,state
    return f'{state["w"]}px'


def main():
    stamp=time.strftime("%Y%m%d-%H%M%S")
    email=f"manual.qa.{stamp}.{uuid.uuid4().hex[:6]}@example.test"
    password="manual-qa-password-2026"
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={"width":1440,"height":1000},accept_downloads=True)
        page=context.new_page()
        page_errors=[];console_errors=[]
        page.on("pageerror",lambda e:page_errors.append(str(e)))
        page.on("console",lambda m:console_errors.append(m.text) if m.type=="error" else None)

        def public_shell():
            response=page.goto(ORIGIN,wait_until="networkidle")
            assert response and response.ok
            expect(page).to_have_title("VocaLearn")
            expect(page.locator("#auth-form")).to_be_visible()
            assert "Ngữ vực" not in page.locator("body").inner_text()
            expect(page.get_by_role("button",name="Chưa có tài khoản?")).to_be_visible()
            return "auth shell + Vietnamese copy"

        run_check("Mở production và giao diện đăng nhập",public_shell)

        def signup():
            page.get_by_role("button",name="Chưa có tài khoản?").click()
            expect(page.get_by_role("heading",name="Tạo tài khoản")).to_be_visible()
            expect(page.get_by_role("button",name="Tạo tài khoản",exact=True)).to_be_visible()
            page.get_by_label("Email").fill(email)
            page.get_by_label("Mật khẩu (tối thiểu 12 ký tự)").fill(password)
            page.get_by_role("button",name="Tạo tài khoản",exact=True).click()
            expect(page.locator("#set-form")).to_be_visible(timeout=15000)
            return email

        run_check("Tạo tài khoản mới",signup)

        def create_set():
            page.get_by_label("Tên bộ học").fill("Manual QA English")
            page.get_by_label("Ngôn ngữ học").select_option("en")
            page.get_by_label("Ngôn ngữ nghĩa").select_option("vi")
            page.get_by_role("button",name="Tạo bộ học",exact=True).click()
            expect(page.get_by_role("heading",name="Hôm nay học gì?")).to_be_visible()
            return "English → Vietnamese"

        run_check("Tạo bộ học",create_set)

        def load_samples():
            page.locator('[data-action="samples"]').click()
            expect(page.locator(".metric")).to_have_count(4)
            expect(page.locator("[data-new-usage]")).to_contain_text("/15")
            return page.locator("[data-new-usage]").inner_text()

        run_check("Nạp thẻ mẫu và dashboard Hôm nay",load_samples)

        def library_edit():
            page.get_by_role("button",name=lambda n:n and "Kho từ" in n).click()
            expect(page.get_by_role("heading",name="Kho từ")).to_be_visible()
            rows=page.locator(".word-row")
            assert rows.count()>=8
            row=rows.filter(has_text="deploy").first
            row.get_by_role("button",name="Sửa thẻ").click()
            expect(page.locator("#word-form")).to_be_visible()
            page.get_by_text("Trường bổ sung",exact=True).click()
            page.get_by_label("Mẹo nhớ / ghi chú").fill("Manual QA note")
            page.get_by_label("Mức độ trang trọng").fill("trung tính")
            page.get_by_role("button",name="Lưu",exact=True).click()
            expect(page.locator("dialog")).not_to_be_visible()
            row.get_by_role("button",name="Sửa thẻ").click()
            page.get_by_text("Trường bổ sung",exact=True).click()
            expect(page.get_by_label("Mẹo nhớ / ghi chú")).to_have_value("Manual QA note")
            expect(page.get_by_label("Mức độ trang trọng")).to_have_value("trung tính")
            page.get_by_role("button",name="Đóng").click()
            return f"{rows.count()} thẻ"

        run_check("Kho từ: xem và sửa thẻ",library_edit)

        def topic_flow():
            page.get_by_role("button",name="Chủ đề",exact=True).first.click()
            expect(page.locator("#topic-form")).to_be_visible()
            page.get_by_label("Tên chủ đề").fill("Manual QA")
            page.get_by_role("button",name="Thêm chủ đề",exact=True).click()
            expect(page.locator("dialog")).not_to_be_visible()
            row=page.locator(".word-row").filter(has_text="deploy").first
            row.get_by_role("button",name="Sửa thẻ").click()
            page.get_by_label("Manual QA",exact=True).check()
            page.get_by_role("button",name="Lưu",exact=True).click()
            page.locator('[data-action="scope"]').click()
            page.get_by_label("Manual QA",exact=False).check()
            page.locator('#scope-form [type="submit"]').click()
            expect(page.locator(".word-row")).to_have_count(1)
            page.locator('[data-action="scope"]').click()
            page.locator('[data-action="clearScope"]').click()
            return "tạo → gán → lọc → bỏ lọc"

        run_check("Chủ đề và phạm vi học",topic_flow)

        def study_typing():
            page.locator('[data-action="home"]').first.click()
            page.locator('[data-action="practice"][data-game="typing"]').click()
            expect(page.get_by_role("heading",name="Thiết lập buổi học")).to_be_visible()
            expect(page.get_by_text("Dạng bài",exact=True).first).to_be_visible()
            page.locator('[data-action="startSession"]').click()
            expect(page.locator(".question-panel")).to_be_visible()
            prompt=page.locator(".prompt h1").inner_text().strip()
            answers=page.evaluate("() => import('/js/state.js').then(m => m.current().answers)")
            page.locator("#answer").fill(answers[0])
            page.get_by_role("button",name="Kiểm tra",exact=True).click()
            expect(page.locator("#feedback")).to_be_visible()
            page.locator('[data-action="pause"]').click()
            page.locator('.resume [data-action="finish"]').click()
            expect(page.locator(".summary")).to_be_visible()
            page.locator('.summary [data-action="home"]').click()
            return f"prompt={prompt}"

        run_check("Học thật: Gõ từ → chấm → kết thúc buổi",study_typing)

        def flash_flow():
            page.locator('[data-action="practice"][data-game="flash"]').click()
            page.locator('[data-action="startSession"]').click()
            page.locator('[data-action="flip"]').click()
            expect(page.locator(".flash-back")).to_be_visible()
            page.locator('[data-action="remember"]').click()
            expect(page.locator("#feedback")).to_be_visible()
            page.locator('[data-action="pause"]').click()
            page.locator('.resume [data-action="finish"]').click()
            page.locator('.summary [data-action="home"]').click()
            return "lật thẻ + nhớ"

        run_check("Học thật: Lật thẻ",flash_flow)

        def statistics():
            page.locator('[data-action="statistics"]').click()
            expect(page.get_by_role("heading",name="Thống kê")).to_be_visible()
            assert page.locator(".metrics .metric").count()>=3
            text=page.locator("main").inner_text()
            assert "Đã thuộc" in text and "Hoạt động 30 ngày gần đây" in text
            page.locator('[data-action="home"]').first.click()
            return "metrics + hoạt động"

        run_check("Thống kê",statistics)

        def settings_sync():
            page.get_by_role("button",name="Cài đặt tài khoản").click()
            expect(page.get_by_role("heading",name="Cài đặt")).to_be_visible()
            page.get_by_role("button",name="Đóng").click()
            page.locator('[data-action="syncInfo"]:visible').first.click()
            expect(page.get_by_role("heading",name="Đồng bộ")).to_be_visible()
            page.locator('[data-action="sync"]').click()
            expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
            page.get_by_role("button",name="Đóng").click()
            return "settings + sync 0 pending"

        run_check("Cài đặt và đồng bộ",settings_sync)

        def export_flow():
            page.locator('[data-action="library"]').first.click()
            page.once("dialog",lambda d:d.accept())
            with page.expect_download() as info:
                page.locator('[data-action="export"]').click()
            download=info.value
            assert download.suggested_filename.endswith(".xlsx")
            return download.suggested_filename

        run_check("Xuất Excel",export_flow)

        def password_reset_api():
            response=context.request.post(ORIGIN+"/api/password-reset/request",data={"email":email})
            assert response.status==202,response.status
            return "API nhận yêu cầu; email thật chưa được cấu hình"

        run_check("Yêu cầu quên mật khẩu",password_reset_api)

        def responsive_offline():
            for width,height in [(390,844),(320,780)]:
                page.set_viewport_size({"width":width,"height":height})
                no_overflow(page)
            context.set_offline(True)
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("main")).to_be_visible(timeout=10000)
            context.set_offline(False)
            page.reload(wait_until="networkidle")
            return "390px + 320px + reload offline"

        run_check("Mobile responsive và offline reload",responsive_offline)

        def logout_login():
            page.set_viewport_size({"width":1280,"height":900})
            page.locator('[data-action="settings"]:visible').first.click()
            page.locator('[data-action="logout"]').click()
            expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
            page.get_by_label("Email").fill(email)
            page.get_by_label("Mật khẩu (tối thiểu 12 ký tự)").fill(password)
            page.get_by_role("button",name="Đăng nhập",exact=True).click()
            expect(page.get_by_role("heading",name="Hôm nay học gì?")).to_be_visible(timeout=15000)
            return "logout → login lại giữ dữ liệu"

        run_check("Đăng xuất và đăng nhập lại",logout_login)

        run_check("Speak trên thiết bị thật",None,
                  blocked="CI/headless không chứng minh micro, quyền trình duyệt và ASR thiết bị thật")
        run_check("Viết tay bằng bút/cảm ứng",None,
                  blocked="CI/headless không chứng minh bút thật, cảm ứng và palm rejection")
        run_check("PWA background/notification khi app đóng",None,
                  blocked="cần Android/iPhone thật và trạng thái app nền/đóng")

        page.screenshot(path=str(EVIDENCE/"production-exploratory-final.png"),full_page=True)
        (EVIDENCE/"production-exploratory-results.json").write_text(
            json.dumps({"origin":ORIGIN,"email":email,"results":RESULTS,
                        "pageErrors":page_errors,"consoleErrors":console_errors},ensure_ascii=False,indent=2),
            encoding="utf-8"
        )
        context.close();browser.close()

    failures=[r for r in RESULTS if r["status"]=="FAIL"]
    print(json.dumps({"pass":sum(r["status"]=="PASS" for r in RESULTS),
                      "fail":len(failures),
                      "blocked":sum(r["status"]=="BLOCKED" for r in RESULTS)},ensure_ascii=False))
    if failures:
        raise SystemExit("Exploratory production failures: "+", ".join(r["name"] for r in failures))


if __name__=="__main__":
    main()

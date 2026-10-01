"""Production acceptance: manually load real vocabulary and play every MVP game.

This is intentionally a user-like browser test against the deployed Railway app.
It creates a disposable account, enters vocabulary through the real editor, uploads
an audio resource, answers each of the six MVP game families, verifies a persisted
answer result, syncs, reloads, and writes screenshots + JSON evidence.
"""
import io
import json
import os
import time
import uuid
import wave
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ORIGIN = os.environ.get(
    "PRODUCTION_ORIGIN", "https://vocalearn-web-production.up.railway.app"
).rstrip("/")
EVIDENCE = Path("tests/browser-evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)

CARDS = [
    ("deploy", "triển khai", "We will ___ the app tomorrow.", "deploy"),
    ("confirm", "xác nhận", "Please ___ the meeting time.", "confirm"),
    ("rollback", "quay về phiên bản trước", "We may ___ this release.", "rollback"),
    ("hotfix", "bản sửa lỗi khẩn cấp", "We need a ___ for production.", "hotfix"),
    ("cache", "bộ nhớ đệm", "Clear the ___ before testing.", "cache"),
    ("bottleneck", "điểm nghẽn", "The API is the main ___.", "bottleneck"),
]


def wav_bytes():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 800)
    return buf.getvalue()


def answer_count(page):
    return page.evaluate(
        "() => import('/js/storage.js').then(m => "
        "m.localEvents().filter(e => e.kind === 'answer').length)"
    )


def wait_for_answer(page, before):
    page.wait_for_function(
        "before => import('/js/storage.js').then(m => "
        "m.localEvents().filter(e => e.kind === 'answer').length > before)",
        arg=before,
    )


def finish_early(page):
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    page.locator('.summary [data-action="home"]').click()
    expect(page.locator(".game-grid")).to_be_visible()


def start_game(page, game):
    page.locator(f'[data-action="practice"][data-game="{game}"]').click()
    expect(page.get_by_role("heading", name="Thiết lập buổi học")).to_be_visible()
    start = page.locator('[data-action="startSession"]')
    expect(start).to_be_enabled()
    start.click()
    expect(page.locator(".question-panel")).to_be_visible()


def add_card(page, word, meaning, sentence, answer, audio=None):
    if page.locator('[data-action="add"]:visible').count() == 0:
        page.locator('[data-action="library"]').first.click()
        expect(page.get_by_role("heading", name="Kho từ")).to_be_visible()

    page.locator('[data-action="add"]:visible').first.click()
    expect(page.locator("#word-form")).to_be_visible()

    # Meaning first prevents optional automatic enrichment from racing manual QA input.
    page.locator('#word-form [name="meaning"]').fill(meaning)
    page.locator('#word-form [name="word"]').fill(word)

    page.get_by_text("Trường bổ sung", exact=True).click()
    page.get_by_text("Phát âm & câu ví dụ", exact=True).click()
    page.locator('#word-form [name="sentence"]').fill(sentence)
    page.locator('#word-form [name="answers"]').fill(answer)

    if audio is not None:
        page.get_by_text("Ảnh & âm thanh", exact=True).click()
        page.locator("#audio-upload").set_input_files(
            {"name": f"{word}.wav", "mimeType": "audio/wav", "buffer": audio}
        )
        expect(page.locator("#audio-status")).to_contain_text(f"{word}.wav")

    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()
    expect(page.locator(".word-row").filter(has_text=word).first).to_be_visible()


def assert_feedback_and_save(page, game, before):
    expect(page.locator("#feedback")).to_be_visible()
    wait_for_answer(page, before)
    page.screenshot(
        path=str(EVIDENCE / f"production-game-{game}.png"),
        full_page=True,
    )


def exercise_games(page):
    results = []

    # G-01 Lật thẻ
    before = answer_count(page)
    start_game(page, "flash")
    page.locator('[data-action="flip"]').click()
    expect(page.locator(".flash-back")).to_be_visible()
    page.locator('[data-action="remember"]').click()
    assert_feedback_and_save(page, "flash", before)
    results.append("flash")
    finish_early(page)

    # G-02 Trắc nghiệm: submit the actual answer from the runtime question.
    before = answer_count(page)
    start_game(page, "quiz")
    answer = page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")
    page.locator('[data-action="choose"]').filter(has_text=answer).first.click()
    assert_feedback_and_save(page, "quiz", before)
    results.append("quiz")
    finish_early(page)

    # G-03 Ghép cặp: complete a real pair and verify it writes a result.
    before = answer_count(page)
    start_game(page, "match")
    expected = page.evaluate(
        "() => import('/js/state.js').then(m => m.app.session.queue[0].answers[0])"
    )
    left = page.locator('[data-action="matchLeft"]').first
    left.click()
    page.locator('[data-action="matchRight"]').filter(has_text=expected).first.click()
    expect(left).to_be_disabled()
    wait_for_answer(page, before)
    page.screenshot(
        path=str(EVIDENCE / "production-game-match.png"), full_page=True
    )
    results.append("match")
    finish_early(page)

    # G-04 Gõ từ: deliberately make one retryable typo, then correct it.
    before = answer_count(page)
    start_game(page, "typing")
    answer = page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")
    page.locator("#answer").fill(answer + "x")
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#input-error")).not_to_be_empty()
    page.locator("#answer").fill(answer)
    page.locator('#answer-form [type="submit"]').click()
    assert_feedback_and_save(page, "typing", before)
    results.append("typing")
    finish_early(page)

    # G-05 Chính tả: only deploy has audio, so the eligible question is deterministic.
    before = answer_count(page)
    start_game(page, "spell")
    current = page.evaluate("() => import('/js/state.js').then(m => m.current())")
    assert current["answers"][0] == "deploy", current
    page.locator('[data-action="playAudio"]').click()
    expect(page.locator('[data-action="checkLetters"]')).to_be_enabled(timeout=10000)
    for index in range(len("deploy")):
        page.locator(f'[data-action="letter"][data-index="{index}"]').click()
    page.locator('[data-action="checkLetters"]').click()
    assert_feedback_and_save(page, "spell", before)
    results.append("spell")
    finish_early(page)

    # G-06 Điền câu: answer from the exact sentence-specific accepted_answers.
    before = answer_count(page)
    start_game(page, "cloze")
    answer = page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")
    page.locator("#answer").fill(answer)
    page.locator("#answer").press("Enter")
    assert_feedback_and_save(page, "cloze", before)
    results.append("cloze")
    finish_early(page)

    return results


def main():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    email = f"games.qa.{stamp}.{uuid.uuid4().hex[:6]}@example.test"
    password = "production-games-qa-2026"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1280, "height": 900}, accept_downloads=True
        )
        page = context.new_page()
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        response = page.goto(ORIGIN, wait_until="networkidle")
        assert response and response.ok
        expect(page.locator("#auth-form")).to_be_visible()

        page.get_by_role("button", name="Chưa có tài khoản?").click()
        page.get_by_label("Email").fill(email)
        page.get_by_label("Mật khẩu (tối thiểu 12 ký tự)").fill(password)
        page.get_by_role("button", name="Tạo tài khoản", exact=True).click()
        expect(page.locator("#set-form")).to_be_visible(timeout=15000)

        page.get_by_label("Tên bộ học").fill("Real game QA")
        page.get_by_label("Ngôn ngữ học").select_option("en")
        page.get_by_label("Ngôn ngữ nghĩa").select_option("vi")
        page.get_by_role("button", name="Tạo bộ học", exact=True).click()
        expect(page.locator(".game-grid")).to_be_visible()

        page.locator('[data-action="library"]').first.click()
        for word, meaning, sentence, answer in CARDS:
            add_card(
                page,
                word,
                meaning,
                sentence,
                answer,
                wav_bytes() if word == "deploy" else None,
            )

        expect(page.locator(".word-row")).to_have_count(len(CARDS))
        page.screenshot(
            path=str(EVIDENCE / "production-game-vocabulary-loaded.png"),
            full_page=True,
        )

        page.locator('[data-action="home"]').first.click()
        games = exercise_games(page)

        page.locator('[data-action="syncInfo"]:visible').first.click()
        page.locator('[data-action="sync"]').click()
        expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
        page.get_by_role("button", name="Đóng").click()

        page.reload(wait_until="networkidle")
        page.locator('[data-action="library"]').first.click()
        for word, _, _, _ in CARDS:
            expect(page.locator(".word-row").filter(has_text=word).first).to_be_visible()

        result = {
            "origin": ORIGIN,
            "account": email,
            "cardsLoaded": [card[0] for card in CARDS],
            "gamesCompleted": games,
            "answerEvents": answer_count(page),
            "pageErrors": errors,
        }
        (EVIDENCE / "production-game-results.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        assert games == ["flash", "quiz", "match", "typing", "spell", "cloze"]
        assert answer_count(page) >= 6
        assert not errors, errors
        print(json.dumps(result, ensure_ascii=False))

        context.close()
        browser.close()


if __name__ == "__main__":
    main()

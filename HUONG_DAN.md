# Hướng dẫn chạy VocaLearn 0.1.0

Đây là bản code khởi đầu, chưa hoàn thành toàn bộ MVP. Repo chưa được tạo trên GitHub.

## 1. Chạy trên máy

Cần Node.js 22.13 trở lên. Mở Terminal trong thư mục `vocalearn` đã giải nén:

```sh
npm start
```

Mở `http://localhost:3000`, đăng ký tài khoản, tạo bộ học Anh-Việt hoặc Anh-Anh rồi thêm từ. Mật khẩu tối thiểu 12 ký tự. Nút thêm thẻ mẫu chỉ chạy khi bạn chọn; không tạo lịch sử học giả.

Sau khi clone mới, chạy `npm ci` để cài `fflate` dùng cho Excel. AI không bắt buộc: nếu chưa cấu hình máy chủ AI thì app vẫn học bình thường. Dữ liệu server lưu trong `data/`, dữ liệu trình duyệt lưu trong IndexedDB.

## 2. Tạo repo riêng tư và đẩy code

Cần Git và GitHub CLI (`gh`) trên máy bạn:

```sh
gh auth login
sh scripts/publish-github.sh vocalearn
```

Script hiện tài khoản đăng nhập và hỏi xác nhận. Nó chỉ tạo repo mới **private**, không ghi đè repo cũ, không force-push. Không gửi token hoặc mật khẩu vào ChatGPT. Trên Windows, xem script PowerShell trong README.

## 3. Kiểm thử

```sh
npm run verify
```

Đã chạy 45 ca nghiệp vụ/API, đều đạt. Luồng trình duyệt thật chưa kiểm thử được trong phiên tạo code do hạn chế môi trường; đọc `docs/TEST_REPORT.md`.

## 4. Giới hạn cần biết

Nhập/xuất Excel và kho media đã có. AI giai đoạn 2 đã có hàng đợi, đề xuất có bảo vệ sửa tay và kho câu; để tạo nội dung thật cần trỏ `AI_PROVIDER_URL` tới model tự vận hành. Game nghe vẫn cần audio của thẻ. Nhận giọng nói và viết chữ thuộc giai đoạn 3, chưa phát hành.

Chưa đưa ứng dụng lên Internet. Không mở cổng server phát triển ra ngoài; cần HTTPS và hoàn thiện các mục trong `docs/STATUS.md` trước khi triển khai.

## Tài liệu cho agent/Codex

Đọc `AGENTS.md`, `docs/STATUS.md` và `docs/spec-v0.5.md`. File Word gốc là `docs/spec-v0.5.docx`. Mỗi module JavaScript dưới 300 dòng. Sau khi sửa asset, chạy `npm run build:sw`.

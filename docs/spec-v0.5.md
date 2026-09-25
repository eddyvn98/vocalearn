# Vocabulary application specification v0.5

Text/table extraction of `spec-v0.5.docx`. The original Word document remains authoritative, including figures and reviewer comments. This export is not a new product specification.

ĐẶC TẢ ỨNG DỤNG HỌC TỪ VỰNG

Tài liệu yêu cầu dành cho đội phát triển

Phiên bản 0.5  |  Ngày 25/09/2026  |  Người đề xuất: Minh Son

## 1. Mục tiêu và nguyên tắc thiết kế

Ứng dụng học từ vựng cá nhân, học được trên web, điện thoại và máy tính bảng. Người dùng nhập từ của riêng mình, AI hỗ trợ điền nội dung (nghĩa, định nghĩa, câu ví dụ, phiên âm), người dùng học qua game và ôn tập theo phương pháp lặp lại ngắt quãng (spaced repetition). Sản phẩm kế thừa các điểm mạnh của Lexilize (lexilize.com), ứng dụng người đề xuất đã dùng, và khắc phục các hạn chế của nó (Mục 13).

Nguyên tắc thiết kế:

Offline-first: dữ liệu đã tải và các game đủ điều kiện hoạt động không cần mạng. AI, đăng nhập lần đầu và đồng bộ cần mạng; TTS, Nói và nhắc lịch phải theo khả năng đã kiểm chứng của từng thiết bị (Mục 2.5).

Một bộ máy cho mọi ngôn ngữ: khác biệt giữa các thứ tiếng được khai báo qua "hồ sơ ngôn ngữ" (Mục 3.3), không viết code riêng cho từng tiếng.

Game linh hoạt theo mặt thẻ: mỗi game cho người dùng chọn mặt hỏi và mặt đáp trong phạm vi hợp lệ.

Chấm điểm theo độ khó: trả lời đúng ở game khó được cộng điểm ôn tập nhiều hơn game dễ.

UI/UX: phong cách, màn hình, trạng thái và tiêu chí kiểm thử được quy định tại Mục 17.

## 2. Nền tảng và kiến trúc

### 2.1. Ứng dụng phía người dùng

Chọn web app dạng PWA cho giai đoạn 1–3. App native chỉ là hướng mở rộng sau khi đánh giá thực tế; không phải lựa chọn còn bỏ ngỏ của MVP.

Máy tính bảng có bút cảm ứng phải được hỗ trợ tốt cho game Viết chữ tiếng Trung, tiếng Nhật (yêu cầu chi tiết ở Mục 8.4).

Mỗi thiết bị giữ một cơ sở dữ liệu cục bộ để học offline.

### 2.2. Server (bắt buộc)

| Thành phần | Chức năng |
| --- | --- |
| Tài khoản | Đăng nhập, quản lý các thiết bị của người dùng |
| Cơ sở dữ liệu | Từ, category, bộ học, trạng thái ôn tập, log trả lời, kho câu AI |
| Kho lưu ảnh | Lưu ảnh đã nén, tách riêng khỏi cơ sở dữ liệu |
| Đồng bộ | Gửi thay đổi khi có mạng; chống ghi trùng theo mã sự kiện. Log chỉ ghi thêm; trạng thái ôn tập phải được tính lại theo quy tắc hợp nhất ở Mục 2.4. Nội dung thẻ giải quyết xung đột theo từng trường. |
| Hàng đợi AI | Xử lý nền các việc: điền nghĩa, định nghĩa, tạo kho câu, gợi ý mẹo nhớ |
| Máy chủ AI | Chạy mô hình ngôn ngữ mã nguồn mở do mình tự vận hành (Mục 2.3) |

Công nghệ server (dịch vụ có sẵn như Supabase, Firebase, hoặc tự dựng PostgreSQL và kho lưu file) do đội phát triển đề xuất.

### 2.3. Phân bổ AI: nặng trên server, nhẹ trên máy

| Việc | Chạy ở đâu | Lý do |
| --- | --- | --- |
| Tạo câu, điền nghĩa, định nghĩa, mẹo nhớ | Server | Cần mô hình đủ lớn để viết tốt nhiều thứ tiếng |
| Đọc từ (TTS) | Thiết bị; âm thanh tải sẵn khi cần | Chỉ bật offline khi có giọng đọc cục bộ đã kiểm thử hoặc file âm thanh đã tải. Không suy ra khả năng PWA từ khả năng của hệ điều hành. |
| Nhận giọng nói (game Nói) | Thiết bị, khi có bộ nhận dạng tương thích | Phải kiểm chứng theo trình duyệt, thiết bị và ngôn ngữ. Không có nhận dạng offline thì tắt game Nói khi offline, không tự gửi âm thanh lên cloud. |
| Tra phiên âm, pinyin, kana | Thiết bị hoặc server | Là thư viện tra cứu, không phải AI, chạy nhẹ |

AI local trong tài liệu là mô hình mã nguồn mở tự vận hành trên server riêng, không dùng API AI trả phí theo lượt làm mặc định. Đội phát triển chọn mô hình và bộ phục vụ phù hợp; dữ liệu nội dung không được tự gửi sang nhà cung cấp khác. Cấu hình, giấy phép và chi phí hạ tầng phải được xác nhận ở Mục 15.

Mô hình chạy trực tiếp trên điện thoại là phương án bổ sung, chỉ bật trên cấu hình đã kiểm thử về bộ nhớ, pin, tốc độ và chất lượng. Không đặt việc chạy mô hình này làm điều kiện để dùng các game lõi.

Thêm từ khi offline: lưu được ngay. Thẻ chỉ có Từ ở trạng thái “Chờ bổ sung”, chưa được tính học mới; thẻ đủ điều kiện học theo Mục 4.3 và 7.7 được học ngay. Việc AI được xếp hàng khi tính năng đã phát hành; kho câu và tài nguyên đã tải dùng được offline.

### 2.4. Đồng bộ và hợp nhất kết quả học

Thiết bị là nơi ghi nhận thao tác; server là nơi xác nhận trạng thái hợp nhất. Khi chưa đồng bộ, lịch và thống kê trên máy là kết quả tạm thời. Giao diện phải hiển thị số thay đổi đang chờ, lần đồng bộ thành công cuối và lỗi có thể thử lại.

Mỗi thao tác có event_id duy nhất, user_id, device_id, thời điểm và phiên bản dữ liệu gốc. Gửi lại cùng event_id không được tạo log mới, cộng lỗi mới hay đổi lịch lần nữa. Ghi kết quả cuối câu, thay đổi lịch cục bộ và hàng đợi đồng bộ trong một giao dịch.

Nội dung thẻ hợp nhất theo từng trường. Hai máy sửa hai trường khác nhau thì giữ cả hai. Cùng sửa một trường từ cùng phiên bản: bản được server chấp nhận sau thắng; bản bị thay thế được giữ trong lịch sử xung đột để xem/khôi phục. Không dùng đồng hồ thiết bị làm căn cứ duy nhất.

Một cơ hội ôn được định danh bằng word_id, schedule_revision gốc, giai đoạn và bước học. Các kết quả cùng cơ hội ôn chỉ sinh một chuyển trạng thái. Khi nhiều máy trả lời khác nhau, chọn kết quả thận trọng nhất: Quên < Khó < Tốt < Dễ; cùng mức Khó thì ưu tiên lý do có giảm hệ số dễ. Chỉ áp dụng hệ số và số lần quên một lần.

Server tính trạng thái từ ảnh chụp lịch gốc của cơ hội ôn, kết quả hợp nhất và thời điểm hợp lệ sớm nhất của nhóm; không nhân tiếp trên lịch đã cập nhật của máy khác. Mỗi kết quả log vẫn được giữ để phân tích. Ví dụ một máy Tốt, một máy Quên trên cùng lịch gốc: kết quả hợp nhất là Quên, không phải hai lượt ôn liên tiếp.

Kết quả phụ thuộc một schedule_revision phải được xử lý sau phiên bản cha. Nếu log đến muộn làm thay đổi kết quả cha, server tính lại nhánh lịch. Các lượt phía sau dựa trên phiên bản không còn hợp lệ được giữ dưới dạng luyện tập, không tiếp tục đẩy lịch. Máy nhận lịch hợp nhất và thông báo “Lịch đã điều chỉnh sau đồng bộ”.

Lưu recorded_at, received_at và effective_at riêng. Ưu tiên thời gian ước tính từ mốc server đã đồng bộ cộng thời gian trôi trên máy. Giá trị trước mốc đồng bộ tin cậy hoặc sau lúc server nhận phải được giới hạn và gắn cờ; nếu không có mốc tin cậy, dùng received_at. effective_at được chốt một lần cho từng event_id. Sự kiện cùng mốc được sắp ổn định theo device_id rồi event_id.

Quan hệ từ–category đồng bộ theo thao tác thêm/xóa thành viên, không ghi đè toàn bộ danh sách. Xóa thắng thao tác thêm đồng thời cùng quan hệ; thêm lại sau khi đã thấy thao tác xóa là hành động mới hợp lệ. Xóa thẻ tạo tombstone: sửa cũ, log cũ và kết quả AI đến muộn không được làm thẻ sống lại. Khôi phục phải là hành động riêng của người dùng.

### 2.5. Khả năng thiết bị và phương án dự phòng

Ma trận kiểm thử bắt buộc: Windows với Chrome/Edge; macOS với Chrome/Safari; Android với Chrome/PWA; iPhone/iPad với Safari/PWA. Bản phát hành phải ghi rõ phiên bản hệ điều hành, trình duyệt, chế độ cài PWA và ngôn ngữ đã thử. Đây là phạm vi kiểm thử, không phải tuyên bố mọi tính năng đã hỗ trợ trên mọi tổ hợp.

| Tính năng | Điều kiện bật | Khi không đáp ứng |
| --- | --- | --- |
| Học offline | Đã đăng nhập, tải bộ học và các tài nguyên cần thiết. | Hiện rõ tài nguyên thiếu; chỉ cho chơi phần đã tải. Không xóa log đang chờ để giải phóng chỗ. |
| Âm thanh/TTS | Giọng đọc offline đã thử hoặc audio cache đúng ngôn ngữ, phiên bản Từ. | Tắt mặt A và các lượt nghe; vẫn học game chữ/hình. Có mạng thì đề nghị tải gói âm thanh, không tự coi TTS là offline. |
| Nói | Có quyền mic và bộ nhận dạng cục bộ đã thử cho ngôn ngữ đó. | Giải thích lý do chưa dùng được; đổi game. Không quy lỗi mic, hết thời gian xử lý hay thiếu model thành Quên. |
| Viết bằng bút | Có dữ liệu nét đúng ngôn ngữ và đầu vào cảm ứng/bút đã thử. | Cho dùng ngón tay; nếu không chống chạm lòng bàn tay được, có chế độ chỉ nhận bút khi nhận diện được bút. Không tuyên bố palm rejection khi chưa thử. |
| Nhắc lịch | Người dùng bật, cấp quyền và cơ chế thông báo của nền tảng đã thử. | Hiện nhắc trong app khi mở. Không cam kết thông báo đúng giờ khi PWA đóng hoặc thiết bị offline. |

Ảnh, audio và dữ liệu nét phải có trạng thái tải, dung lượng và phiên bản. Tài nguyên thiếu hoặc hỏng được tải lại khi có mạng; không ảnh hưởng lịch sử học đã ghi. Không đổi bộ nhận dạng hoặc tuyến xử lý âm thanh mà không thông báo rõ cho người dùng.

Giao diện tài nguyên, quyền và đồng bộ: Mục 17.9; khả năng tiếp cận: Mục 17.11.

## 3. Bộ học và hồ sơ ngôn ngữ

### 3.1. Bộ học

Mỗi bộ học gồm ngôn ngữ học và ngôn ngữ nghĩa, ví dụ Anh → Việt, Trung → Việt, Anh → Anh.

Không giới hạn số bộ học.

Mỗi bộ học chọn kiểu nghĩa chính: song ngữ (mặt Nghĩa là bản dịch) hoặc đơn ngữ (mặt Nghĩa là định nghĩa bằng chính ngôn ngữ đó; bản dịch chuyển thành trường phụ, dùng làm gợi ý).

### 3.2. Yêu cầu riêng cho học đơn ngữ (Anh–Anh, Nhật–Nhật)

Định nghĩa không được chứa chính từ cần học hoặc các dạng của nó. AI phải tránh khi viết; khi Nghĩa là mặt hỏi, app tự che các chữ đó nếu còn sót.

Giới hạn độ dài định nghĩa khoảng 20 từ. Game Trắc nghiệm và Ghép cặp phải có bố cục cho chữ dài.

Trình độ từ ngữ trong định nghĩa phải thấp hơn trình độ của từ đang học.

Nhật–Nhật: hiện furigana (chữ kana nhỏ ghi cách đọc) phía trên kanji trong định nghĩa và câu ví dụ.

### 3.3. Hồ sơ ngôn ngữ

Mỗi ngôn ngữ khai báo một hồ sơ; bộ máy chung đọc hồ sơ để quyết định mặt thẻ, cách chấm và game được bật. Thêm ngôn ngữ mới chỉ cần thêm hồ sơ.

| Thuộc tính | Tiếng Anh | Tiếng Trung | Tiếng Nhật |
| --- | --- | --- | --- |
| Mặt Phiên âm | IPA | Pinyin có dấu thanh | Kana (hiển thị furigana) |
| Nguồn phiên âm | Dữ liệu từ điển mở | Thư viện chuyển đổi pinyin | Bộ phân tích hình thái |
| Đáp án game gõ | Gõ thẳng từ | Gõ pinyin, rồi chọn đúng chữ | Gõ kana, rồi chọn đúng kanji |
| Mặt chính bổ sung | — | Âm Hán Việt | — |
| Trường phụ đặc thù | — | Giản/phồn thể, bộ thủ, số nét, lượng từ | Cách đọc on/kun (tùy chọn) |
| Game riêng | — | Viết chữ, Thanh điệu, Lượng từ | Viết chữ (kanji, hiragana, katakana) |

Các ngôn ngữ có giống ngữ pháp (Đức, Pháp…) khai báo trường Giống trong hồ sơ; trường này bật được làm mặt thẻ trong game Trắc nghiệm để luyện chọn giống.

## 4. Cấu trúc thẻ từ

### 4.1. Mặt chính (dùng trong game)

| Mã | Mặt thẻ | Bắt buộc | Nguồn dữ liệu |
| --- | --- | --- | --- |
| T | Từ | Có | Người dùng nhập |
| N | Nghĩa (bản dịch hoặc định nghĩa) | Không | Người dùng nhập, hoặc AI điền |
| P | Phiên âm | Không | Tra từ điển/thư viện; AI chỉ là dự phòng (Mục 11.2) |
| H | Hình | Không | Người dùng thêm, hoặc nhập từ ảnh nhúng trong Excel |
| C | Câu ví dụ | Không | Người dùng nhập hoặc AI tạo; game dùng câu mới từ kho câu AI |
| A | Âm thanh | Theo khả năng thiết bị | TTS đọc T; dùng audio cache khi thiết bị cần tài nguyên tải sẵn (Mục 2.5). |
| HV | Âm Hán Việt (chỉ tiếng Trung) | Không | Tra từ dữ liệu Hán Việt |

### 4.2. Trường phụ

Trường phụ mặc định không làm mặt hỏi/đáp; một số trường bật được làm mặt thẻ phụ.

| Trường | Ví dụ | Cách dùng |
| --- | --- | --- |
| Loại từ | noun, verb | Bộ lọc; chọn đáp án nhiễu cùng loại |
| Biến thể / dạng từ | go, went, gone | Gợi ý tạo câu; chỉ chấp nhận biến thể được khai báo riêng trong đáp án của câu hiện tại. |
| Đồng nghĩa / trái nghĩa | big: large / small | Bật được làm mặt thẻ trong Trắc nghiệm |
| Cụm hay đi kèm | make a decision | Gợi ý cho AI khi tạo câu |
| Họ từ | decide, decision, decisive | Hiện ở mặt sau khi Lật thẻ |
| Ngữ vực | trang trọng / thân mật / lóng | Nhãn trên thẻ |
| Trình độ | CEFR A1–C2, HSK 1–9, JLPT N5–N1 | Bộ lọc; độ khó câu AI |
| Giống ngữ pháp | der/die/das, le/la | Bật được làm game chọn giống |
| Bản dịch (khi học đơn ngữ) | quả táo | Gợi ý khi bí |
| Mẹo nhớ | tự ghi hoặc AI gợi ý | Hiện khi trả lời sai |
| Nguồn | gặp trong bản vẽ dự án X | Tra cứu |
| Tag tự do | #hay-nhầm | Bộ lọc |

Trường tự tạo: người dùng thêm trường riêng cho từng bộ học (tên, kiểu chữ/số/danh sách chọn).

Mặt trống, chưa được xác nhận theo yêu cầu hoặc thiếu tài nguyên không được dùng để tạo câu hỏi. Bỏ qua tổ hợp mặt không hợp lệ, nhưng phải báo số thẻ đủ/thiếu điều kiện trước khi học; không âm thầm coi là đã học xong.

Nội dung do AI điền được gắn nhãn “AI” cho đến khi người dùng xác nhận hoặc sửa. Nghĩa phải được người dùng chọn; dữ liệu gắn nhãn “cần kiểm tra” không dùng để chấm tự động. Các trường AI còn lại chỉ được dùng sau kiểm tra ở Mục 11.2.

### 4.3. Đơn vị thẻ và trạng thái sẵn sàng

Một thẻ (word_id) đại diện cho một từ hoặc cụm từ gắn với một nghĩa cụ thể trong một bộ học. Cùng cách viết nhưng khác nghĩa, loại từ hoặc cách đọc cần học riêng thì là các thẻ khác nhau. Ví dụ bank – ngân hàng và bank – bờ sông có lịch ôn độc lập. Một thẻ có thể thuộc nhiều category nhưng không nhân bản lịch.

Chỉ bắt buộc T để lưu. “Chờ bổ sung”: chưa có mặt hỏi hợp lệ cho Gõ từ; chỉ được xem/Lật thẻ tham khảo, không tiêu hao chỉ tiêu học mới, không có ngày đến hạn. “Sẵn sàng học”: có T và ít nhất một mặt hỏi N/H/P/HV phù hợp, kèm cách đọc đã kiểm tra nếu hồ sơ yêu cầu. Trắc nghiệm và từng game có điều kiện riêng ở Mục 7.7.

Nội dung phải phân biệt được nghĩa đang kiểm tra. Nếu nhiều thẻ cùng cách viết/cách đọc làm câu hỏi mơ hồ, thêm nghĩa hoặc ngữ cảnh phân biệt; không dùng tổ hợp chỉ có phiên âm để kiểm tra hai nghĩa giống mặt đáp. Khi không tạo được câu hỏi rõ ràng, thẻ chờ bổ sung cho tổ hợp đó.

Sửa chính tả hoặc trình bày không tự xóa lịch. Đổi Từ hoặc đổi sang nghĩa khác phải hỏi: “Tạo thẻ mới” (mặc định) hay “Thay nội dung và đặt lại tiến độ”. Đặt lại tiến độ tạo sự kiện mới, không xóa log cũ. Thẻ mới do tách nghĩa không kế thừa kết quả đã thuộc của nghĩa khác.

## 5. Category

Cây phân cấp không giới hạn số tầng, ví dụ: Công việc > BIM > Revit > Family.

Một từ thuộc nhiều category (quan hệ nhiều-nhiều).

Chọn phạm vi học bằng một hoặc nhiều nút trong cây, có tùy chọn gồm cả category con.

Trạng thái ôn tập gắn với từ, không gắn với category: từ nằm trong 2 category vẫn chỉ đến hạn một lần.

Kéo-thả category để đổi cha/thứ tự, không được tạo vòng lặp. Kéo từ ở một category cụ thể sang category khác là chuyển liên kết đó; các category khác của từ giữ nguyên. Có lệnh “Thêm vào category” để sao liên kết. Trong màn hình tổng hợp không xác định được category nguồn, kéo-thả mặc định chỉ thêm liên kết.

Thống kê theo từng nút lấy tập word_id duy nhất sau khi áp dụng tùy chọn gồm category con; không đếm lặp. “Đã thuộc” là nhãn thống kê: thẻ đang ôn theo ngày, khoảng ôn ≥ 21 ngày, không quá hạn và không ở sổ từ sai. Mẫu số tỷ lệ là số thẻ đang hoạt động trong phạm vi, gồm cả thẻ mới/chờ bổ sung; phạm vi rỗng hiển thị 0/0 và “—”.

Xóa category chỉ xóa category và liên kết trong nhánh được xác nhận; không xóa các thẻ. Thẻ không còn category nằm ở “Chưa phân loại”. Bộ lọc và màn hình chọn phạm vi luôn hiển thị tùy chọn này.

Trên giao diện tiếng Việt, category hiển thị là “Chủ đề”. Cây chủ đề và bộ chọn phạm vi: Mục 17.8.

## 6. Nhập từ

### 6.1. Nhập tay

Có trên web, điện thoại và máy tính bảng. Người dùng gõ từ, chọn bộ học/category và lưu được ngay; tra cứu và AI (từ giai đoạn 2) bổ sung khi khả dụng. Người dùng chọn nghĩa cần học, xem lại/sửa nội dung; có thể tạo nhiều thẻ nếu chọn nhiều nghĩa. Thêm hình bằng chụp ảnh, chọn thư viện hoặc dán ảnh. Không chặn lưu vì AI đang chờ hoặc lỗi.

### 6.2. Nhập từ Excel

| Cột | Ví dụ | Ghi chú |
| --- | --- | --- |
| Từ | apple | Bắt buộc |
| Nghĩa | quả táo | AI gợi ý từ giai đoạn 2; người dùng chọn nghĩa |
| Phiên âm | /ˈæp.əl/ | Tự tra khi tính năng khả dụng |
| Câu ví dụ | She eats an apple every day. | AI tạo từ giai đoạn 2; MVP dùng câu nhập tay |
| Hình | Ảnh nhúng trong ô | Xem yêu cầu bên dưới |
| Loại từ | noun |  |
| Biến thể | apples | Ngăn cách bằng dấu phẩy |
| Category | Trái cây \| Tiếng Anh A1 > Đồ ăn | Dấu > phân tầng, dấu \| ngăn nhiều category |
| Trường phụ, trường tự tạo |  | Mỗi trường một cột |

Bước ghép cột: người dùng chỉ định cột nào là trường nào, nên file theo thứ tự bất kỳ đều nhập được, kể cả file xuất từ Lexilize.

Đọc ảnh nhúng, cả ảnh "Place in Cell" (Microsoft 365) và ảnh nổi thông thường (gán vào dòng theo vị trí góc trên bên trái). Phải đọc trực tiếp từ cấu trúc .xlsx (thư mục xl/media và các file XML vị trí ảnh), vì thư viện đọc Excel thông thường thường bỏ qua ảnh.

Tự nén ảnh khi nhập (ví dụ tối đa khoảng 800px, định dạng WebP).

Không dùng cột link ảnh: ảnh phải nằm trong file để học offline được.

Xem trước trước khi nhập: đánh dấu dòng hợp lệ, dòng lỗi, thẻ trùng và cùng cách viết khác nghĩa; cho chọn gộp, bỏ qua hoặc tạo thẻ riêng. Quy tắc cụ thể ở Mục 6.3.

Xuất ngược ra Excel cùng cấu trúc, kèm ảnh và cột word_id để nhận diện khi nhập lại. Đây là xuất nội dung thẻ; không phải bản sao lưu lịch ôn và log.

### 6.3. Phát hiện trùng và gộp nội dung

Trong cùng bộ học, đối chiếu word_id nếu có và thuộc đúng người dùng. Không có ID: so T đã chuẩn hóa Unicode, khoảng trắng, hoa/thường; đồng thời đối chiếu loại từ, nghĩa đã chọn và cách đọc phân biệt nếu có. Cùng T nhưng nghĩa/cách đọc khác thì không tự gộp. Thiếu nghĩa hoặc nội dung chỉ gần giống: đánh dấu “Cần đối chiếu”, người dùng quyết định.

Gộp với thẻ có sẵn giữ word_id, lịch ôn, log và trạng thái sổ từ sai của thẻ đích. Mặc định chỉ điền trường đang trống; trường khác nhau phải cho chọn giá trị trên màn hình xem trước. Category/tag hợp nhất, ảnh trùng theo mã nội dung chỉ lưu một bản. Không cộng hai lịch ôn và không tạo kết quả học từ thao tác nhập.

Gộp hai thẻ đã có tiến độ không nằm trong thao tác nhập MVP: yêu cầu chọn thẻ đích và rà soát riêng, không tự gộp lịch sử. Dòng chỉ có T được nhập thành “Chờ bổ sung”. Dòng không có T bị loại và ghi lý do; không làm hỏng các dòng hợp lệ.

Mỗi đợt nhập có import_id và trạng thái từng dòng; nhấn lại hoặc nối tiếp sau lỗi không nhập trùng dòng đã thành công. Báo tổng số thêm mới, cập nhật, bỏ qua và lỗi. Ảnh không đọc được phải báo theo dòng, vẫn cho nhập nội dung chữ sau khi người dùng xác nhận.

Luồng soạn thẻ, nhập/xuất và đối chiếu trùng: Mục 17.8.

## 7. Game

### 7.1. Số lượng

7 game chung cho mọi ngôn ngữ (5 game lõi và 2 game kiểm tra theo kênh nghe-viết và nói), cộng game Viết chữ cho tiếng Trung và tiếng Nhật, và 2 game riêng cho tiếng Trung là Thanh điệu và Lượng từ (Mục 8). Mỗi game kiểm tra một mức nhớ hoặc một kênh riêng, không trùng nhau. Phiên âm không có game riêng mà là một mặt thẻ dùng trong hầu hết các game.

### 7.2. Bảng tổng quan

| # | Game | Kiểm tra | Mặt hỏi | Mặt đáp | Cách chấm |
| --- | --- | --- | --- | --- | --- |
| 1 | Lật thẻ | Làm quen | Bất kỳ | Các mặt còn lại | Tự chấm nhớ/quên |
| 2 | Trắc nghiệm | Nhận ra | T, N, P, H, C*, A, HV | T, N, P, H, HV; mặt phụ theo 7.3 | Chọn 1 trong 4 |
| 3 | Ghép cặp | Nhận ra nhanh | Hai mặt khác nhau trong T, N, P, H, A, HV | — | 2–6 cặp hợp lệ; mặc định 6 |
| 4 | Gõ từ | Nhớ lại | N, H, P, HV | T (gõ) | So khớp chuỗi |
| 5 | Chính tả (nghe-viết) | Nghe và viết đúng | A (+ P tùy chọn) | T (xếp chữ hoặc gõ) | So khớp chuỗi |
| 6 | Điền câu | Dùng trong ngữ cảnh | Câu khuyết hợp lệ; gợi ý N/H/P/HV tùy chọn | T (chọn hoặc gõ) | Danh sách đáp án riêng của câu |
| 7 | Nói | Nói đúng từ | N, H, P, HV hoặc câu khuyết | T (nói) | Giọng nói thành chữ, so khớp |

### 7.3. Nguyên tắc chọn mặt thẻ

Người dùng chọn trong ma trận ở Mục 7.2. HV chỉ có ở hồ sơ hỗ trợ. Tổ hợp hỏi–đáp phải khác mặt và không lộ đáp án; C* là câu có từ đích/biến thể đã che. A chỉ là mặt hỏi trong Trắc nghiệm, không làm một đáp án tự phát âm trong danh sách lựa chọn.

Game gõ hoặc nói có mặt đáp là Từ hoặc dạng từ đúng của câu hiện tại. Tiếng Trung/Nhật áp dụng Mục 8.2. Mặt hỏi được chọn từ đầu không tính là gợi ý bổ sung; tuy nhiên, khi P đã lộ toàn bộ phần cần gõ trong cơ chế hai bước, mức tối đa là Khó.

Phiên âm chỉ làm mặt đáp trong game chọn hoặc ghép; không bắt người dùng gõ IPA.

Ma trận mặt phụ: Trắc nghiệm hỗ trợ T → Đồng nghĩa, T → Trái nghĩa và T → Giống ngữ pháp khi hồ sơ có dữ liệu; các trường này không làm mặt hỏi/đáp cho game khác ở MVP. Một danh sách có nhiều đáp án đúng phải dùng nhóm đáp án hợp lệ, chỉ đưa một phần tử đúng vào bộ lựa chọn. Game Giống dùng đúng tập giống của hồ sơ, không ép đủ bốn phương án.

Không chọn đáp án nhiễu có cùng nội dung hiển thị, đồng nghĩa hợp lệ hoặc cách đọc tương đương đáp án đúng đối với mặt đang chấm. Ghép cặp phải có ánh xạ một-một rõ ràng; nếu hai nghĩa/ảnh/phiên âm làm nhiều cặp đều hợp lý thì loại tổ hợp đó. Không phạt người dùng vì bộ câu hỏi mơ hồ.

### 7.4. Chi tiết từng game

1. Lật thẻ. Mặt trước là mặt hỏi đã chọn, mặt sau hiện các mặt còn lại và trường phụ. Người dùng tự bấm Nhớ hoặc Quên. Vì tự chấm nên kết quả tối đa chỉ tính mức Khó.

2. Trắc nghiệm. Mặc định 4 đáp án; ưu tiên nhiễu cùng category và loại từ. Thiếu nhiễu thì mở rộng trong cùng bộ học, không tự lấy bộ học khác. Nếu vẫn thiếu, dùng 3 rồi 2 đáp án; không đủ 2 thì game không khả dụng cho thẻ. Từ ngoài phạm vi chỉ làm nhiễu, không được tính đã học. Với P, ưu tiên gần âm nhưng không trùng âm hợp lệ.

3. Ghép cặp. Mặc định 6 cặp; phạm vi ít từ dùng 2–5 cặp, không tự mở rộng thẻ mục tiêu ra ngoài phạm vi. Ít hơn 2 cặp thì tắt game. Khi ghép sai, ghi lỗi cho thẻ của ô bên trái/mặt hỏi được chọn, không tự phạt cả hai thẻ. Hoàn thành mỗi thẻ sinh đúng một kết quả cuối câu; thẻ đã ghép sai tối đa nhận Khó khi ghép đúng lại.

4. Gõ từ. Nhìn nghĩa, hình hoặc phiên âm rồi gõ ra từ. Đây là game quan trọng nhất cho khả năng nhớ lại.

5. Chính tả (nghe-viết). App đọc từ bằng TTS, người dùng viết lại. Có 2 cấp: xếp chữ (các chữ cái bị xáo trộn, dành cho từ mới) và gõ tự do. Có nút nghe lại và nghe chậm.

6. Điền câu. Mỗi lượt lấy câu khuyết hợp lệ trong kho (Mục 11.1), hoặc câu gốc đã khai báo đáp án. Chỉ chấp nhận accepted_answers của câu đó, không toàn bộ biến thể của thẻ. Ví dụ “Yesterday, I ___ to school.” nhận went, không nhận go/goes/gone. Có chế độ chọn hoặc gõ; bật gợi ý bổ sung thì tối đa Khó.

7. Nói. Chuyển tiếng nói thành chữ để kiểm tra nhận ra từ, không chấm chất lượng phát âm. Dùng đáp án của thẻ/câu; từ đồng âm chỉ được chấp nhận qua cách đọc đã kiểm tra, cùng ngôn ngữ và cả thanh điệu nếu có. Được tối đa 2 lần nhận dạng hợp lệ; đúng lần hai tối đa Khó. Lỗi kỹ thuật không tiêu hao lần thử và không thành Quên (Mục 7.8).

### 7.5. Chế độ Trộn

Trộn chỉ chọn trong các game đã bật, đã phát hành và đủ điều kiện trên thiết bị. Với Ôn theo lịch, mỗi thẻ/cơ hội ôn nhận một game chấm chính; các game tiếp theo cho cùng cơ hội là luyện thêm, không cập nhật lịch. Chọn thẻ trước, sau đó chọn ngẫu nhiên game/mặt hợp lệ; lưu lựa chọn và thứ tự trong phiên để tải lại không đổi câu.

### 7.6. Quy tắc chấm khi gõ

Chuẩn hóa Unicode NFC, bỏ khoảng trắng đầu/cuối và gộp khoảng trắng thừa; mặc định không phân biệt hoa/thường. Không tự bỏ dấu câu bên trong từ. Dấu ngôn ngữ mặc định bắt buộc đúng; có thể nới ở bộ học, nhưng thanh điệu pinyin luôn theo Mục 8.2. Lưu cả đáp án gốc, đáp án chuẩn hóa và phiên bản quy tắc.

Sai đúng 1 thao tác thêm/xóa/thay một ký tự hiển thị sau chuẩn hóa: cho sửa 1 lần; hai ký tự đảo chỗ tính 2 thao tác. Đúng sau sửa nhận Khó với lý do “đã sửa”; sai tiếp hoặc sai quá giới hạn nhận Quên. Ngoại lệ: game gõ hai bước và Nói dùng giới hạn ở Mục 8.2 và 7.8. Không dùng khoảng cách gần đúng để coi đáp án sai là đúng.

Ghi thời gian hoạt động, số lần thử, gợi ý và thời gian chờ tài nguyên riêng. Điều kiện mức Dễ theo Mục 9.5; không tự đánh Quên chỉ vì trả lời chậm.

### 7.7. Kiểm tra điều kiện trước buổi học

Trước khi bắt đầu, hiển thị: phạm vi, chế độ học, số thẻ đủ điều kiện theo từng game và số thẻ bị loại kèm lý do. Ví dụ: “8/12 thẻ chơi được Gõ từ; 4 thẻ thiếu mặt hỏi”. Người dùng được tiếp tục với phần hợp lệ hoặc quay lại bổ sung; không ghi log sai cho thẻ bị loại.

Mặt chữ phải có nội dung; H phải có ảnh tải được; A phải phát được offline nếu đang offline; C phải có đúng một ô khuyết và đáp án hợp lệ. Khi AI đang gợi ý nhiều nghĩa mà chưa được chọn, không tự đưa thẻ vào học chỉ vì các trường khác đã được điền. Gõ Trung/Nhật cần cách đọc và dữ liệu chọn chữ; Viết chữ cần dữ liệu nét cho toàn bộ chữ trong từ. Kiểm tra lại khi bắt đầu câu vì quyền hoặc tài nguyên có thể thay đổi.

Game không khả dụng trong Trộn bị loại khỏi lựa chọn. Khi người dùng chọn riêng một game không khả dụng, hiện lý do và nút đổi game, không tự đổi mà không báo. Thẻ không đủ điều kiện bước bắt buộc của học mới được giữ ở bước hiện tại và gắn “Chờ bổ sung”, không tự cho tốt nghiệp.

Bảng thiết lập buổi học: Mục 17.5; giao diện các game: Mục 17.6.

### 7.8. Lần thử, kết quả cuối câu và lỗi kỹ thuật

Lần thử là một lần gửi đáp án hoặc một nét/chữ con. Kết quả cuối câu là một kết luận cho một thẻ trong một game; gồm đúng/sai, had_error, có gợi ý, số lần thử và mức điểm. Cơ hội ôn là đơn vị đổi lịch ở Mục 9.3. Không lấy số lần thử hoặc số nét làm số lượt ôn.

| Tình huống | Kết quả cuối câu | Sổ từ sai |
| --- | --- | --- |
| Đúng ngay, không gợi ý | Theo độ khó game và thời gian. | Có thể tạo minh chứng ra khỏi sổ. |
| Sai rồi sửa đúng trong giới hạn | Khó; had_error = true. | Vào sổ; tăng lỗi tối đa 1 cho câu. |
| Dùng gợi ý rồi đúng, chưa từng sai | Khó; có trợ giúp. | Không tự tăng lỗi; không là minh chứng đúng sạch. |
| Sai hết lượt / chọn “Không biết” | Quên. | Vào sổ; tăng lỗi tối đa 1 cho câu. |
| Thoát, tải lại, tạm dừng hoặc lỗi kỹ thuật | Chưa có kết quả chấm mới. | Không tăng lỗi; khôi phục tiến độ đã lưu. |

Nói: chỉ một bản nhận dạng thành công mới là một lần thử. Không có quyền mic, không thu được tiếng, lỗi model, hết thời gian xử lý hoặc nhận dạng báo không đủ tin cậy là lỗi kỹ thuật; cho thu lại hoặc đổi game. Đúng lần hai sau một nhận dạng hợp lệ sai thì had_error = true. Không lưu âm thanh thô mặc định; lưu transcript và mã lỗi cần thiết.

Viết chữ: sai nét được sửa trong giới hạn thì ghi had_error; hoàn thành toàn từ sau sửa/gợi ý tối đa Khó. Không hoàn thành đúng một chữ thì cả từ Quên. Tô theo là làm quen, không chấm lịch và không đưa vào sổ. Các bài ôn riêng một chữ chỉ là luyện thêm, không thay thế kết quả nhớ cả từ.

## 8. Tiếng Trung và tiếng Nhật

### 8.1. Mặt thẻ tiếng Trung

| Mặt | Vai trò | Ghi chú |
| --- | --- | --- |
| Chữ Hán (T) | Mặt chính | Chọn giản thể hoặc phồn thể; dạng còn lại là trường phụ |
| Pinyin có dấu thanh (P) | Mặt chính | Tự sinh bằng thư viện, không cần AI |
| Nghĩa (N) | Mặt chính |  |
| Âm Hán Việt (HV) | Mặt chính | Lợi thế lớn cho người Việt: 学生 là học sinh |
| Hình, Câu, Âm thanh | Mặt chính | Như các ngôn ngữ khác |
| Bộ thủ, số nét | Trường phụ | Hiện khi Lật thẻ |
| Lượng từ | Trường phụ | Chỉ cho danh từ, ví dụ 本 cho 书 |

### 8.2. Quy tắc game gõ cho tiếng Trung và tiếng Nhật

Game gõ tiếng Trung/Nhật là hai bước: nhập cách đọc của toàn từ, rồi chọn dạng chữ viết của toàn từ trong các phương án; không chọn từng ký tự rời. Gõ từ/Chính tả dùng T và cách đọc của thẻ; Điền câu dùng dạng đáp án và cách đọc riêng của câu. Một câu chỉ có một kết quả cuối sau cả hai bước.

Tiếng Trung: chấp nhận pinyin có dấu hoặc số; chuẩn hóa khoảng trắng/ranh giới âm tiết, ü/u:/v và thanh nhẹ 0/5. Ví dụ 学生: xuéshēng, xue2sheng1 hoặc xue2 sheng1 cùng chuẩn hóa thành hai âm tiết xue2, sheng1. Không chấp nhận bỏ thanh nếu đáp án không phải thanh nhẹ. Cách đọc của từ đa âm phải gắn với nghĩa của thẻ, không chỉ chuyển đổi từng chữ độc lập.

Sau khi gõ đúng cách đọc, hiện mặc định 4 dạng viết toàn từ, giảm xuống 3 hoặc 2 nếu thiếu nhiễu đồng âm hợp lệ; cùng dạng giản/phồn theo bộ học. Nếu không có đủ hai phương án, bước này chuyển thành hiển thị xác nhận chữ; câu tối đa Khó vì chưa kiểm tra nhận mặt chữ. Không sinh chữ giả chỉ để đủ số đáp án.

Tiếng Nhật: nhập kana bằng bàn phím/IME của máy; romaji chưa chuyển thành kana không là đáp án. Từ có kanji chọn dạng viết của toàn từ, giữ phần kana đi kèm: 食べる → たべる → chọn 食べる. Từ nhiều kanji: 学生 → がくせい → chọn 学生. Từ chỉ có kana như ありがとう bỏ bước chọn và chấm đúng cách viết T; từ katakana như コーヒー chấp nhận こーひー và chuẩn hóa hiragana sang katakana, giữ nguyên dấu kéo dài; không tự coi こひ là cùng đáp án.

Nhập sai một ký tự của cách đọc được sửa một lần theo Mục 7.6; sai quá giới hạn thì Quên và dừng trước bước chọn chữ. Bước chọn chữ có một lần chọn chấm; chọn sai thì Quên. Cả hai bước đúng nhưng đã sửa cách đọc thì Khó. Với Điền câu, không dùng cách đọc nguyên mẫu khi câu yêu cầu biến thể khác.

### 8.3. Hai game riêng cho tiếng Trung

Thanh điệu. Nghe âm thanh rồi chọn thanh (1, 2, 3, 4, nhẹ) cho từng âm tiết, hoặc nhìn pinyin chưa có dấu rồi đánh dấu thanh.

Lượng từ. Hiện câu dạng 一 ___ 书, chọn lượng từ đúng (本).

### 8.4. Game Viết chữ (tiếng Trung và tiếng Nhật)

Người dùng viết chữ bằng bút hoặc ngón tay trên màn hình cảm ứng, app chấm từng nét. Game có 3 cấp, từ học mới đến kiểm tra trí nhớ.

#### 8.4.1. Ba cấp chơi

| Cấp | Cách chơi | Mức điểm ôn tập |
| --- | --- | --- |
| Tô theo | Hiện nét mờ, người dùng tô theo đúng thứ tự nét | Chỉ dùng khi học mới, không tính điểm |
| Viết có gợi ý | Ô trống; viết sai nét nào thì hiện nét đó | Khó |
| Viết từ trí nhớ | Ô trống hoàn toàn, không có gợi ý | Tốt; nhanh và không sai nét thì Dễ |

#### 8.4.2. Quy tắc chơi và chấm

Mặt hỏi (cấp Viết có gợi ý và Viết từ trí nhớ): Nghĩa, Pinyin/Kana, Âm Hán Việt, Âm thanh, hoặc câu có ô trống. Mặt đáp luôn là chữ viết tay.

Chấm từng nét theo thứ tự, hướng và vị trí tương đối. Nét sai lần 1 được thử lại; sai lần 2 thì hiện gợi ý nét và cho hoàn thành có trợ giúp. Đã sai nét hoặc dùng gợi ý thì kết quả cả từ tối đa Khó. Sai tiếp sau gợi ý hoặc chọn “Không biết” thì cả từ Quên; ngưỡng hình học theo cấu hình kiểm thử ở Mục 15.

Từ nhiều chữ viết lần lượt từng chữ. Không hoàn thành đúng một chữ thì cả từ Quên; hoàn thành sau sửa thì cả từ Khó. Ghi riêng chữ/nét sai để luyện bổ sung, nhưng mỗi câu chỉ tăng số lỗi của cả từ tối đa một lần.

Từ giai đoạn 3, thẻ mới thuộc hồ sơ bật Viết chữ đi qua Tô theo rồi Viết có gợi ý trước khi tốt nghiệp. Giai đoạn 2 chưa bật Viết chữ nên không chặn học tiếng Trung. Thẻ đã tốt nghiệp trước khi bật Viết chữ không bị đặt lại toàn bộ lịch; app gợi ý luyện viết bổ sung (Mục 9.4).

Sau khi viết xong, hiện chữ mẫu cạnh chữ người dùng viết để so sánh, kèm nút xem lại hoạt ảnh thứ tự nét.

#### 8.4.3. Dữ liệu nét

Tiếng Trung: đánh giá Hanzi Writer làm thành phần chấm nét; chỉ dùng bộ chữ giản/phồn đã có dữ liệu và đã kiểm thử. Thẻ có ký tự thiếu dữ liệu không được đưa vào game Viết chữ; vẫn học các game khác.

Tiếng Nhật: yêu cầu dữ liệu cho kanji, hiragana và katakana; dùng nguồn dành cho tiếng Nhật, đánh giá nguồn như KanjiVG và nguồn bổ sung nếu cần. Không mặc định nguồn đã đủ mọi ký tự hoặc dùng thay dữ liệu Trung. Kiểm tra cách viết, thứ tự nét và giấy phép trước phát hành.

Đội phát triển cần kiểm tra giấy phép sử dụng của các bộ dữ liệu nét.

#### 8.4.4. Yêu cầu nhập bằng bút và cảm ứng

Viết được bằng cả bút cảm ứng và ngón tay.

Ưu tiên chống nhận nhầm lòng bàn tay khi dùng bút trên thiết bị hỗ trợ; phải thử trên thiết bị thật. Có chế độ chỉ nhận bút nếu nhận diện được pointer bút và có thông báo giới hạn khi nền tảng không đáp ứng.

Nét vẽ mượt, độ trễ thấp; không cần cảm ứng lực nhấn.

Ô viết có lưới chia 4 hoặc 9 ô (kiểu vở tập viết) để canh tỷ lệ; bật/tắt được.

Nút xóa nét vừa viết và nút xóa toàn bộ chữ.

Ô viết đủ lớn trên điện thoại; trên máy tính bảng hiển thị được nhiều ô cho từ nhiều chữ.

### 8.5. Đáp án nhiễu cho tiếng Trung

Trong game Trắc nghiệm, ưu tiên chữ có hình dạng gần giống (己 / 已 / 巳) và chữ đồng âm khác thanh.

### 8.6. Tiếng Nhật

Mặt Phiên âm là cách đọc bằng kana, hiển thị furigana. Game gõ theo Mục 8.2. Hồ sơ tiếng Nhật đầy đủ phát hành ở giai đoạn 3, gồm Viết chữ cho kanji, hiragana, katakana; người mới được gợi ý học kana trước. Giai đoạn trước vẫn có thể lưu thẻ Nhật như dữ liệu, nhưng không quảng bá là đã hỗ trợ đầy đủ cách học tiếng Nhật.

## 9. Thuật toán ôn tập (SM-2 cải tiến theo quy tắc sản phẩm)

### 9.1. Quy đổi kết quả game ra mức điểm

| Kết quả | Mức | Khoảng ôn tiếp | Hệ số dễ |
| --- | --- | --- | --- |
| Kết quả cuối câu Quên | Quên | Học lại sau 10 phút; qua được thì 1 ngày | −0,20; chỉ một lần khi rơi khỏi ôn theo ngày |
| Đúng sạch ở Lật thẻ, Trắc nghiệm, Ghép cặp, Xếp chữ, Điền câu chọn, Thanh điệu, Lượng từ; hoặc bị giới hạn do mặt hỏi/cách chơi | Khó | × 1,2; ít nhất tăng 1 ngày | Giữ nguyên (Khó do giới hạn game) |
| Đúng sạch ở Gõ từ, Chính tả gõ, Điền câu gõ, Nói, Viết chữ từ trí nhớ; chưa đủ điều kiện Dễ | Tốt | × hệ số dễ trước lượt ôn | Giữ nguyên |
| Như Tốt; nhanh hơn ngưỡng, không sai, không trợ giúp và không gián đoạn | Dễ | × hệ số dễ trước lượt ôn × 1,3 | +0,15 sau khi tính khoảng ôn |
| Đúng sau sửa, nhận dạng lần hai, dùng gợi ý; Viết chữ có gợi ý | Khó | × 1,2; ít nhất tăng 1 ngày | −0,15 (Khó do cần trợ giúp) |

Hệ số dễ (EF) khởi đầu 2,5; tối thiểu 1,3. Bảng áp dụng cho một cơ hội ôn theo ngày được chấp nhận, không nhân lại cho từng game luyện thêm. Học mới/học lại dùng quy tắc riêng ở Mục 9.4.

Thông số có thể chỉnh trong cài đặt nâng cao; lưu phiên bản cấu hình tại mỗi cơ hội ôn. Đổi cài đặt chỉ tác động các cơ hội ôn mới sau đó, không tính lại log đã chấp nhận. Không cho nhập giá trị không hữu hạn, khoảng ôn dưới 1 ngày, thời gian âm hoặc hệ số dưới mức tối thiểu.

### 9.2. Quy tắc đi kèm

Học mới có chuỗi và khoảng chờ cụ thể ở Mục 9.4. Các bước không phát hành hoặc không khả dụng chỉ được thay/bỏ theo bảng, không tự chuyển thẻ sang ôn theo ngày khi chưa vượt qua bước kiểm tra nhớ lại bắt buộc.

Giới hạn mặc định 15 thẻ bắt đầu học mới/ngày trên toàn tài khoản, chỉnh được. Tính một lần khi thẻ rời “Chưa học”, không tính khi chỉ nhập/lưu. Học tiếp thẻ đang dở không tốn chỉ tiêu lần nữa. Nếu nhiều máy offline làm vượt mức trước đồng bộ, giữ kết quả đã học và dừng thêm mới đến ngày sau; không hoàn tác buổi học.

“Ôn trước, học mới sau” chỉ chặn bắt đầu học mới, không chặn nhập/lưu từ hoặc Luyện tự do. Áp dụng cho thẻ đến hạn đủ điều kiện trong bộ học/category đang chọn, gồm các bước học trong ngày đang đến hạn. Thẻ thiếu dữ liệu hiển thị thành nhóm chờ xử lý, không chặn vô hạn các thẻ khác; thẻ ngoài phạm vi không khóa phạm vi hiện tại.

Ngày học dùng một múi giờ tài khoản chung, khởi tạo từ thiết bị đầu và cho người dùng đổi rõ ràng. Ngày đến hạn theo lịch có hiệu lực từ 00:00; bước trong ngày dùng thời điểm tuyệt đối. Mọi thiết bị lưu UTC và quy đổi cùng múi giờ. Đổi múi giờ giữ nguyên ngày đến hạn đã lưu, không ghi lại quá khứ hoặc cấp lại chỉ tiêu cùng một ngày đã tính.

Ghi log mọi kết quả cuối câu và các lần thử; phân biệt học mới, ôn theo lịch, học lại và luyện tự do. Lưu phiên bản thuật toán, cấu hình, snapshot câu hỏi/đáp án và lịch gốc; dữ liệu là cơ sở đánh giá nâng cấp FSRS, không tự đổi thuật toán khi đồng bộ.

Ví dụ với EF = 2,5, không quá hạn và làm tròn 0,5 lên: khoảng ôn 1 → 3 → 8 → 20 → 50 → 125 ngày khi liên tục đạt Tốt. Quy tắc tính chính xác ở Mục 9.6.

### 9.3. Một cơ hội ôn và các chế độ học

| Chế độ | Đổi lịch ôn? | Quy tắc |
| --- | --- | --- |
| Ôn theo lịch | Có, một lần cho mỗi cơ hội đến hạn. | Một câu chấm chính cho mỗi thẻ. Trắc nghiệm đúng rồi Gõ từ sai trong phần luyện thêm không tạo hai lần đổi lịch. |
| Học mới / Học lại | Đổi bước học; lịch theo ngày chỉ khi tốt nghiệp. | Mỗi bước đến hạn là một cơ hội riêng. Không cộng EF nhiều lần vì chơi nhiều game trong cùng bước. |
| Luyện tự do / luyện sau câu | Không đổi EF, khoảng ôn hoặc ngày đến hạn. | Ghi log, cập nhật sổ từ sai theo Mục 10. Có thể luyện cả từ chưa đến hạn. |
| Ôn sổ từ sai | Mặc định không đổi lịch. | Có nút vào Ôn theo lịch nếu thẻ thực sự đến hạn; chỉ sau khi chuyển chế độ mới tạo cơ hội ôn theo lịch. |

Khi tạo câu chấm chính, khóa review_opportunity_id, schedule_revision gốc, game, mặt hỏi–đáp, câu, đáp án và cấu hình. Nhấn gửi nhiều lần hoặc tải lại không tạo cơ hội mới. Khi câu đã có kết quả cuối, lịch được ghi ngay; không chờ kết thúc cả buổi. Game Trộn/Ghép cặp vẫn tuân thủ nguyên tắc một kết quả cho mỗi thẻ/cơ hội.

Một cơ hội ôn đã xong không được biến thành lượt ôn mới chỉ bằng đổi category, đổi game hay đóng/mở app. Chỉ lịch/bước tiếp theo đến hạn mới tạo cơ hội mới. Nếu hai thiết bị cùng dùng lịch gốc, áp dụng hợp nhất ở Mục 2.4.

### 9.4. Chuỗi học mới và học lại

| Bước | Khi thực hiện | Điều kiện chuyển bước |
| --- | --- | --- |
| 1. Lật thẻ làm quen | Ngay khi bắt đầu học mới. | Xem mặt sau và bấm tiếp tục; không tăng EF, không tính sai. |
| 2. Trắc nghiệm | Sau bước 1 ít nhất 1 phút. | Đúng để đi tiếp. Không đủ 2 đáp án: thay bằng Lật thẻ nhắc lại, ghi rõ bước không có kiểm tra. |
| 3. Chính tả xếp chữ | Sau khi qua bước 2 ít nhất 10 phút. | Đúng để đi tiếp. Không có audio: thay bằng Gõ từ với mặt hỏi N/H/P/HV; không yêu cầu nghe. |
| 4. Gõ từ | Sau khi qua bước 3 ít nhất 10 phút. | Bắt buộc hoàn thành đúng; có thể qua sau sửa với mức Khó. Thẻ thiếu mặt hỏi/cách đọc hợp lệ giữ nguyên bước, chờ bổ sung. |
| 5. Tô theo (Trung/Nhật) | Ngay sau bước 4, chỉ từ giai đoạn 3 khi hồ sơ bật Viết chữ và đủ dữ liệu. | Hoàn thành toàn bộ chữ; không chấm điểm. Thiếu dữ liệu nét: đánh dấu kỹ năng viết chờ bổ sung, không chặn tốt nghiệp chuỗi lõi. |
| 6. Viết có gợi ý | Sau bước 5 ít nhất 10 phút. | Hoàn thành toàn bộ chữ; tốt nghiệp. Trước giai đoạn 3 hoặc không áp dụng Viết chữ: tốt nghiệp ngay sau bước 4. |

Sai ở bước chấm thì ở lại đúng bước đó và thử lại sau 10 phút, không quay về đầu; các game luyện xen giữa không rút ngắn thời gian chờ. Tốt nghiệp đặt giai đoạn ôn theo ngày, khoảng ôn 1 ngày, ngày đến hạn là ngày học kế tiếp và mốc chuyển lịch là thời điểm tốt nghiệp. Trong chuỗi mới EF giữ 2,5; không cộng/trừ EF theo từng bước. “Ngày học mới” không bắt buộc hoàn thành trong một ngày lịch.

Quên khi đang ôn theo ngày: EF giảm 0,20 một lần (không dưới 1,3), vào Học lại sau 10 phút. Dùng một game nhớ lại hợp lệ ưu tiên Gõ từ; không có game phù hợp thì chờ bổ sung, không tốt nghiệp bằng Lật thẻ. Sai tiếp: lặp bước sau 10 phút, không tiếp tục trừ EF. Đúng dù mức Khó/Tốt/Dễ: về ôn theo ngày với khoảng 1 ngày, giữ EF đã giảm.

Dữ liệu/bộ máy viết được bổ sung sau này thì kỹ năng viết còn thiếu được đưa vào luyện viết riêng, không đặt lại lịch từ đã tốt nghiệp. Thẻ đủ dữ liệu ở bước 5 đã bắt đầu nhưng dừng giữa chừng thì tiếp tục bước đó; không tự bỏ bước chỉ vì đóng app.

Tiến trình học mới/học lại và cách hiển thị thời gian chờ: Mục 17.7.

### 9.5. Gợi ý và ngưỡng thời gian cho mức Dễ

“Đúng sạch” là đúng lần thử đầu, không gợi ý bổ sung và không sai nét/chữ. Hiện thêm N/H/P/HV ngoài mặt hỏi ban đầu, nghe lại/nghe chậm, hiện chữ/nét mẫu hoặc chỉ chỗ sai đều là trợ giúp và giới hạn Khó. Các game nhận biết luôn bị giới hạn Khó dù trả lời rất nhanh.

| Game nhớ lại | Ngưỡng mặc định để xét Dễ |
| --- | --- |
| Gõ từ, Chính tả gõ | 5 giây cho từ đơn hệ chữ Latin; 8 giây cho gõ hai bước Trung/Nhật. Cộng 2 giây cho mỗi từ/âm tiết thêm. |
| Điền câu gõ | 10 giây; cộng 2 giây cho mỗi từ/âm tiết thêm trong đáp án. |
| Nói | 5 giây; cộng 2 giây cho mỗi từ/âm tiết thêm. Tính thời gian phản ứng và nói, không tính xử lý nhận dạng. |
| Viết từ trí nhớ | max(8 giây, 2 giây × tổng số nét của toàn từ). Chỉ xét khi đúng mọi nét ngay lần đầu. |

Đây là giá trị mặc định sản phẩm, cho phép chỉnh theo game trong cài đặt nâng cao. Hồ sơ ngôn ngữ quy định cách đếm từ/âm tiết; Nói dùng cách đọc đã lưu. Chỉ đạt Dễ khi thời gian hoạt động nhỏ hơn ngưỡng, không dùng gợi ý và không gián đoạn. Bằng ngưỡng thì Tốt.

Bắt đầu tính khi câu hỏi/tài nguyên đã sẵn sàng; game nghe tính sau lượt audio đầu, Nói khi mic sẵn sàng. Trừ thời gian tải, TTS đầu và xử lý nhận dạng; ghi riêng các độ trễ. Tạm dừng, app vào nền hoặc tải lại sau khi đã thấy câu thì không xét Dễ cho câu đó, nhưng không tự tính sai.

### 9.6. Công thức lịch ôn theo ngày và ví dụ kiểm thử

Gọi I là khoảng ôn cũ (ngày nguyên, ≥ 1), E là EF trước lượt ôn, D là số ngày lịch trong múi giờ tài khoản từ lần chuyển lịch gần nhất đến ngày trả lời. B = max(I, D). round_half_up(x) là làm tròn đến số nguyên gần nhất, phần lẻ đúng 0,5 làm tròn lên. Mặc định khoảng ôn tối đa 3.650 ngày. Các hằng số ở bảng dưới là cấu hình mặc định; khi người dùng chỉnh, dùng giá trị trong config_snapshot của cơ hội ôn, không đọc cấu hình vừa thay giữa câu.

| Kết quả | Khoảng ôn mới I′ | EF sau lượt ôn |
| --- | --- | --- |
| Khó do giới hạn game | min(3650, max(I+1, round_half_up(B × 1,2))) | E |
| Khó do trợ giúp/sửa | Như dòng Khó ở trên | max(1,3; E − 0,15) |
| Tốt | min(3650, max(I+1, round_half_up(B × E))) | E |
| Dễ | min(3650, max(I+1, round_half_up(B × E × 1,3))) | E + 0,15 |
| Quên | Không dùng công thức nhân; học lại sau 10 phút. | max(1,3; E − 0,20) |

Sau câu đúng, ngày đến hạn = ngày trả lời + I′ ngày; cập nhật mốc chuyển lịch. Dùng E cũ để tính I′ rồi mới tăng/giảm E. B chỉ bù thời gian quá hạn cho lượt ôn theo ngày; không áp dụng cho luyện tự do, thẻ mới hoặc học lại. Hết giới hạn 3.650 ngày thì giữ ở mức trần, không bắt tăng thêm.

| Đầu vào | Kết quả | Đầu ra bắt buộc |
| --- | --- | --- |
| I=4; E=2,5; D=4 | Trắc nghiệm đúng sạch | Khó; I′=5; EF=2,5. |
| I=4; E=2,5; D=4 | Gõ sai 1 ký tự rồi sửa đúng | Khó; I′=5; EF=2,35; vào sổ từ sai. |
| I=4; E=2,5; D=4 | Tốt | I′=10; EF=2,5. |
| I=4; E=2,5; D=4 | Dễ | I′=13; EF=2,65 (không dùng 2,65 để nhân trước). |
| I=4; E=2,5; D=7 | Tốt, trễ hạn 3 ngày | B=7; I′=18; EF=2,5. |
| I=4; E=1,3; D=4 | Quên | EF=1,3; học lại sau 10 phút; đúng lại thì I′=1. |
| I=1; E=2,5; D=1 | Khó do giới hạn game | I′=2; EF=2,5. |

## 10. Sổ từ sai

Thẻ vào sổ khi có ít nhất một lần thử sai trong câu được chấm, kể cả sửa đúng về sau; hoặc kết quả cuối là Quên. Tô theo, Lật thẻ làm quen, lỗi kỹ thuật và thoát giữa câu không tự tạo lỗi. Mỗi kết quả cuối câu có lỗi chỉ tăng failure_count một lần, không theo số nét/lần thử.

Ra khỏi sổ khi có 2 minh chứng đúng sạch sau lỗi gần nhất, ở 2 game_id khác nhau, cách nhau ít nhất 10 phút; ít nhất một game là Gõ từ, Chính tả gõ, Điền câu gõ, Nói hoặc Viết từ trí nhớ. Hai cấp của cùng game không được coi là hai game. Luyện tự do và Ôn theo lịch đều tạo được minh chứng, nhưng ra khỏi sổ không tự đổi lịch.

Có chế độ “Ôn sổ từ sai” riêng, lọc category, mặc định là luyện tập không đổi lịch. Thẻ đủ điều kiện đến hạn có nút chuyển sang Ôn theo lịch để dùng cơ hội ôn chính. Sai lúc luyện một từ chưa đến hạn chỉ đưa vào sổ, không tự kéo ngày đến hạn về sớm.

Từ “dai dẳng” là có từ 6 câu có lỗi trở lên kể từ lần ra khỏi sổ gần nhất. Gợi ý sửa hình/câu/mẹo nhớ. Khi đủ điều kiện ra khỏi sổ: xóa cờ dai dẳng, đặt bộ đếm đợt về 0 nhưng giữ tổng số lỗi lịch sử và log.

Đúng cùng game hoặc chưa đủ 10 phút không tăng bộ đếm minh chứng và không xóa minh chứng đầu. Lần thử sai mới xóa các minh chứng; dùng trợ giúp thì ngắt chuỗi đúng sạch nhưng không tự tăng failure_count nếu chưa sai. Game không có khả năng kiểm tra vì thiếu dữ liệu hoặc bước chỉ hiển thị xác nhận chữ không tạo minh chứng.

Hai kết quả trên cùng review_opportunity_id từ hai máy được gộp thành tối đa một lần lỗi hoặc một minh chứng theo kết quả thận trọng hơn. Câu luyện độc lập có question_id khác nhau vẫn là các lần luyện riêng. Luyện một chữ con không đủ để đưa thẻ nhiều chữ ra khỏi sổ; cần hai minh chứng cho toàn từ.

Giao diện sổ từ sai và minh chứng ra khỏi sổ: Mục 17.7.

## 11. AI

### 11.1. Kho câu cho game Điền câu

Khi thẻ đã có nghĩa được chọn, xếp việc tạo sẵn 5 câu trên server (từ giai đoạn 2); không gọi tạo câu đồng bộ khi đang chơi. Gộp yêu cầu trùng theo word_id, phiên bản nội dung và loại việc.

Ưu tiên câu hợp lệ chưa dùng trong vòng hiện tại; sau đó chọn câu có lần dùng gần nhất xa nhất, rồi số lần dùng ít nhất, rồi sentence_id. Khi tất cả 5 câu đã dùng, xếp việc tạo thêm 5 câu nếu có mạng; offline thì lặp câu cũ theo thứ tự trên và đánh dấu đã dùng lại. Không chờ AI để tiếp tục game.

Mỗi câu phải đúng nghĩa của thẻ, đúng trình độ, chứa một vị trí mục tiêu có thể khuyết và có accepted_answers riêng cho đúng ngữ cảnh. Mặc định giới hạn 15 từ/đơn vị tách từ theo hồ sơ ngôn ngữ; không đếm tiếng Trung/Nhật chỉ bằng khoảng trắng. Kiểm tra vị trí khuyết, biến thể, dấu câu và danh sách đáp án; không đạt thì loại hoặc “cần kiểm tra”, không dùng để chấm.

Chưa có câu AI thì dùng câu gốc đã xác định vị trí khuyết và đáp án đúng. Câu gốc chưa xác định được tự động phải cho người dùng chọn đoạn khuyết/xác nhận đáp án. Không có câu nào hợp lệ thì tắt Điền câu cho thẻ và nêu lý do; trong Trộn chọn game khác.

Người dùng xóa hoặc báo lỗi từng câu; câu đó bị loại ngay khỏi các lượt tạo mới trên thiết bị và đồng bộ trạng thái. Kết quả của câu đã hoàn thành được giữ trong log kèm nội dung snapshot; không tự sửa lịch sử âm thầm.

Cấu trúc câu tối thiểu: text, gap_start/gap_end theo chỉ số ký tự hiển thị, target_form, accepted_answers[], accepted_readings[] nếu cần, word_content_version và trạng thái. Ví dụ câu “Yesterday, I ___ to school.” có target_form=went, accepted_answers=[went]; không lấy toàn bộ go/went/gone của thẻ làm đáp án. Mặt N chỉ gợi ý nghĩa, không thay được khóa đáp án.

Câu hỏi giữ nguyên snapshot khi đã hiện. Nếu đồng bộ xóa/báo lỗi câu trước khi người dùng trả lời, hủy câu chưa chấm và đổi câu mà không phạt. Khi T/ nghĩa/ cách đọc của thẻ đổi, đánh dấu kho câu phụ thuộc phiên bản cũ cần kiểm tra lại; không ghép câu cũ với đáp án mới.

### 11.2. Tự điền nội dung

Nghĩa: AI gợi ý 1–3 nghĩa, người dùng chọn nghĩa của thẻ; chọn nhiều nghĩa thì tạo nhiều thẻ. AI không tự chốt một nghĩa trong số nhiều nghĩa để đưa thẻ vào lịch học.

Định nghĩa đơn ngữ: tuân thủ các ràng buộc ở Mục 3.2.

Phiên âm: ưu tiên dữ liệu có sẵn, không dùng AI làm nguồn chính vì mô hình nhỏ hay bịa phiên âm. Tiếng Anh tra IPA từ dữ liệu từ điển mở; tiếng Trung chuyển pinyin bằng thư viện; tiếng Nhật dùng bộ phân tích hình thái; tiếng Hàn chuyển tự theo quy tắc. Chỉ khi không tra được mới dùng AI, kèm nhãn "cần kiểm tra".

Âm Hán Việt: tra từ dữ liệu Hán Việt theo từng chữ.

Mẹo nhớ: AI gợi ý khi người dùng yêu cầu, hoặc khi từ bị đánh dấu dai dẳng.

Mỗi ai_job lưu phiên bản Từ/nghĩa và phiên bản từng trường khi xếp hàng. Chỉ tự điền trường còn trống và chưa bị người dùng sửa từ lúc tạo job. Trường đã sửa, kể cả xóa thành trống, không bị ghi đè; lưu kết quả thành đề xuất riêng. Nếu Từ/nghĩa đổi hoặc thẻ bị xóa thì không áp dụng kết quả cũ.

Nội dung AI có nhãn “AI” nhưng đã qua kiểm tra cấu trúc/ngữ cảnh có thể dùng trong game; riêng nghĩa phải được chọn và phiên âm dự phòng/không chắc chắn phải được xác nhận trước khi dùng để chấm. Nội dung người dùng tự sửa trở thành nguồn do người dùng quản lý; kiểm tra tính hợp lệ vẫn áp dụng.

Job có trạng thái chờ/đang chạy/thành công/thất bại/đã lỗi thời. Lỗi tạm thời tự thử lại tối đa 3 lần, lần lượt sau 5, 30 và 120 giây; sau đó hiện nút thử lại. Không tính thất bại AI thành lỗi học và không khóa chỉnh sửa thẻ. Không hiển thị kết quả chưa hoàn tất như trường hợp đã xác nhận.

### 11.3. Nhận giọng nói

Game Nói phát hành ở giai đoạn 3, chỉ bật sau kiểm thử cục bộ trên tổ hợp PWA/thiết bị/ngôn ngữ mục tiêu. Đội phát triển có thể đánh giá bộ nhận dạng của nền tảng hoặc mô hình nhỏ trên máy; không coi hỗ trợ của iOS/Android là bằng chứng PWA truy cập được. Khi không đáp ứng offline thì dùng game khác; tuyến nhận dạng server cần đặc tả và lựa chọn rõ ràng của người dùng, không tự bật.

## 12. Mô hình dữ liệu (tối thiểu)

| Bảng | Trường chính |
| --- | --- |
| language_profile | mã ngôn ngữ, loại/nguồn phiên âm, quy tắc nhập và chuẩn hóa có phiên bản, cách đếm từ/âm tiết, mặt chính/phụ, game hỗ trợ, quy tắc thanh điệu và dữ liệu nét |
| study_set (bộ học) | id, user_id, ngôn ngữ học/nghĩa, kiểu nghĩa, trình độ mặc định, dạng chữ, cấu hình game và chấm có phiên bản |
| custom_field | id, study_set_id, tên, kiểu dữ liệu |
| category | id, study_set_id, parent_id, tên, thứ tự, phiên bản, deleted_at |
| word | id, study_set_id, T, nghĩa cụ thể, loại từ, cách đọc, biến thể[], câu gốc, trường phụ JSON, learning_readiness, content_version, nguồn/trạng thái AI và revision từng trường, deleted_at |
| word_category | word_id, category_id, mã thao tác thêm/xóa liên kết; duy nhất theo cặp khi đang có hiệu lực |
| media | id, word_id, loại ảnh/audio, content_hash, storage_key, content_version, ngôn ngữ/giọng, dung lượng; trạng thái tải theo thiết bị |
| sentence_pool | id, word_id, text, gap_start, gap_end, target_form, accepted_answers[], accepted_readings[], trình độ, trạng thái, word_content_version; thống kê dùng suy ra từ sự kiện |
| review_state | word_id, phase, step, EF, interval_days, due_date/due_at, last_scheduled_review_at, schedule_revision, review_opportunity_id, algorithm/config_version; cờ sổ sai và thống kê là dữ liệu suy ra |
| review_log | event_id, user/device_id, session/question/opportunity_id, word_id, base_schedule_revision, mode, game/level/faces, câu và đáp án snapshot, kết quả cuối, grade_reason, had_error, hint_used, active_ms, latency_ms, recorded/received/effective_at, algorithm/config_version; chỉ ghi thêm |
| stroke_data | ký tự, ngôn ngữ/tự dạng, dữ liệu nét, số nét, nguồn và giấy phép, phiên bản |
| ai_job | id, loại, word_id, input_content_version, input_field_revisions, trạng thái, retry_count, kết quả/đề xuất, error_code, thời điểm; khóa chống việc trùng |
| question_attempt | attempt_id, question_id, attempt_no, input gốc/chuẩn hóa, transcript nếu có, loại lỗi kỹ thuật/học, ký tự/nét sai, hint_used, active_ms; không lưu audio thô mặc định |
| review_opportunity | id, word_id, base_schedule_revision, phase/step, lịch gốc, config_snapshot, sự kiện thành viên, kết quả hợp nhất và resulting_revision; một chuyển lịch/cơ hội |
| study_session | id, user/device_id, mode, phạm vi word_id đã khử trùng, game đã bật, hàng đợi, snapshot câu hiện tại, bước/lần thử đang dở, trạng thái, mốc lưu |
| word_error_state | word_id, in_error_book, lỗi trong đợt/tổng lỗi, persistent_flag, thời điểm lỗi cuối, minh chứng đúng sạch gồm game_id/time/event_id; tái tạo từ log |
| sentence_usage | event_id, sentence_id, question_id, user/device_id, thời điểm; chống ghi trùng và dùng để hợp nhất lịch sử sử dụng câu |
| sync_operation | event_id, entity/field, base_revision, payload hoặc tombstone, trạng thái gửi, server_revision; lịch sử giá trị xung đột |
| user_settings | user_id, múi giờ, giới hạn từ mới/ngày, cấu hình SRS/thời gian, nhắc lịch, thiết bị nhắc chính, phiên bản |
| device_capability | device_id, OS/browser/version, ngôn ngữ, PWA mode, TTS/ASR/pen/notification được kiểm thử, quyền và tài nguyên đã tải, checked_at |

Mỗi thực thể thuộc người dùng phải kiểm tra quyền trên server; ID do client tạo không thay thế kiểm tra quyền. review_state tách schedule_revision khỏi phiên bản thống kê sổ từ sai: một lần luyện tự do không được vô tình tạo cơ hội ôn mới.

Ràng buộc: event_id duy nhất; một kết quả cuối mỗi question_id; nhiều log có thể cùng opportunity nhưng chỉ một trạng thái hợp nhất; category không tạo vòng; câu có ít nhất một accepted_answer; tombstone không bị sửa cũ ghi đè. Ghi nhận kết quả phải nguyên tử với hàng đợi đồng bộ, và có thể phát lại log để dựng lại lịch/statistics.

Cột thời gian lưu UTC; due_date là ngày lịch của tài khoản, due_at là thời điểm cho bước trong ngày. Lưu phiên bản câu/chấm để sửa thẻ sau này không đổi nghĩa của log cũ. Các bảng suy ra có thể được tổ chức lại về vật lý nhưng phải giữ nguyên hành vi và các khóa chống trùng.

## 13. Kế thừa và khắc phục so với Lexilize

| Hạng mục | Lexilize | Bản mới |
| --- | --- | --- |
| Offline, TTS, nhập Excel, nhắc lịch | Có | Giữ lõi offline; âm thanh và nhắc lịch theo khả năng kiểm chứng ở Mục 2.5 |
| Học trên web | Chỉ có trình soạn thảo trên web | Học đầy đủ trên web (PWA) |
| Đồng bộ thiết bị | Chỉ bản Premium | Mặc định có |
| Số ngôn ngữ | Miễn phí 2 cặp; Premium tối đa 15 ngôn ngữ | Không giới hạn; có học đơn ngữ |
| Dịch tự động | Tự lấy DeepL key; miễn phí 3 từ/ngày | AI gợi ý nghĩa ngay trong app |
| Câu ví dụ | Gõ tay, cố định | AI tạo kho câu, thay đổi liên tục |
| Hình | Miễn phí 3 ảnh/ngày từ Internet | Không giới hạn; nhập từ ảnh nhúng trong Excel |
| Phiên âm | Gõ tay | Tự tra; là mặt thẻ dùng trong game |
| Thuật toán ôn | Leitner 7 hộp, khoảng cố định; chỉnh được ở Premium | SM-2 cải tiến theo từng thẻ/nghĩa; một cơ hội ôn, cấu hình có phiên bản; game khó cho khoảng ôn cao hơn |
| Game | 5 game, chủ yếu Từ ↔ Nghĩa | 7 game chung, game Viết chữ 3 cấp cho Trung/Nhật, 2 game riêng tiếng Trung; chọn được mặt thẻ |
| Category | Tối đa 5 tầng (Premium), mỗi từ 1 category | Không giới hạn tầng; mỗi từ nhiều category |
| Tiếng Trung, tiếng Nhật | Như ngôn ngữ khác | Pinyin, Hán Việt, furigana; thanh điệu, lượng từ; viết tay bằng bút theo nét (kanji, kana) |

## 14. Phân kỳ phát triển

| Giai đoạn | Nội dung |
| --- | --- |
| 1 (MVP) | PWA offline; tài khoản và đồng bộ theo Mục 2.4; hồ sơ ngôn ngữ, kiểm thử đầy đủ Anh–Việt/Anh–Anh; thẻ một nghĩa, category nhiều-nhiều; nhập/xuất Excel có ảnh; game 1–5 và Điền câu bằng câu gốc có đáp án; SRS theo Mục 9, sổ từ sai; lưu phiên dở, nhắc trong app và kiểm thử dự phòng âm thanh. |
| 2 | AI điền nội dung có bảo vệ sửa tay; tra phiên âm/Hán Việt; kho câu và đáp án riêng cho Điền câu; hồ sơ tiếng Trung, nhập pinyin rồi chọn toàn từ, Thanh điệu/Lượng từ. Chưa yêu cầu bước Viết chữ để tốt nghiệp; đánh dấu kỹ năng viết chưa triển khai. |
| 3 | Viết chữ 3 cấp cho Trung/Nhật với kanji và kana, bút/cảm ứng; hồ sơ Nhật đầy đủ; Nói trên tổ hợp thiết bị đã kiểm thử; thống kê nâng cao. Nâng cấp FSRS là hạng mục riêng, chỉ bật sau đặc tả chuyển đổi và kiểm chứng bằng log; không tự thay SRS của bản này. |

Tính năng chưa đến giai đoạn phát hành không xuất hiện như một bước bắt buộc hay một game có thể chọn. Cơ sở dữ liệu có thể chuẩn bị trường cho giai đoạn sau, nhưng tiêu chí hoàn thành từng giai đoạn chỉ gồm tính năng đang bật và các phương án dự phòng đã nêu.

Phạm vi màn hình theo giai đoạn và mức bao phủ của demo HTML: Mục 17.4. Demo không thay thế nghiệm thu.

## 15. Quyết định triển khai và điều kiện nghiệm thu kỹ thuật

Nền tảng đã chọn: PWA. Đội phát triển xác nhận ma trận OS/trình duyệt/ngôn ngữ hỗ trợ và giới hạn thực tế theo Mục 2.5; native chỉ xem xét bằng thay đổi phạm vi riêng, không chặn MVP.

Chọn backend, cơ sở dữ liệu cục bộ/server và cơ chế truyền đồng bộ. Phải chứng minh được nguyên tử, chống ghi trùng, xung đột từng trường và tái tính lịch ở Mục 2.4; không được thay hành vi nghiệp vụ bằng “bản cuối thắng” cho toàn bộ review_state.

Chọn cấu hình server AI, mô hình và chi phí vận hành trước giai đoạn 2. Thử bộ từ đa nghĩa/đơn ngữ và câu có biến thể để đánh giá chất lượng; không dùng mẫu trả về đúng cấu trúc làm bằng chứng duy nhất rằng nội dung đúng.

Xác nhận nguồn, phạm vi bao phủ, phiên bản và giấy phép cho từ điển/IPA, Hán Việt, pinyin/kana và dữ liệu nét. Lập danh sách ký tự/cách đọc không hỗ trợ; ứng dụng phải dùng trạng thái thiếu dữ liệu thay vì tự bịa giá trị để chấm.

Trước giai đoạn 3, thử TTS/ASR, đầu vào bút và quyền trên thiết bị thật. Game Nói chỉ phát hành cho tổ hợp đạt; phần còn lại dùng phương án dự phòng đã định. Lưu cấu hình/bằng chứng thử và mã lỗi để tái kiểm tra khi cập nhật nền tảng.

Ngưỡng thời gian, chuẩn hóa và lịch ôn đã có mặc định ở Mục 7.6, 8.2 và 9; không còn là câu hỏi nghiệp vụ chờ chọn. Ngưỡng hình học chấm nét cần hiệu chỉnh bằng bộ mẫu đúng/sai và lưu thành cấu hình có phiên bản trước khi phát hành Viết chữ.

## 16. Luồng sử dụng và tiêu chí nghiệm thu

### 16.1. Luồng chính

Lần đầu: đăng nhập khi có mạng → tạo/chọn bộ học → chọn múi giờ và trình độ → nhập từ → xác nhận nghĩa → tải tài nguyên cần thiết. Màn hình bộ học hiển thị các nhóm Đến hạn, Đang học, Từ mới, Chờ bổ sung và Sổ từ sai; không gộp thẻ thiếu dữ liệu vào số câu có thể học ngay.

Buổi học: chọn bộ học/category → chọn Ôn theo lịch, Luyện tự do hoặc Ôn sổ từ sai → kiểm tra số thẻ/game hợp lệ → bắt đầu. Ôn theo lịch lấy thẻ đến hạn sớm trước, đồng hạng dùng word_id để ổn định. Sau khi hết thẻ đến hạn trong phạm vi, đề nghị Học mới theo chỉ tiêu còn lại. Các bước đang chờ 1/10 phút có đếm ngược và có thể luyện xen giữa.

Màn hình kết quả cuối câu cho biết đáp án, lý do đúng/sai, mức Quên/Khó/Tốt/Dễ và “Có cập nhật lịch” hoặc “Chỉ luyện tập”. Cuối buổi tách số thẻ đã ôn, số thẻ mới bắt đầu/tốt nghiệp, câu luyện thêm, thẻ vào/ra sổ sai và dữ liệu còn chờ đồng bộ. Không gọi tất cả thao tác là số từ đã thuộc.

### 16.2. Tạm dừng, tải lại và đổi thiết bị

Lưu hàng đợi, snapshot câu, nội dung đã nhập, số lần thử, gợi ý, kết quả đã nộp và bước học sau mỗi hành động có ý nghĩa. Tải lại/đóng app rồi mở trên cùng thiết bị có nút “Tiếp tục buổi học”; không đặt lại số lần thử hoặc biến một câu đã sai thành đúng sạch.

Thoát trước khi nộp đáp án không tự đánh Quên. Lần thử sai đã ghi phải được giữ trong cơ hội ôn để tiếp tục hoặc kết luận, không bị xóa khi hủy giao diện phiên. Khi câu đã kết luận, không chấm lại sau khi phục hồi; bắt đầu ở câu/bước tiếp theo chưa hoàn tất. Thời gian chờ dùng mốc due_at đã lưu, không tính lại từ lúc mở app.

MVP lưu vị trí câu đang dở theo thiết bị; tiến độ đã kết luận và lịch hợp nhất đồng bộ toàn tài khoản. Sang máy khác bắt đầu từ lịch mới nhất đã đồng bộ, không tự tiếp tục nét viết/bản gõ đang dở trên máy trước. Xung đột học offline theo Mục 2.4; không cộng đôi một cơ hội ôn.

Cập nhật PWA, thay cấu hình hoặc AI trả kết quả không được thay đề giữa câu. Bản nâng cấp phải di chuyển dữ liệu cục bộ trước khi dùng; nếu chưa thành công thì giữ bản/dữ liệu cũ, không xóa log chờ gửi. Đăng xuất khi còn dữ liệu chưa đồng bộ phải cảnh báo và cho đồng bộ trước; không tự bỏ dữ liệu âm thầm.

### 16.3. Nhắc lịch

Mặc định tắt. Khi người dùng bật, giờ gợi ý là 20:00 theo múi giờ tài khoản, có thể chỉnh; chỉ xin quyền sau thao tác bật. Nhắc tối đa một lần/ngày khi có thẻ đến hạn hoặc thẻ đang học cần tiếp tục. Không nhắc chỉ vì có thẻ chờ bổ sung; không nhắc khi đã hết công việc học của ngày.

Người dùng chọn một thiết bị nhận nhắc chính; khóa chống gửi trùng theo user_id và ngày, lưu riêng phiên bản lịch nhắc. Đổi giờ hoặc đổi thiết bị trong ngày không cấp thêm lượt nhắc nếu đã gửi. Server chỉ gửi thông báo nền đến thiết bị chính đang có hiệu lực tại lúc gửi, không đặt thêm lịch thông báo nền độc lập trên các máy. Thiết bị khác vẫn hiện nhắc trong app. Khi không có cơ chế thông báo nền đã kiểm chứng/quyền bị từ chối, hiển thị nhắc trong app ở lần mở tiếp theo, không dồn nhiều thông báo của các ngày bỏ lỡ.

### 16.4. Bộ tình huống kiểm thử chấp nhận

Mỗi ca phải kiểm tra cả giao diện, dữ liệu lưu và kết quả sau tải lại/đồng bộ khi liên quan. Dữ liệu giả lập phải dùng thời gian cố định, cấu hình mặc định và đúng ngôn ngữ của ca thử; không chỉ kiểm tra rằng nút bấm hoạt động.

| Mã | Tình huống | Kết quả phải đạt |
| --- | --- | --- |
| AT-01 | Thêm offline thẻ chỉ có apple. | Lưu được; Chờ bổ sung; không có ngày ôn, không tiêu hao chỉ tiêu học mới. |
| AT-02 | Tạo bank/ngân hàng và bank/bờ sông. | Hai word_id, hai lịch; không tự gộp vì cùng cách viết. |
| AT-03 | Nhập lại cùng word_id với category/ảnh mới. | Cập nhật nội dung theo xem trước; giữ lịch/log; không nhân bản thẻ, ảnh hoặc dòng đã nhập. |
| AT-04 | Category có 3 thẻ; thiếu nhiễu trong toàn bộ bộ học. | Trắc nghiệm có 3 phương án khi đủ hợp lệ; Ghép cặp 3 cặp. Còn 1 thẻ: Ghép cặp không bật. |
| AT-05 | Hai thẻ có nghĩa/phiên âm không phân biệt được trong câu chọn/ghép. | Không sinh câu có nhiều đáp án đúng; đổi tổ hợp hoặc báo thiếu điều kiện. |
| AT-06 | Yesterday, I ___ to school.; khóa đáp án went. | went đúng; go/goes/gone sai dù là biến thể trong thẻ. |
| AT-07 | Gõ sai một ký tự rồi sửa đúng. | Kết quả Khó; một lỗi trong sổ; tối đa một lần đổi lịch theo cơ hội ôn. |
| AT-08 | Nói: mic lỗi, sau đó có tiếng nhận dạng sai, rồi đúng. | Mic lỗi không tiêu hao thử; đúng lần nhận dạng hợp lệ thứ hai là Khó và vào sổ sai. |
| AT-09 | Viết từ nhiều chữ, sửa nhiều nét rồi hoàn thành. | Cả từ Khó; chỉ một lỗi/câu; có log các chữ/nét sai. Không hoàn thành một chữ thì Quên. |
| AT-10 | Trắc nghiệm đúng ở cơ hội đến hạn; gõ sai khi luyện thêm. | Lịch chỉ đổi bởi câu Trắc nghiệm; EF không bị giảm do game dễ; luyện sai chỉ cập nhật sổ. |
| AT-11 | Luyện một từ chưa đến hạn 20 lần. | Không đổi EF/ngày đến hạn; vẫn ghi các câu luyện và sổ sai đúng quy tắc. |
| AT-12 | I=4; EF=2,5; D=4; đạt Dễ. | I mới=13; EF mới=2,65; dùng EF cũ trước khi tăng. |
| AT-13 | I=4; EF=2,5; D=7; đạt Tốt. | I mới=18 theo làm tròn 0,5 lên; ngày đến hạn tính từ ngày trả lời. |
| AT-14 | Quên ở lịch ngày; sai thêm trong học lại. | Giảm EF một lần, không lặp giảm mỗi bước; thử lại sau 10 phút; qua được về 1 ngày. |
| AT-15 | Học mới, sai ở bước Gõ từ rồi đóng app. | Giữ bước Gõ từ và mốc +10 phút; không quay đầu, không tốt nghiệp, không trừ thêm chỉ tiêu hôm sau. |
| AT-16 | Thẻ ở sổ; đúng 2 game khác nhau trong 1 phút, rồi đúng sạch game nhớ lại sau ≥10 phút. | Chưa ra sổ ở phút đầu; ra sổ khi đủ cặp minh chứng và thời gian; không tự đổi lịch. |
| AT-17 | Thẻ có 6 câu có lỗi trong một đợt; sau đó ra sổ. | Bật rồi xóa cờ dai dẳng; đợt lỗi về 0, tổng lỗi lịch sử còn nguyên. |
| AT-18 | Hai máy cùng cơ hội ôn, một Tốt một Quên; gửi lặp/đảo thứ tự log với cùng effective_at đã chốt. | Một chuyển lịch Quên; EF trừ một lần; không nhân đôi lỗi; tất cả log còn để tra. |
| AT-19 | Log muộn thay kết quả cha của các lượt học offline tiếp theo. | Tính lại nhánh lịch; lượt có base_revision không còn hợp lệ giữ làm luyện; UI thông báo lịch đã điều chỉnh. |
| AT-20 | Máy A sửa nghĩa, B sửa ảnh; tiếp đó sửa cùng một trường. | Giữ cả nghĩa/ảnh; cùng trường dùng server_revision và lưu bản xung đột. Không mất toàn bộ thẻ. |
| AT-21 | Xóa thẻ rồi nhận sửa cũ/kết quả AI/log cũ. | Không hồi sinh thẻ; không đưa lại vào hàng ôn nếu chưa có thao tác khôi phục. |
| AT-22 | AI tạo job, người dùng sửa hoặc xóa trắng trường trước khi job xong. | Không ghi đè; giữ kết quả như đề xuất. Nghĩa chưa chọn không tự thành thẻ học được. |
| AT-23 | Offline dùng hết kho câu; hoặc không có câu hợp lệ. | Lặp câu cũ theo quy tắc nếu còn; nếu không có thì tắt Điền câu cho thẻ, không tạo lỗi học. |
| AT-24 | PWA không có TTS/ASR offline cho ngôn ngữ. | Không hiện khả năng giả; tắt game phụ thuộc, đưa game thay thế theo quy tắc; không gửi âm thanh ra cloud tự động. |
| AT-25 | Gõ xue2 sheng1; Nhật 食べる/ありがとう/コーヒー. | Theo đúng toàn từ, cách đọc, bước chọn/bỏ chọn ở Mục 8.2; không buộc từ chỉ có kana chọn kanji. |
| AT-26 | Tiếng Trung ở giai đoạn 2; sau nâng cấp giai đoạn 3. | Giai đoạn 2 tốt nghiệp không cần Viết chữ; nâng cấp không reset thẻ cũ; thiếu nét không làm hỏng game lõi. |
| AT-27 | Một thẻ thuộc hai nhánh con; kéo từ sang nhánh mới. | Thống kê cha khử trùng word_id; chuyển liên kết nguồn, giữ các liên kết khác; lịch không đổi. |
| AT-28 | Nộp đáp án rồi app tắt; gửi lại sau mở. | Còn kết quả, không mất log và không tạo kết quả/lịch thứ hai; câu tiếp theo đúng vị trí. |
| AT-29 | Nghe TTS dài/chờ ASR; hoặc tạm dừng giữa câu. | Độ trễ không cộng vào thời gian phản ứng; tạm dừng không được Dễ, không tự bị Quên. |
| AT-30 | Ôn phạm vi A còn thẻ chờ bổ sung; phạm vi B còn từ đến hạn. | Chỉ phần đến hạn khả dụng của A chặn học mới A; vẫn nhập từ được; B không khóa A. |
| AT-31 | Bật nhắc trên một máy, máy khác cũng đồng bộ; từ chối quyền. | Tối đa một thông báo/ngày ở máy chính khi hỗ trợ; từ chối quyền chuyển nhắc trong app. |
| AT-32 | Một tài khoản có hai máy học mới offline vượt tổng 15 thẻ. | Không xóa/hoàn tác kết quả; sau đồng bộ khóa bắt đầu thẻ mới đến ngày sau và hiển thị đúng tổng. |

### 16.5. Điều kiện bàn giao mỗi giai đoạn

Phải có dữ liệu mẫu, kiểm thử tự động cho quy tắc lịch/chấm/đồng bộ và kiểm thử giao diện trên ma trận thiết bị đã công bố. Các ca thuộc tính năng đang phát hành phải đạt; các ca giai đoạn sau ghi rõ chưa áp dụng. Không công bố game hỗ trợ offline nếu chỉ chạy được khi còn mạng.

Bàn giao kèm bảng tính năng bật/tắt, nguồn dữ liệu và giấy phép, cấu hình mặc định có phiên bản, hướng dẫn sao lưu/khôi phục server, danh sách giới hạn nền tảng và cách dùng phương án dự phòng. Lỗi làm mất log, nhân đôi lịch, ghi đè sửa tay hoặc chấm nhiều đáp án hợp lý thành sai là lỗi chặn phát hành.

Bổ sung nghiệm thu UI/UX theo Mục 17.13, cùng các ca nghiệp vụ AT-01–AT-32. Tham chiếu giao diện tại Mục 17.15.

## 17. Đặc tả UI/UX

Phiên bản 0.5 bổ sung yêu cầu giao diện cho các chức năng ở Mục 1–16. Không thay đổi thuật toán ôn, cách chấm, đơn vị thẻ, quy tắc đồng bộ hoặc phân kỳ phát hành. Mỗi màn hình phải đọc kèm mục nghiệp vụ liên quan.

### 17.1. Cơ sở thiết kế và phạm vi

| Tham chiếu | Cách sử dụng |
| --- | --- |
| Đặc tả v0.4 | Giữ nguyên các quy tắc nghiệp vụ, các ca AT-01–AT-32 và điều kiện phát hành. |
| HTML tương tác | Tham chiếu phong cách đã được người dùng đánh giá khá ổn: nền sáng, ít màu, hành động rõ, màn học tập trung. Không lấy mã mô phỏng làm thuật toán thật. |
| Ảnh ghép demo ban đầu | Chỉ tham khảo thị giác. Không sao chép lỗi ghép cặp, nhãn “Phát âm tốt”, hoặc biểu đồ gộp Mới/Quên/Khó/Tốt/Dễ thành trình độ. |

VocaLearn là tên hiển thị trong demo, chưa là quyết định thương hiệu bắt buộc. Các kích thước, bố cục và mẫu câu chữ trong Mục 17 là quy ước UI bổ sung của v0.5; không đồng nghĩa đã triển khai hoặc đã đạt chuẩn tiếp cận.

MVP có 6 game: Lật thẻ, Trắc nghiệm, Ghép cặp, Gõ từ, Chính tả và Điền câu bằng câu gốc. AI/tiếng Trung thuộc giai đoạn 2; Nói, Viết chữ, hồ sơ Nhật đầy đủ và thống kê nâng cao thuộc giai đoạn 3, theo Mục 14.

### 17.2. Quy chuẩn thị giác và thành phần dùng chung

Giữ giao diện sáng, nền trung tính, viền nhẹ, đổ bóng tiết chế. Màu xanh dành cho hành động chính và trạng thái đang chọn, không tô màu mạnh cho mọi khối. Không thêm biểu đồ trang trí vào luồng học chính.

| Thành phần | Quy ước v0.5 |
| --- | --- |
| Màu nền/chữ | Nền #F5F7FB; bề mặt #FFFFFF; chữ chính #18243A; chữ phụ #58677E. |
| Màu chức năng | Chính #2457DB; nền chọn #EDF2FF; đúng #146442; sai #AC2939. Trạng thái phải có chữ/biểu tượng, không chỉ có màu. |
| Viền | Viền phân khối #DCE3ED. Viền nhận diện ô nhập/lựa chọn dùng màu đậm hơn, khởi đầu #77859A; đo lại tương phản trên nền thực tế. |
| Chữ giao diện | Phông hệ thống hỗ trợ Unicode; nội dung 16 CSS px, nhãn phụ 13–14 px, tiêu đề màn 28–32 px, câu hỏi 20–24 px, từ chính 32–40 px. Câu dài xuống dòng, không thu nhỏ để nhét vừa. |
| Khoảng cách/bo góc | Thang khoảng cách 4/8/12/16/24/32 px. Nút và ô nhập bo 12 px; khối nội dung 16–22 px. Lề nội dung 24–36 px trên màn lớn, 16–18 px trên điện thoại. |
| Nút và biểu tượng | Vùng bấm tối thiểu 44 × 44 px theo quy ước sản phẩm; nút chính trên điện thoại cao 48 px. Icon 20–24 px nằm trong vùng bấm, có tên truy cập nếu không kèm chữ. |
| Trạng thái thành phần | Nút: mặc định, hover, focus, đang xử lý, không khả dụng. Ô nhập: trống, có giá trị, focus, lỗi, chỉ đọc. Không đổi kích thước khi hiện spinner. |
| Chuyển động | Chỉ dùng cho phản hồi/lật thẻ; tắt hoặc giảm khi prefers-reduced-motion. Không bắt chờ hiệu ứng mới được học tiếp. |

Các thông số trên là kích thước của web app, không phải cỡ chữ của tài liệu Word. Độ tương phản và vùng bấm phải kiểm tra trên bản chạy, không suy ra từ ảnh.

### 17.3. Kiến trúc điều hướng và bố cục

Giữ ba điểm vào chính của HTML: Hôm nay, Kho từ, Sổ từ sai. Sổ từ sai là góc nhìn của cùng kho thẻ, không là bản sao dữ liệu. Chủ đề nằm trong Kho từ và bộ chọn phạm vi; Cài đặt nằm trong menu tài khoản. Nhắc lịch không cần tab riêng.

Thanh trên hiển thị tên bộ học, cặp ngôn ngữ, trạng thái lưu/đồng bộ và tài khoản. Bộ chọn phạm vi cho chọn nhiều chủ đề, gồm chủ đề con và Chưa phân loại. Giữ bộ lọc khi mở chi tiết rồi quay lại; đổi bộ học phải kiểm tra lại phạm vi hợp lệ.

Desktop dùng thanh bên khoảng 210 px, nội dung chính rộng tối đa 1100 px. Màn học ẩn điều hướng phụ, khung giữa tối đa 850 px, chỉ giữ ngữ cảnh, tiến độ, trạng thái lưu và Tạm dừng. Nút Back của trình duyệt không được làm mất lần thử hoặc nộp lại câu đã chấm.

| Luồng | Đường đi chính |
| --- | --- |
| Lần đầu | Đăng nhập → tạo/chọn bộ học → nhập thẻ/xác nhận nghĩa → tải tài nguyên → Hôm nay. |
| Ôn hằng ngày | Hôm nay → thiết lập/kiểm tra điều kiện → màn học → phản hồi → kết quả buổi → học mới khi đủ điều kiện. |
| Chuẩn bị nội dung | Kho từ → thêm/sửa thẻ hoặc nhập Excel → xem trước/xử lý trùng → lưu → trạng thái sẵn sàng hoặc chờ bổ sung. |

### 17.4. Danh mục màn hình và mức bao phủ

Mã UI nhận diện một màn hình hoặc vùng chức năng; không bắt buộc mỗi mã là một trang riêng. “Có demo” chỉ xác nhận có mã minh họa trong HTML hiện tại, không xác nhận hoàn thành MVP.

| Mã / màn hình | Giai đoạn | HTML hiện tại |
| --- | --- | --- |
| UI-01 Đăng nhập, khởi tạo | MVP | Chưa có. |
| UI-02 Chọn/tạo bộ học | MVP | Chỉ có nhãn Anh → Việt. |
| UI-03 Hôm nay | MVP | Có demo; số liệu mô phỏng. |
| UI-04 Thiết lập buổi học | MVP | Mới chọn một chủ đề và 2 game/trộn. |
| UI-05 Màn học tập trung | MVP | Gõ từ, Trắc nghiệm; gợi ý, phản hồi, tạm dừng. |
| UI-06 Học mới/học lại | MVP | Chưa có chuỗi và thời gian chờ thật. |
| UI-07 Kết quả buổi | MVP | Có tổng kết mô phỏng. |
| UI-08 Kho từ | MVP | Có tìm kiếm và bộ lọc cơ bản. |
| UI-09 Xem/soạn thẻ | MVP | Thêm từ, xem chi tiết, bổ sung nghĩa; chưa đủ trường. |
| UI-10 Cây chủ đề | MVP | Danh sách phẳng, chưa có nhiều-nhiều. |
| UI-11 Nhập/xuất Excel | MVP | Chưa có. |
| UI-12 Sổ từ sai | MVP | Có bộ lọc và luyện; chưa có minh chứng ra sổ. |
| UI-13 Cài đặt/nhắc lịch | MVP | Chưa có. |
| UI-14 Tài nguyên/đồng bộ | MVP | Chỉ có chú thích demo, không kết nối máy chủ. |
| UI-15 Nội dung AI/kho câu | G2 | Chưa có. |
| UI-16 Thống kê nâng cao | G3 | Chưa có; không đưa biểu đồ demo cũ vào MVP. |

Bản HTML nhiều màn hình mới tích hợp 2/6 game MVP. Lật thẻ ở mẫu HTML đầu là bản thử riêng. Lật thẻ, Ghép cặp, Chính tả, Điền câu phải được tích hợp; dữ liệu, lịch và khôi phục sau tải lại vẫn cần triển khai.

### 17.5. Hôm nay và thiết lập buổi học

#### UI-03. Hôm nay

Mục đích và bố cục. Giúp người học biết việc cần làm tiếp theo. Thứ tự: bộ học/phạm vi → buổi đang dở (nếu có) → khối hành động chính → nhóm thẻ → Luyện tự do/Chủ đề. Nút chính là Tiếp tục buổi học hoặc Bắt đầu ôn tập; Học từ mới chỉ thành hành động chính khi đủ điều kiện.

Hiển thị Đến hạn, Đang học, Từ mới, Chờ bổ sung và Sổ từ sai; có thể gom nhóm phụ thành bộ lọc thay vì 5 thẻ lớn. Tách số thẻ đến hạn học được và số thẻ đến hạn bị chặn bởi thiếu dữ liệu. Nhóm sổ sai/đến hạn có thể giao nhau, không cộng các nhóm làm tổng kho.

Trạng thái và nghiệm thu. Kho rỗng: Thêm từ/Nhập Excel. Chỉ có thẻ thiếu: Bổ sung nội dung. Đã ôn hết: đề nghị học mới theo chỉ tiêu còn lại hoặc luyện tự do. Còn bước chờ: hiện giờ tiếp tục, không báo đã hoàn thành tất cả. Chặn học mới phải nêu lý do; vẫn cho nhập/lưu từ.

#### UI-04. Thiết lập và kiểm tra điều kiện

Mở bảng thiết lập từ Hôm nay, Luyện tự do hoặc Sổ từ sai. Gồm bộ học, cây phạm vi, chế độ, game/cấp, mặt hỏi và mặt đáp. Các mặt dùng tên Từ, Nghĩa, Phiên âm, Hình, Câu, Âm thanh, Hán Việt thay cho mã T/N/P trước người dùng. Mặt nâng cao mở theo yêu cầu, không tràn ra trang chủ.

Chỉ cho chọn tổ hợp đúng ma trận Mục 7.2–7.3. Trộn có danh sách game đã bật; ôn theo lịch có một game chấm chính cho mỗi cơ hội. Thay thiết lập phải cập nhật số thẻ hợp lệ. Có dòng “8/12 thẻ dùng được; 4 thẻ thiếu mặt hỏi”, liên kết xem thẻ thiếu và nút bắt đầu với phần hợp lệ.

Nghiệm thu. Không có thẻ hợp lệ: nêu lý do và cho đổi game/bổ sung, không tự chọn game khác khi người dùng chọn một game cụ thể. Bắt đầu phải khóa phạm vi và snapshot câu; không đổi đề giữa lượt. Thiết lập được nhớ theo bộ học nhưng phải kiểm tra lại tài nguyên trước buổi mới.

### 17.6. Khung học và giao diện 6 game MVP

UI-05 dùng cùng cấu trúc cho mọi game: chế độ + tên game → tiến độ → mặt hỏi → thao tác trả lời → phản hồi → Câu tiếp theo. Không hiện mặt đáp trước khi người học trả lời; cả nhãn ảnh, tên audio và nội dung cho trình đọc màn hình cũng không được vô tình lộ từ đích.

Trạng thái chung: đang chuẩn bị → sẵn sàng → đang nhập/chọn → đang ghi kết quả → phản hồi. Nhánh phụ: được thử lại, tạm dừng, thiếu tài nguyên, lỗi kỹ thuật. Nộp lặp không tạo kết quả mới. Lỗi lưu cục bộ phải giữ đáp án và cho thử lại cùng mã sự kiện, không báo đã lưu khi chưa lưu được.

| Game | Trước trả lời / thao tác | Sau trả lời / điểm cần giữ |
| --- | --- | --- |
| G-01 Lật thẻ | Mặt hỏi đã chọn; nút Xem đáp án. Sau lật hiện các mặt còn lại và trường phụ. | Lượt ôn tự chấm có Nhớ/Quên, tối đa Khó. Bước làm quen học mới chỉ Tiếp tục, không chấm sai. Xem lại không đổi kết quả. |
| G-02 Trắc nghiệm | Một mặt hỏi; 2–4 đáp án hợp lệ. Chọn một ô là nộp; hướng dẫn ghi rõ. Desktop 2 cột, mobile 1 cột; định nghĩa dài phải đọc hết được. | Khóa lựa chọn sau nộp; phân biệt đáp án đúng và ô đã chọn sai bằng chữ/icon. Đúng sạch nhận Khó do giới hạn game, không giảm EF vì đúng game dễ. |
| G-03 Ghép cặp | Hai nhóm mặt thẻ, mặc định 6 cặp, giảm theo dữ liệu. Chạm ô hỏi rồi ô đáp; có thể hỗ trợ kéo nối nhưng không bắt buộc. | Hiện Đang chọn/Đã ghép/Chưa đúng. Cặp đúng giữ vị trí, không xáo lại sau mỗi lần chọn. Sai gắn với thẻ hỏi; mỗi thẻ chỉ một kết quả cuối. |
| G-04 Gõ từ | Nhìn nghĩa/hình/phiên âm phù hợp rồi gõ từ. Ô nhập có nhãn, nút Kiểm tra, Gợi ý và Không biết. Không gọi là “Nghe và gõ”. | Trống: nhắc nhập, chưa tính sai. Sai 1 ký tự: chỉ vị trí và cho sửa 1 lần theo Mục 7.6. Không tự coi chuỗi gần đúng là đúng. |
| G-05 Chính tả | Nghe audio rồi xếp chữ hoặc gõ. Nút Phát, Nghe lại, Nghe chậm. Xếp chữ hỗ trợ chạm/chọn, bỏ chữ và sửa thứ tự không cần kéo. | Không lộ Từ trước khi nộp. Audio đầu chưa phát xong không tính thời gian nhớ lại. Nghe lại/chậm là trợ giúp. Thiếu audio: xử lý theo Mục 2.5/9.4, không chấm Quên. |
| G-06 Điền câu | Câu có một ô khuyết và chế độ chọn/gõ. Mặt gợi ý bật theo cấu hình. MVP dùng câu gốc đã xác nhận đáp án. | Chấm theo accepted_answers của chính câu. Sau nộp hiện câu hoàn chỉnh, dạng từ đúng và nút báo lỗi câu. Chưa có câu hợp lệ thì báo thiếu, không gọi AI khi đang chơi. |

Sau kết quả cuối, hiện đáp án, lý do đúng/sai, mức Quên/Khó/Tốt/Dễ, lý do giới hạn điểm và tác động lịch. Ví dụ “Đúng sau khi sửa · Khó · Đã lưu trên thiết bị”. Luyện tự do phải ghi “Chỉ luyện tập · không đổi lịch”. Ôn offline có thể hiện “Lịch tạm tính · chờ đồng bộ”; không coi lưu cục bộ là đã đồng bộ.

Điều hướng và nghiệm thu. Tạm dừng giữ nguyên nội dung đã nhập, số lần thử, gợi ý và kết quả. Kết thúc sớm chỉ kết thúc phiên, không xóa lịch sử. “Không biết” là một câu Quên; Back/thoát trước khi nộp không tự chấm sai. Không tự chuyển câu trước khi người học đọc phản hồi.

### 17.7. Học mới, sổ từ sai và kết quả

#### UI-06. Học mới và học lại

Dùng chung khung học, thêm tên chế độ, bước hiện tại, các bước đã qua và thời điểm tiếp tục. Không dùng “Câu 3/10” để ngầm chỉ 3 từ đã thuộc khi cùng một từ còn nhiều bước. Chỉ tiêu thẻ mới hiển thị ở cấp tài khoản, phạm vi ôn hiển thị riêng.

MVP: Lật thẻ làm quen → chờ ít nhất 1 phút → Trắc nghiệm → chờ ít nhất 10 phút → Chính tả xếp chữ → chờ ít nhất 10 phút → Gõ từ. Mọi thay thế khi thiếu nhiễu/audio theo Mục 9.4 và phải nêu lý do; không bỏ bước Gõ từ bắt buộc.

Trạng thái và nghiệm thu. Trong lúc chờ, hiện “Tiếp tục lúc 10:30 · còn 6 phút” và cho học thẻ khác/luyện xen giữa. Luyện xen giữa không rút ngắn due_at, không bắt kết thúc chuỗi đang dở. Tải lại không đếm chờ lại từ đầu. Sai thì giữ bước và hẹn lại; Quên khi ôn theo ngày chuyển sang Học lại, không báo đã hoàn thành học.

#### UI-12. Sổ từ sai

Dùng lại danh sách Kho từ với bộ lọc sổ sai. Mỗi thẻ có lỗi gần nhất, số câu có lỗi trong đợt, nhãn Dai dẳng khi đủ điều kiện và tiến độ minh chứng. Chi tiết cho biết game/thời điểm của minh chứng đã có; không gọi mọi lần đúng là 1/2.

Nút chính Luyện từ sai mặc định không đổi lịch. Chỉ thẻ đến hạn mới có chuyển sang Ôn theo lịch. Hiển thị điều kiện còn thiếu: game khác, game nhớ lại, hoặc cách nhau ít nhất 10 phút. Lỗi/gợi ý cập nhật minh chứng đúng Mục 10. Ra khỏi sổ không tự đổi ngày ôn; không có nút đánh dấu đã nhớ để bỏ qua điều kiện.

#### UI-07. Kết quả buổi học

Phân biệt hoàn thành hàng đợi và kết thúc sớm. Tóm tắt số thẻ đã ôn, thẻ mới bắt đầu/tốt nghiệp, câu luyện thêm, thẻ vào/ra sổ sai, bước còn chờ và số kết quả chưa đồng bộ. Chỉ hiện những chỉ số có ý nghĩa với chế độ vừa học; không đổng nhất đã trả lời với đã thuộc.

Có Về Hôm nay, Mở sổ từ sai và hành động tiếp theo theo điều kiện thật. Khi còn bước trong ngày, hiện giờ tiếp tục thay vì tuyên bố học xong hoàn toàn. Câu đã nộp được lưu ngay, không chờ đến màn tổng kết mới lưu.

### 17.8. Kho từ, soạn thẻ, chủ đề và Excel

#### UI-08. Kho từ

Mục đích là tìm, phân loại và mở thẻ. Thanh công cụ gồm tìm kiếm, phạm vi, bộ lọc, Thêm từ và Nhập/xuất. Desktop hiển thị Từ, Nghĩa, Chủ đề, Trạng thái học, Ngày đến hạn; thông tin khác mở trong chi tiết. Mobile dùng danh sách thẻ hai/tối đa vài dòng, không ép bảng nhiều cột vào màn nhỏ.

Tìm theo từ, nghĩa, chủ đề; các bộ lọc kết hợp với phạm vi đã chọn. Đến hạn và Sổ từ sai là cờ/bộ lọc riêng. Trạng thái học không dùng Quên/Khó/Tốt/Dễ thay cho giai đoạn; nếu hiện những mức này, nhãn phải là Kết quả gần nhất. Trình độ chỉ dùng cho CEFR/HSK/JLPT khi có dữ liệu.

Trạng thái và nghiệm thu. Kho rỗng có lối thêm/nhập; không có kết quả lọc có Xóa bộ lọc. Phân biệt đang tải với danh sách rỗng. Chọn nhiều thẻ phải hiện số lượng và nêu phạm vi khi chuyển chủ đề/xóa/xuất. Hủy chọn không mất bộ lọc; quay lại từ chi tiết giữ vị trí danh sách.

#### UI-09. Chi tiết, thêm và sửa thẻ

Desktop dùng ngăn chi tiết hoặc hộp thoại; mobile dùng trang/ngăn toàn màn hình. Nhóm cơ bản hiện Từ, Nghĩa, Loại từ, Chủ đề, trạng thái sẵn sàng. Phiên âm, Hình, Câu và trường phụ được gom nhóm có thể mở rộng. Hỗ trợ trường tự tạo theo bộ học; không làm mất trường bị thu gọn khi lưu.

Chỉ Từ bắt buộc để lưu. Sau lưu, báo đã lưu và sẵn sàng/chờ bổ sung; chỉ rõ mặt hoặc tài nguyên còn thiếu. Thêm hình bằng chọn/chụp/dán, có xem trước và gỡ bỏ. Nhập câu gốc cho Điền câu phải chọn đoạn khuyết, xác nhận đáp án được chấp nhận và xem thử câu hỏi, không tự lấy mọi biến thể.

Trạng thái và nghiệm thu. Lỗi hiện sát trường và giữ giá trị đã nhập. Rời form chưa lưu phải cho tiếp tục sửa hoặc xác nhận bỏ thay đổi. Đổi từ/nghĩa theo Mục 4.3 phải hỏi Tạo thẻ mới hoặc Thay nội dung và đặt lại tiến độ. Thao tác xóa có xác nhận, chỉ rõ thẻ bị tác động; khôi phục là hành động riêng, không do đồng bộ cũ.

#### UI-10. Cây chủ đề

Có mở/đóng nhánh, thêm, đổi tên, đổi cha/thứ tự và xóa. Thao tác kéo-thả luôn có lệnh tương đương bằng nút/menu. Nhãn Chuyển khỏi chủ đề này phải phân biệt với Thêm vào chủ đề; nêu chủ đề nguồn và đích. Xóa chủ đề không xóa thẻ. Nút cha thống kê theo word_id duy nhất, luôn có Chưa phân loại.

Nghiệm thu bằng cây sâu, tên dài và thẻ thuộc nhiều nhánh: không cắt mất tên quan trọng, có đường dẫn cha, không cho tạo vòng lặp. Chọn nhiều nhánh vẫn tính thẻ một lần và giữ nguyên lịch ôn.

#### UI-11. Nhập và xuất Excel

Luồng nhập: chọn file/bộ học → ghép cột → xem trước và xử lý trùng → xác nhận → kết quả. Hiện mẫu dữ liệu và ảnh nhúng, dòng hợp lệ, thiếu Từ, cùng cách viết khác nghĩa, cần đối chiếu và lỗi ảnh. Bộ đếm dòng lỗi là liên kết để lọc đúng nhóm.

Khi gộp, hiện nội dung hiện có và nội dung nhập theo từng trường; mặc định chỉ điền trống. Người dùng chọn gộp, bỏ qua hoặc thẻ riêng theo Mục 6.3. Lỗi ảnh cần xác nhận trước khi nhập chỉ phần chữ. Có tiến độ, báo cáo thêm mới/cập nhật/bỏ qua/lỗi, và Thử lại phần lỗi với cùng import_id; không nhập lặp dòng thành công.

Xuất có phạm vi và số thẻ trước khi tạo file; giữ cấu trúc, ảnh và word_id. Nhãn ghi “Xuất nội dung thẻ”, không ghi “Sao lưu toàn bộ” vì không gồm lịch/log. Màn ghép cột và đối chiếu dùng được trên mobile, vùng bảng rộng cuộn riêng nếu cần.

### 17.9. Khởi tạo, cài đặt và trạng thái hệ thống

#### UI-01 và UI-02. Tài khoản, bộ học

Đăng nhập lần đầu cần mạng; giao diện theo phương thức xác thực được chọn ở Mục 15, không mặc định thêm nhà cung cấp hoặc quy trình mật khẩu chưa được chọn. Cần các trạng thái đang xác thực, thất bại, mất mạng và thử lại. Không xin quyền mic/thông báo ngay khi mở app.

Tạo bộ học gồm tên, ngôn ngữ học, ngôn ngữ nghĩa, song ngữ/đơn ngữ, trình độ mặc định; múi giờ thuộc tài khoản. Chỉ hiện hồ sơ học đã phát hành như khả năng học đầy đủ. Chuyển bộ học đổi phạm vi/mặt hỏi hợp lệ, không chuyển tiến độ thẻ sang bộ khác. Luồng kết thúc bằng nhập từ và kiểm tra tài nguyên offline, không mở buổi học rỗng.

#### UI-13. Cài đặt

Chia nhóm Học tập, Nhắc lịch, Tài khoản/thiết bị và Nâng cao. Học tập gồm chỉ tiêu thẻ mới, múi giờ, cấu hình game/bộ học. Nâng cao chứa thông số SRS và ngưỡng thời gian, có mặc định, mô tả tác động và kiểm tra giá trị hợp lệ; không thay cấu hình snapshot của câu đang học.

Nhắc lịch mặc định tắt. Khi bật, hiện giờ gợi ý 20:00, múi giờ, thiết bị chính và chỉ sau đó xin quyền. Quyền bị từ chối hoặc không hỗ trợ: báo “Nhắc trong app khi bạn mở lại”, không tuyên bố sẽ nhắc nền đúng giờ. Đăng xuất khi còn thay đổi chưa đồng bộ phải cảnh báo, cho đồng bộ trước hoặc ở lại, không xóa log âm thầm.

#### UI-14. Tài nguyên và đồng bộ

Nút trạng thái trên thanh trên mở bảng chi tiết: đã lưu trên máy, số thay đổi đang chờ, lần đồng bộ thành công cuối, lỗi và Thử lại. Offline là trạng thái bình thường của app, không mặc định tô đỏ. Lỗi không lưu được phải nổi bật và khác với chỉ chưa gửi lên server.

Danh sách ảnh, audio và dữ liệu nét có kích thước, trạng thái đã tải/thiếu/hỏng và thao tác tải lại. Nêu rõ game nào bị ảnh hưởng. Xung đột nội dung có lịch sử từng trường và khôi phục giá trị cũ. Lịch hợp nhất thay đổi hiện thông báo và thẻ bị ảnh hưởng; không yêu cầu người dùng tự chọn kết quả ôn để bỏ qua quy tắc Mục 2.4.

### 17.10. UI cho giai đoạn 2–3

UI-15 từ giai đoạn 2: AI là phần bổ sung trong trình soạn thẻ/kho câu, không là bước bắt buộc để lưu. Hiện chờ, đang chạy, cần chọn nghĩa, cần kiểm tra, thất bại, đã lỗi thời; cho thử lại theo Mục 11.2. Đề xuất mới đến sau sửa tay hiện riêng, có xem/chấp nhận/bỏ qua, không ghi đè. Kho câu hiện câu, ô khuyết, đáp án, nguồn và báo lỗi/xóa.

| Game / giai đoạn | Yêu cầu giao diện khi phát hành |
| --- | --- |
| G-07 Nói · G3 | Hỏi bằng N/H/P/HV hoặc câu khuyết; nút mic có chờ quyền/sẵn sàng/đang thu/đang nhận dạng. Phản hồi “Đã nhận ra đúng từ” kèm transcript, không chấm “Phát âm tốt”. Phân biệt 2 lần nhận dạng hợp lệ với lỗi mic/model. |
| G-08 Viết chữ · G3 | Hiện cấp Tô theo/Viết có gợi ý/Viết từ trí nhớ, vị trí chữ trong toàn từ, ô lưới, xóa nét/xóa chữ. Chữ mẫu chỉ hiện theo cấp/gợi ý, không lộ trong bài nhớ lại. Sau viết so sánh mẫu và bài làm; nêu giới hạn bút/palm rejection. |
| G-09 Thanh điệu · G2 | Nghe rồi chọn thanh từng âm tiết, hoặc đánh thanh trên pinyin chưa dấu. Chỉ rõ âm tiết đang trả lời; thanh nhẹ có nhãn, không chỉ hiện con số. |
| G-10 Lượng từ · G2 | Hiện câu khuyết và đáp án lượng từ hợp lệ; phản hồi bằng câu hoàn chỉnh. Thiếu dữ liệu lượng từ thì không sinh đề. |

Gõ Trung/Nhật dùng trạng thái 2 bước: nhập cách đọc toàn từ → chọn dạng viết toàn từ. Enter khi IME đang ghép chữ chỉ xác nhận IME, không nộp bài. Từ Nhật chỉ có kana và trường hợp thiếu nhiễu xử lý đúng Mục 8.2; không bắt chọn kanji giả.

UI-16 chỉ bật từ giai đoạn 3 khi chỉ số được định nghĩa. Mọi biểu đồ có phạm vi, khoảng thời gian, mẫu số và bản đọc bằng chữ/bảng. Không gộp kết quả game thành trình độ từ. Nhãn Đã thuộc giữ định nghĩa ở Mục 5; biểu đồ bổ sung khác cần định nghĩa chỉ số trước khi nghiệm thu.

### 17.11. Responsive, bàn phím và khả năng tiếp cận

Mục tiêu kiểm thử là WCAG 2.2 mức AA. Các mục dưới đây là nhóm ưu tiên cho sản phẩm, không thay thế đánh giá tất cả tiêu chí A/AA áp dụng. Chỉ công bố đạt sau khi kiểm thử bản chạy thực tế và ghi rõ phạm vi. Nguồn [W1]–[W8] ở Mục 17.14.

| Tiêu chí | Yêu cầu kiểm thử |
| --- | --- |
| Chữ · 1.4.3 [W2] | Tương phản ít nhất 4,5:1; chữ lớn theo định nghĩa WCAG (18 pt thường hoặc 14 pt đậm) ít nhất 3:1. Đo cặp màu trên nền thật, kể cả nhãn phụ. |
| Điều khiển · 1.4.11 [W3] | Thông tin thị giác cần để nhận biết điều khiển/trạng thái đạt 3:1 với màu liền kề, theo phạm vi và ngoại lệ của tiêu chí. Không áp 3:1 cho mọi viền trang trí. |
| Vùng bấm · 2.5.8 [W4] | AA quy định 24 × 24 CSS px hoặc đạt ngoại lệ tương ứng. Sản phẩm chọn mức 44 px và 48 px cho nút mobile; đây là quy ước UI, không gọi là ngưỡng AA bắt buộc. |
| Không bắt kéo · 2.5.7 [W5] | Ghép cặp, xếp chữ, chuyển chủ đề có cách chọn/chạm đơn không kéo. Ngoại lệ cho tương tác thiết yếu phải xét đúng phạm vi, không miễn cho toàn bộ màn hình. |
| Sắp xếp lại · 1.4.10 [W6] | Nội dung thông thường đọc được ở bề rộng tương đương 320 CSS px không mất chức năng và không cuộn hai chiều. Nội dung thực sự cần bố cục hai chiều, như bảng, chỉ được ngoại lệ trong vùng đó. |
| Focus · 2.4.7/2.4.11 [W1, W7] | Vị trí bàn phím luôn nhận biết được; không bị nội dung do app tạo che hoàn toàn. Thiết kế nút dính/phản hồi tránh che ô đang nhập. |
| Bàn phím/ngữ nghĩa [W1] | Các chức năng áp dụng dùng được bằng bàn phím (2.1.1); focus theo thứ tự logic. Nhãn, vai trò, giá trị điều khiển rõ ràng; lỗi gắn với trường nhập. Đúng/sai không chỉ phân biệt bằng màu (1.4.1). |
| Thông báo · 4.1.3 [W8] | Kết quả, lỗi và trạng thái lưu có thể được công nghệ hỗ trợ nhận biết mà không buộc chuyển focus. Dùng live region phù hợp, tránh đọc lặp hoặc đọc đếm ngược mỗi giây. |

Giữ các mốc bố cục của HTML: trên 1020 px là desktop, 721–1020 px thu gọn thanh bên/cột, từ 720 px trở xuống là một cột với điều hướng ngang gọn. Đây là mốc thiết kế, không giới hạn thiết bị. Kiểm thử thêm 320, 390, 768, 1024 và 1440 CSS px; cả dọc/ngang và phóng to chữ 200%.

Trên mobile, bàn phím ảo không che ô nhập, hướng dẫn lỗi hoặc Kiểm tra. Hộp thoại dài cuộn nội dung, giữ nút đóng và hành động truy cập được. Danh sách ghép cặp có thể chuyển thành chọn một ô hỏi rồi chọn đáp án, không phụ thuộc việc hai đầu luôn cùng hiện trong màn hình.

Tab/Shift+Tab di chuyển; Enter nộp trong form sẵn sàng, không nộp khi IME đang soạn; Escape đóng hộp thoại theo quy tắc bảo toàn dữ liệu. Focus vào hộp thoại khi mở, giữ trong đó và trả về nút mở khi đóng. Không kích hoạt phím tắt game khi con trỏ đang ở trường soạn thảo. Kiểm tra thực tế IPA, tiếng Việt, pinyin, kanji/kana và furigana trên các hồ sơ đã phát hành.

### 17.12. Ngôn ngữ giao diện và phản hồi

Dùng tiếng Việt nhất quán cho điều hướng. Bộ học là cặp ngôn ngữ/kiểu nghĩa; Chủ đề là category; Thẻ là từ/cụm từ với một nghĩa. Các số liệu phải nêu đơn vị thẻ, câu hoặc lần thử, không dùng thay thế nhau.

| Tình huống | Nội dung hiển thị mẫu / hành động |
| --- | --- |
| Đúng ở Trắc nghiệm | “Chính xác. Mức Khó do game nhận biết; bạn không trả lời sai.” |
| Sai rồi sửa đúng | “Đúng sau khi sửa. Kết quả: Khó. Lỗi trước đó vẫn được ghi trong sổ từ sai.” |
| Dùng gợi ý | “Có trợ giúp: kết quả tối đa Khó.” Không ghi “Sai” nếu chưa có lần thử sai. |
| Lỗi tài nguyên | “Chưa phát được âm thanh. Kết quả học chưa bị thay đổi.” Kèm Thử lại/Đổi game hợp lệ. |
| Đã lưu offline | “Đã lưu trên thiết bị · 8 kết quả chờ đồng bộ. Lần đồng bộ cuối: 08:42.” Số và giờ lấy từ dữ liệu thật. |
| Lỗi lưu cục bộ | “Chưa lưu được kết quả. Giữ màn hình này và thử lại.” Không hiện dấu đã lưu hoặc tự chuyển câu. |
| Phạm vi không hợp lệ | “Không có thẻ đủ điều kiện cho game này.” Kèm nguyên nhân và Bổ sung/Đổi game. |
| Đồng bộ điều chỉnh lịch | “Lịch đã điều chỉnh sau đồng bộ.” Kèm Xem chi tiết, không giả vờ mọi thiết bị đã giống nhau trước đó. |

Thông báo thành công ngắn có thể tự ẩn. Lỗi chặn, cảnh báo mất dữ liệu và phản hồi học phải còn đến khi đã xử lý hoặc người dùng chuyển tiếp. Không dùng thông báo nổi ngắn là nơi duy nhất để báo lỗi nhập liệu hoặc lỗi lưu.

### 17.13. Tiêu chí nghiệm thu UI/UX

Chạy các ca UX dưới đây cùng AT-01–AT-32, không thay thế kiểm thử nghiệp vụ. Mỗi ca lưu thiết bị/trình duyệt, phạm vi màn, thao tác, ảnh hoặc video và kết quả. Ca giai đoạn sau ghi Chưa áp dụng, không ghi Đạt chỉ vì game đang ẩn.

| Mã | Tình huống | Kết quả phải đạt |
| --- | --- | --- |
| UX-01 | Hôm nay, có phiên dở | Ưu tiên Tiếp tục; giữ đáp án/lần thử; không tạo cơ hội ôn mới. |
| UX-02 | Thẻ thuộc 2 chủ đề | Tổng thẻ/đến hạn khử trùng; nhãn phạm vi đúng. |
| UX-03 | Kiểm tra thiếu dữ liệu | Hiện số đủ/thiếu và nguyên nhân; có đường bổ sung, không chấm sai. |
| UX-04 | Chọn mặt thẻ/game | Chỉ tổ hợp hợp lệ; đổi cấu hình không đổi câu đang học. |
| UX-05 | Lật thẻ hai chế độ | Ôn có Nhớ/Quên; làm quen chỉ Tiếp tục sau mặt sau, không phạt. |
| UX-06 | Trắc nghiệm 2/3/4 ô | Định nghĩa dài không cắt; chọn/nộp một lần, đúng/sai có chữ và icon. |
| UX-07 | Ghép cặp không kéo | Dùng chạm và bàn phím được; không nối sai nghĩa mà báo đúng. |
| UX-08 | Gõ sai 1 ký tự | Sửa 1 lần; đúng sau sửa hiện Khó và lỗi vẫn trong sổ. |
| UX-09 | Chính tả và audio lỗi | Không lộ Từ; có nghe lại/chậm; lỗi phát không thành Quên. |
| UX-10 | Điền Yesterday, I ___ | Chỉ went đúng theo khóa câu; sau nộp hiện câu đủ và báo lỗi. |
| UX-11 | Đúng với gợi ý | Nêu lý do Khó; không tự ghi lỗi học khi chưa sai. |
| UX-12 | Ôn so với luyện tự do | Nhãn chế độ và tác động lịch nhất quán trước/sau câu. |
| UX-13 | Chờ 1/10 phút và tải lại | Giữ due_at, cho luyện xen giữa; không rút chờ và không tự tốt nghiệp. |
| UX-14 | Tổng kết khi còn học lại | Hiện bước còn chờ; không gọi thẻ sai là đã thuộc. |
| UX-15 | Minh chứng sổ từ sai | Nêu đúng game/thời gian còn thiếu; không ra sổ sau 2 câu đúng bất kỳ. |
| UX-16 | Lưu thẻ chỉ có Từ | Lưu thành công, báo Chờ bổ sung, không tiêu chỉ tiêu học mới. |
| UX-17 | Sửa nghĩa và rời form | Có xác nhận đổi thẻ/tiến độ; không mất nội dung chưa lưu. |
| UX-18 | Excel trùng/lỗi ảnh/thử lại | Xem trước từng dòng, chọn gộp; thử lại không nhập đúp. |
| UX-19 | Offline và hết chỗ lưu | Phân biệt đã lưu cục bộ với lỗi lưu; không báo thành công giả. |
| UX-20 | Xung đột và lịch hợp nhất | Hiện bản theo trường và lịch đã điều chỉnh; giữ log gốc. |
| UX-21 | Mobile 320/390 px, bàn phím ảo | Nội dung đọc được, nút/ô nhập không bị che; không cuộn ngang toàn trang. |
| UX-22 | Chỉ dùng bàn phím | Đi qua luồng chính; focus rõ, không mắc kẹt; modal trả focus đúng nơi. |
| UX-23 | Màu/vùng bấm/phóng to | Đo theo 17.2/17.11; không đánh giá chỉ bằng ảnh thu nhỏ. |
| UX-24 | Trình đọc màn hình | Nhận được nhãn, lỗi, kết quả và lưu; không lộ đáp án trước lượt. |
| UX-25 | Từ chối quyền nhắc lịch | Nhắc trong app, không cam kết thông báo nền; không hỏi lại liên tục. |
| UX-26 | Tính năng chưa phát hành | Không là nút game có thể chọn hoặc bước học bắt buộc. |
| UX-27 | G2/G3: pinyin/kana và IME | Chọn toàn từ; Enter ghép chữ không nộp; không bắt từ kana chọn kanji. |
| UX-28 | G3: Nói và Viết chữ | Phản hồi đúng khả năng nhận từ; ô viết/cấp gợi ý không lộ bài nhớ lại. |
| UX-29 | Cài đặt khi đang học | Không sửa snapshot hay lịch quá khứ; cảnh báo tác động đổi múi giờ. |
| UX-30 | Chuyển từ demo sang bản thật | Bỏ nhãn/số liệu mô phỏng, kiểm tra lưu sau reload, lịch thật và đồng bộ; không kết luận đã xong từ giao diện demo. |

Hồ sơ bàn giao UI gồm: danh mục màn/trạng thái, thư viện thành phần, mã giao diện, dữ liệu test và kết quả kiểm thử. Chặn phát hành khi mất log, chấm lặp, lộ đáp án, báo lưu giả, sai phạm vi, không thể hoàn thành luồng chính trên thiết bị đã công bố hoặc không đạt tiêu chí tiếp cận áp dụng.

### 17.14. Nguồn tham chiếu UI và tiêu chuẩn

Nguồn nội bộ: Đặc tả v0.4 (25/09/2026); vocalearn_demo.html; ba ảnh home-desktop.png, home-mobile.png và study-desktop.png của cùng demo. Các sửa UI về nhãn game, phản hồi, phân loại thẻ và trạng thái bám theo các nhận xét UI/UX đã thống nhất trong hội thoại.

Nguồn bên ngoài chỉ dùng để đối chiếu tiêu chí khả năng tiếp cận: W3C WCAG 2.2 và các tài liệu giải thích của WAI, tra cứu 25/09/2026. Màu, kích thước, mốc responsive và mẫu câu chữ là quy ước sản phẩm, không phải toàn bộ yêu cầu bắt buộc của WCAG.

[W1] W3C. Web Content Accessibility Guidelines (WCAG) 2.2.

[W2] WAI. Understanding 1.4.3: Contrast (Minimum).

[W3] WAI. Understanding 1.4.11: Non-text Contrast.

[W4] WAI. Understanding 2.5.8: Target Size (Minimum).

[W5] WAI. Understanding 2.5.7: Dragging Movements.

[W6] WAI. Understanding 1.4.10: Reflow.

[W7] WAI. Understanding 2.4.11: Focus Not Obscured (Minimum).

[W8] WAI. Understanding 4.1.3: Status Messages.

### 17.15. Tham chiếu trực quan từ HTML

Tham chiếu phong cách và bố cục của bản demo hiện tại. Nhãn DEMO, số liệu mẫu và mức bao phủ trong ảnh không phải yêu cầu sản phẩm thật; các bổ sung ở 17.5–17.13 vẫn phải thực hiện.

Hình 17-A. Hôm nay trên desktop: ưu tiên hành động học, giữ ba mục điều hướng chính.

Hình 17-B. Khung học: chế độ, tiến độ, câu hỏi và đáp án; ảnh đã cắt khoảng trắng ngoài khung.

### 17.15. Tham chiếu trực quan (tiếp)

Hình 17-C. Cùng trang Hôm nay trên điện thoại: phần đầu ở trái, phần cuộn tiếp ở phải. Không phải hai màn hình độc lập.

|  |  |
| --- | --- |

Giữ nhịp khoảng cách và nút chính dễ bấm. Bản thật cần bổ sung bộ chọn nhiều chủ đề, nhóm Đang học và trạng thái lưu/đồng bộ thật; không thu nhỏ desktop để thay cho bố cục mobile.

# Hệ Thống Giám Sát Quy Trình Thẩm Định - In Ấn

## Mục tiêu
Dự án quản lý và giám sát luồng xử lý hồ sơ theo quy trình nội bộ:

`Kinh doanh -> Thẩm định (Admin chỉ định) -> TP Duyệt -> In ấn`

## Cấu trúc thư mục
- `docs/`: Tài liệu nghiệp vụ, blueprint, hướng dẫn triển khai.
- `src/`: Mã nguồn ứng dụng chính (API, giao diện dashboard, schema dữ liệu).
- `jobs/`: Tác vụ nền (gửi mail thông báo, xử lý lịch chạy định kỳ).

## Luồng nghiệp vụ
1. Kinh doanh tạo hồ sơ và đính kèm tài liệu ban đầu.
2. Admin chỉ định chuyên viên Thẩm định phụ trách hồ sơ.
3. Chuyên viên cập nhật kết quả và chuyển cho TP Duyệt.
4. TP Duyệt phê duyệt hoặc yêu cầu bổ sung.
5. Hồ sơ đạt duyệt được chuyển sang In ấn.
6. Mọi bước chuyển trạng thái đều ghi log và gửi thông báo email tự động.

## Thành phần chính cần triển khai
- Đăng nhập nội bộ theo vai trò (`Users`).
- Upload/Download file theo từng công đoạn xử lý.
- Lịch sử xử lý hồ sơ (`TaskLogs`) ghi nhận toàn bộ thay đổi.
- Mail notifier tự động bằng `Nodemailer` hoặc giải pháp tương đương.
- Giao diện `Minimalist Dashboard` cho theo dõi trạng thái hồ sơ theo thời gian thực.

## Blueprint dữ liệu
Chi tiết mô hình dữ liệu xem tại: `docs/database-blueprint.md`.

## Khoi dong nhanh
1. Cai dependencies:
	- `npm install`
2. Tao file moi truong:
	- copy `.env.example` thanh `.env`
3. Chay ung dung:
	- `npm run dev`
4. Kiem tra API:
	- `GET /health`

Tai khoan khoi tao mac dinh:
- `username`: `admin`
- `password`: `admin123`

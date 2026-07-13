# Database Blueprint

## 1) Users (Role-based)
Lưu thông tin người dùng nội bộ và phân quyền theo vai trò.

Các trường gợi ý:
- `id` (PK, UUID hoặc BIGINT)
- `username` (unique)
- `password_hash`
- `full_name`
- `email` (unique)
- `role` (`ADMIN`, `KINH_DOANH`, `THAM_DINH`, `TP_DUYET`, `IN_AN`)
- `is_active`
- `created_at`, `updated_at`

## 2) Tasks
Đại diện cho hồ sơ/công việc đi qua các công đoạn.

Các trường gợi ý:
- `id` (PK)
- `code` (mã hồ sơ, unique)
- `title`
- `description`
- `current_stage` (`KINH_DOANH`, `THAM_DINH`, `TP_DUYET`, `IN_AN`, `DONE`)
- `status` (`PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `ON_HOLD`)
- `created_by` (FK -> Users.id)
- `assignee_id` (FK -> Users.id, có thể null)
- `approved_by` (FK -> Users.id, có thể null)
- `created_at`, `updated_at`, `completed_at`

## 3) TaskLogs
Nhật ký chuyển bước và thay đổi dữ liệu theo từng hồ sơ.

Các trường gợi ý:
- `id` (PK)
- `task_id` (FK -> Tasks.id)
- `from_stage`
- `to_stage`
- `action` (ví dụ: `CREATE`, `ASSIGN`, `SUBMIT`, `APPROVE`, `REJECT`, `PRINT`)
- `note`
- `changed_by` (FK -> Users.id)
- `changed_at`

## 4) Attachments
Lưu metadata file upload cho từng hồ sơ và từng công đoạn.

Các trường gợi ý:
- `id` (PK)
- `task_id` (FK -> Tasks.id)
- `uploaded_by` (FK -> Users.id)
- `stage` (công đoạn tại thời điểm upload)
- `file_name`
- `storage_path`
- `mime_type`
- `file_size`
- `uploaded_at`

## Quan hệ chính
- `Users (1) -> (N) Tasks` qua `created_by`, `assignee_id`, `approved_by`.
- `Tasks (1) -> (N) TaskLogs`.
- `Tasks (1) -> (N) Attachments`.
- `Users (1) -> (N) TaskLogs` qua `changed_by`.
- `Users (1) -> (N) Attachments` qua `uploaded_by`.

## Ràng buộc nghiệp vụ nên có
- Chỉ `ADMIN` mới được chỉ định hồ sơ sang thẩm định.
- Chỉ `TP_DUYET` được quyền phê duyệt/từ chối trước khi qua `IN_AN`.
- Mọi thay đổi `current_stage` của `Tasks` bắt buộc tạo bản ghi tương ứng trong `TaskLogs`.
- File đính kèm phải gắn với `task_id` và `stage` cụ thể để truy vết.

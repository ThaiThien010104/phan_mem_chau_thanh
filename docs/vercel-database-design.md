# Vercel Database Design

Muc tieu: thay SQLite local bang PostgreSQL managed de deploy len Vercel on dinh hon.

## Vi sao khong dung SQLite hien tai

- Vercel Functions nen duoc xem la stateless. Khong nen phu thuoc vao file `src/app.db`.
- File upload vao thu muc local nhu `uploads/` hoac `src/public/uploads/` khong phu hop khi deploy cloud/serverless.
- Khi deploy Vercel, nen dat `FILE_STORAGE=vercel-blob` va cau hinh `BLOB_READ_WRITE_TOKEN` de file nam tren object storage thay vi filesystem tam thoi.
- App hien tai vua chua schema, migration nhe, seed user, upload file, va business logic trong mot file lon nen rat kho debug.

Huong moi:

- Database: PostgreSQL managed, vi du Neon, Supabase, Railway Postgres, hoac database Postgres tu Vercel Marketplace.
- File storage: Vercel Blob, S3, Cloudinary, hoac dich vu object storage tuong duong.
- App chi luu metadata file trong database, khong luu file vat ly trong repo.

## Cac bang chinh

### `app_users`

Luu tai khoan noi bo.

Vai tro:

- `ADMIN`: quan tri he thong, tao/sua/xoa user, giao viec.
- `KINH_DOANH`: tao ho so, chuyen ho so da dat sang in an.
- `THAM_DINH`: nhan ho so va upload ket qua tham dinh.
- `THAM_DINH_VIEN`: danh gia dat/khong dat.
- `TP_DUYET`: phe duyet hoac tu choi.
- `IN_AN`: xu ly cong doan in an.

### `tasks`

Bang trung tam cua he thong. Moi dong la mot ho so/du an.

Trang thai quy trinh:

- `KINH_DOANH`
- `THAM_DINH`
- `TP_DUYET`
- `IN_AN`
- `DONE`

Trang thai xu ly:

- `PENDING`
- `IN_PROGRESS`
- `APPROVED`
- `REJECTED`
- `ON_HOLD`
- `CANCELLED`

Cot quan trong:

- `code`: ma ho so, unique.
- `project_name`, `customer_name`: thong tin hien thi chinh.
- `created_by`: user tao ho so.
- `primary_assignee_id`: nguoi dang chiu trach nhiem chinh.
- `approved_by`: nguoi phe duyet cuoi neu co.

### `task_assignees`

Dung de giao mot ho so cho nhieu nguoi. Bang nay thay cho viec chi co mot `assignee_id`.

Cot `role_in_task` cho biet nguoi do tham gia voi vai tro nao:

- `REVIEWER`
- `APPRAISER`
- `APPROVER`
- `PRINTER`
- `WATCHER`

### `task_files`

Luu metadata file. File that su nam o object storage.

Cot quan trong:

- `storage_provider`: vi du `vercel_blob`, `s3`, `cloudinary`.
- `storage_key`: key/path trong object storage.
- `public_url`: URL de frontend tai/xem file neu storage cho phep.
- `file_kind`: `PROPOSAL`, `DOCUMENT`, `APPRAISAL_RESULT`, `REVIEW_RESULT`, `PRINT_FILE`, `OTHER`.

### `task_reviews`

Luu ket qua danh gia/phe duyet rieng, thay vi chi ghi vao log.

Vi du:

- Tham dinh vien danh gia `DAT` hoac `KHONG_DAT`.
- Truong phong phe duyet `APPROVE` hoac `REJECT`.

### `task_logs`

Audit log bat buoc cho moi thay doi quan trong cua ho so.

Nen ghi log khi:

- Tao ho so.
- Upload file.
- Giao viec.
- Chuyen stage/status.
- Danh gia dat/khong dat.
- Phe duyet/tu choi.
- Chuyen sang in an.
- Hoan tat.

### `notifications` va `email_outbox`

Hai bang nay giup khong gui email truc tiep trong request chinh.

Luon tot hon khi:

- Request API ghi `email_outbox`.
- Worker/cron gui email sau.
- Neu gui loi thi cap nhat `FAILED` va luu `error_message`.

## Luong nghiep vu de map voi schema moi

1. `KINH_DOANH` tao ho so:
   - Insert `tasks`.
   - Upload file de nghi vao object storage.
   - Insert `task_files` voi `file_kind = 'PROPOSAL'`.
   - Insert `task_logs` action `CREATE`.

2. `ADMIN` giao tham dinh:
   - Insert/cap nhat `task_assignees`.
   - Update `tasks.current_stage = 'THAM_DINH'`.
   - Update `tasks.status = 'IN_PROGRESS'`.
   - Insert `task_logs` action `ASSIGN`.

3. `THAM_DINH` upload ket qua:
   - Upload file vao object storage.
   - Insert `task_files` voi `file_kind = 'APPRAISAL_RESULT'`.
   - Insert `task_reviews` voi `review_type = 'APPRAISAL'`.
   - Insert `task_logs`.

4. `THAM_DINH_VIEN` danh gia:
   - Insert `task_reviews` voi `review_type = 'FINAL_REVIEW'`.
   - Neu dat: update task ve `KINH_DOANH` + `APPROVED`.
   - Neu khong dat: update task ve `KINH_DOANH` + `REJECTED`.
   - Insert `task_logs`.

5. `KINH_DOANH` chuyen in an:
   - Chi cho phep khi `current_stage = 'KINH_DOANH'` va `status = 'APPROVED'`.
   - Update `current_stage = 'IN_AN'`, `status = 'IN_PROGRESS'`.
   - Insert `task_logs` action `MOVE_PRINT`.

6. `IN_AN` hoan tat:
   - Upload file in neu co.
   - Update `current_stage = 'DONE'`, `status = 'APPROVED'`, `completed_at = now()`.
   - Insert `task_logs` action `COMPLETE_PRINT`.

7. Luu tru ho so:
   - Khong xoa vat ly task, file, log.
   - Update `is_deleted = 1`, `deleted_at`, `deleted_by`, `delete_reason`.
   - Insert `task_logs` action `ARCHIVE_TASK`.

8. Theo doi SLA:
   - Moi ho so co the co `due_at`.
   - Frontend hien `no_due`, `on_track`, `due_soon`, `overdue`, `completed` dua tren deadline va trang thai hoan tat.

## File SQL

Schema PostgreSQL dang duoc app hien tai dung nam tai:

```text
src/schema.sql
```

File nay giu ten bang cu nhu `users`, `tasks`, `attachments`, `task_logs`, `task_assignees` de backend hien tai co the chuyen tu SQLite sang PostgreSQL nhanh nhat.

Schema thiet ke dai han nam tai:

```text
database/001_vercel_postgres_schema.sql
```

File dai han nay dung ten bang moi nhu `app_users`, `task_files`, `task_reviews`, `notifications`, `email_outbox`. Chi nen dung no khi da refactor backend theo schema moi.

Voi ban hien tai, app se tu chay `src/schema.sql` khi khoi dong neu `DATABASE_URL` tro toi database PostgreSQL hop le.

## Bien moi truong nen co tren Vercel

```text
DATABASE_URL=postgres://...
JWT_SECRET=...
BLOB_READ_WRITE_TOKEN=...
MAIL_HOST=...
MAIL_PORT=587
MAIL_USER=...
MAIL_PASS=...
MAIL_FROM=...
```

## Buoc tiep theo nen lam

1. Tao PostgreSQL database moi tren Neon, Supabase, hoac Vercel Marketplace.
2. Them `DATABASE_URL` vao `.env` local va Environment Variables tren Vercel.
3. Chay app mot lan de tao bang va seed user mac dinh.
4. Neu can giu du lieu cu, viet script migrate tu `src/app.db` sang PostgreSQL.
5. Sau khi database on dinh, bat `FILE_STORAGE=vercel-blob` va them `BLOB_READ_WRITE_TOKEN` tren Vercel de dung object storage.
6. Sau cung moi refactor `src/app.js` thanh cac module: `db`, `auth`, `tasks`, `users`, `files`, `logs`.

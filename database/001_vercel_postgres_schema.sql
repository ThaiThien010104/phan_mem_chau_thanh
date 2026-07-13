-- PostgreSQL schema for deploying the appraisal/printing workflow on Vercel.
-- Recommended runtime: Vercel + managed Postgres (Neon, Supabase, Vercel Marketplace)
-- Recommended file storage: Vercel Blob, S3, Cloudinary, or another object storage service.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (
    role IN (
      'ADMIN',
      'KINH_DOANH',
      'THAM_DINH',
      'THAM_DINH_VIEN',
      'TP_DUYET',
      'IN_AN'
    )
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  current_stage TEXT NOT NULL CHECK (
    current_stage IN ('KINH_DOANH', 'THAM_DINH', 'TP_DUYET', 'IN_AN', 'DONE')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'ON_HOLD', 'CANCELLED')
  ),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  primary_assignee_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  role_in_task TEXT NOT NULL DEFAULT 'REVIEWER' CHECK (
    role_in_task IN ('REVIEWER', 'APPRAISER', 'APPROVER', 'PRINTER', 'WATCHER')
  ),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  UNIQUE (task_id, user_id, role_in_task)
);

CREATE TABLE task_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (
    stage IN ('KINH_DOANH', 'THAM_DINH', 'TP_DUYET', 'IN_AN', 'DONE')
  ),
  file_kind TEXT NOT NULL DEFAULT 'DOCUMENT' CHECK (
    file_kind IN ('PROPOSAL', 'DOCUMENT', 'APPRAISAL_RESULT', 'REVIEW_RESULT', 'PRINT_FILE', 'OTHER')
  ),
  original_name TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'vercel_blob',
  storage_key TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  checksum_sha256 TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  review_type TEXT NOT NULL CHECK (review_type IN ('APPRAISAL', 'FINAL_REVIEW', 'MANAGER_APPROVAL')),
  result TEXT NOT NULL CHECK (result IN ('DAT', 'KHONG_DAT', 'APPROVE', 'REJECT', 'REQUEST_CHANGES')),
  note TEXT,
  file_id UUID REFERENCES task_files(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  from_status TEXT,
  to_status TEXT,
  action TEXT NOT NULL,
  note TEXT,
  changed_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_users_role_active ON app_users(role, is_active);
CREATE INDEX idx_tasks_stage_status ON tasks(current_stage, status);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_primary_assignee ON tasks(primary_assignee_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_tasks_is_deleted ON tasks(is_deleted);
CREATE INDEX idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_user_id ON task_assignees(user_id);
CREATE INDEX idx_task_files_task_id ON task_files(task_id);
CREATE INDEX idx_task_logs_task_id_changed_at ON task_logs(task_id, changed_at DESC);
CREATE INDEX idx_task_logs_changed_by ON task_logs(changed_by);
CREATE INDEX idx_task_reviews_task_id ON task_reviews(task_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_email_outbox_status ON email_outbox(status, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Optional seed user. Replace password_hash with a bcrypt hash generated by the app.
-- INSERT INTO app_users (username, password_hash, full_name, email, role)
-- VALUES ('admin', '<bcrypt_hash_here>', 'System Admin', 'admin@example.com', 'ADMIN');

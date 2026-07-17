require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Readable } = require('stream');
const { Pool } = require('pg');
const { sendTaskStageEmail } = require('../jobs/emailNotifier');

const app = express();
const port = Number(process.env.PORT || 3000);
const isVercel = process.env.VERCEL === '1';
const fileStorageProvider = process.env.FILE_STORAGE || 'local';
const uploadDir = path.resolve(
  process.env.UPLOAD_DIR || (isVercel ? '/tmp/valuFlow-uploads' : './src/public/uploads')
);
const legacyUploadDir = path.resolve('./uploads');
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
const allowedUploadMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'text/plain',
]);

fs.mkdirSync(uploadDir, { recursive: true });
if (!isVercel) {
  fs.mkdirSync(path.resolve(__dirname, 'public'), { recursive: true });
}

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    // Neon may append channel_binding=require for psql. Node pg can reset the
    // connection with that option in some Windows/SSL environments.
    url.searchParams.delete('channel_binding');
    if (process.env.PGSSL === 'true') {
      url.searchParams.delete('sslmode');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 60000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
});

let bootstrapPromise;
function ensureBootstrapStarted() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  return bootstrapPromise;
}

app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(cors());
app.use(express.json());
app.use(async (_, res, next) => {
  try {
    await ensureBootstrapStarted();
    return next();
  } catch (error) {
    console.error('Bootstrap error:', error);
    return res.status(500).json({ message: 'Khong khoi dong duoc he thong' });
  }
});
app.use('/files', express.static(uploadDir));
app.use('/uploads', express.static(uploadDir));
app.use('/legacy-files', express.static(legacyUploadDir));
app.use('/public', express.static(path.resolve(__dirname, 'public')));

// Serve frontend static assets (css/js/images)
app.use(express.static(path.resolve(__dirname)));

app.get('/', (_, res) => {
  res.sendFile(path.resolve(__dirname, 'login.html'));
});

app.get('/login', (_, res) => {
  res.redirect('/');
});

app.get('/dashboard', (_, res) => {
  res.sendFile(path.resolve(__dirname, 'dashboard.html'));
});

app.get('/task/:taskId(\\d+)', (_, res) => {
  res.sendFile(path.resolve(__dirname, 'task-detail.html'));
});

const diskStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeOriginalName = path.basename(file.originalname).replace(/[^\w.\-]+/g, '-');
    const fileName = `${Date.now()}-${safeOriginalName}`;
    cb(null, fileName);
  },
});

const memoryStorage = multer.memoryStorage();

function uploadFileFilter(req, file, cb) {
  if (!allowedUploadMimeTypes.has(file.mimetype)) {
    req.uploadValidationError = 'Loai file khong duoc ho tro';
    cb(null, false);
    return;
  }
  cb(null, true);
}

const multerOptions = {
  storage: fileStorageProvider === 'vercel-blob' ? memoryStorage : diskStorage,
  limits: { fileSize: maxUploadBytes, files: 60 },
  fileFilter: uploadFileFilter,
};

const upload = multer(multerOptions);
const uploadMultiple = multer(multerOptions).fields([
  { name: 'proposalFile', maxCount: 1 },
  { name: 'documentFiles', maxCount: 50 }
]);
const VALID_ROLES = ['ADMIN', 'KINH_DOANH', 'THAM_DINH', 'THAM_DINH_VIEN', 'TP_DUYET', 'IN_AN'];
const VALID_TASK_STAGES = ['KINH_DOANH', 'THAM_DINH', 'TP_DUYET', 'IN_AN', 'DONE'];
const VALID_TASK_STATUS = ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'ON_HOLD'];

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Khong du quyen truy cap' });
    }
    return next();
  };
}

async function ensureTaskAssigneeBackfill() {
  await run(
    `INSERT INTO task_assignees (task_id, user_id, assigned_by)
     SELECT id, assignee_id, COALESCE(assignee_id, created_by)
     FROM tasks t
     WHERE assignee_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM task_assignees ta
         WHERE ta.task_id = t.id AND ta.user_id = t.assignee_id
       )`
  );
}

async function ensureAppMigrations() {
  const columns = await all(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'tasks'`
  );
  const existing = new Set(columns.map((row) => row.column_name));
  const migrations = [
    ['due_at', `ALTER TABLE tasks ADD COLUMN due_at TIMESTAMPTZ`],
    ['is_deleted', `ALTER TABLE tasks ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`],
    ['deleted_at', `ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ`],
    ['deleted_by', `ALTER TABLE tasks ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL`],
    ['delete_reason', `ALTER TABLE tasks ADD COLUMN delete_reason TEXT`],
  ];

  for (const [column, sql] of migrations) {
    if (!existing.has(column)) {
      await pool.query(sql);
    }
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_is_deleted ON tasks(is_deleted)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON notifications(task_id)`);
}

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function run(sql, params = []) {
  const result = await pool.query(toPgSql(sql), params);
  return {
    rowCount: result.rowCount,
    lastID: result.rows[0] && result.rows[0].id,
    rows: result.rows,
  };
}

async function safeSendTaskStageEmail(payload) {
  try {
    await sendTaskStageEmail(payload);
  } catch (error) {
    console.error('Email notify error:', error.message);
  }
}

async function safeCreateNotification({ userId, taskId = null, type, title, message }) {
  if (!userId || !type || !title || !message) {
    return;
  }

  try {
    await run(
      `INSERT INTO notifications (user_id, task_id, type, title, message)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, taskId, type, title, message]
    );
  } catch (error) {
    console.error('Notification error:', error.message);
  }
}

async function safeCreateNotifications(items) {
  await Promise.all((items || []).map((item) => safeCreateNotification(item)));
}

async function saveUploadedFile(file) {
  if (!file) {
    return null;
  }

  if (fileStorageProvider !== 'vercel-blob') {
    return {
      fileName: file.originalname,
      storagePath: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  try {
    const { put } = await import('@vercel/blob');
    const safeOriginalName = path.basename(file.originalname).replace(/[^\w.\-]+/g, '-');
    const blobName = `uploads/${Date.now()}-${safeOriginalName}`;
    const putOptions = {
      access: 'private',
      contentType: file.mimetype,
    };
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      putOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
    }
    const blob = await put(blobName, file.buffer, putOptions);

    return {
      fileName: file.originalname,
      storagePath: blob.url,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  } catch (error) {
    throw new Error(`Khong luu duoc file len Vercel Blob: ${error.message}`);
  }
}

function normalizeDueAt(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T23:59:59+07:00`)
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getSlaStatus(task) {
  if (task.completed_at || task.current_stage === 'DONE') {
    return 'completed';
  }

  if (!task.due_at) {
    return 'no_due';
  }

  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) {
    return 'no_due';
  }

  const now = new Date();
  if (due.getTime() < now.getTime()) {
    return 'overdue';
  }

  const hoursLeft = (due.getTime() - now.getTime()) / 36e5;
  return hoursLeft <= 24 ? 'due_soon' : 'on_track';
}

function parsePositiveInteger(value, fallback, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function buildTaskVisibility(req, alias = 't', includeDeleted = false) {
  const where = [`COALESCE(${alias}.is_deleted, 0) = ${includeDeleted ? 1 : 0}`];
  const params = [];

  if (req.user.role === 'KINH_DOANH') {
    where.push(`${alias}.created_by = ?`);
    params.push(req.user.id);
  } else if (req.user.role === 'THAM_DINH' || req.user.role === 'THAM_DINH_VIEN') {
    where.push(`(${alias}.assignee_id = ? OR EXISTS (
      SELECT 1
      FROM task_assignees ta
      WHERE ta.task_id = ${alias}.id AND ta.user_id = ?
    ))`);
    params.push(req.user.id, req.user.id);
  } else if (req.user.role === 'IN_AN') {
    where.push(`${alias}.current_stage IN ('IN_AN', 'DONE')`);
  }

  return { where, params };
}

function addTaskSearchFilters(where, params, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return;
  }

  const like = `%${q}%`;
  where.push(`(
    LOWER(t.code) LIKE ?
    OR LOWER(t.title) LIKE ?
    OR LOWER(COALESCE(t.project_name, '')) LIKE ?
    OR LOWER(COALESCE(t.customer_name, '')) LIKE ?
    OR LOWER(COALESCE(t.description, '')) LIKE ?
    OR LOWER(COALESCE(u.username, '')) LIKE ?
    OR LOWER(COALESCE(a.username, '')) LIKE ?
  )`);
  params.push(like, like, like, like, like, like, like);
}

function addTaskStructuredFilters(where, params, query) {
  if (query.stage && VALID_TASK_STAGES.includes(query.stage)) {
    where.push('t.current_stage = ?');
    params.push(query.stage);
  }

  if (query.status && VALID_TASK_STATUS.includes(query.status)) {
    where.push('t.status = ?');
    params.push(query.status);
  }

  if (query.assigneeId && Number.isInteger(Number(query.assigneeId))) {
    where.push('t.assignee_id = ?');
    params.push(Number(query.assigneeId));
  }

  if (query.fromDate) {
    const fromDate = normalizeDueAt(String(query.fromDate).slice(0, 10));
    if (fromDate) {
      where.push('t.created_at >= ?');
      params.push(fromDate);
    }
  }

  if (query.toDate) {
    const toDate = normalizeDueAt(String(query.toDate).slice(0, 10));
    if (toDate) {
      where.push('t.created_at <= ?');
      params.push(toDate);
    }
  }
}

function hasPaginationQuery(query) {
  return query.page || query.pageSize || query.q || query.stage || query.status || query.sla || query.assigneeId || query.fromDate || query.toDate;
}

function withSla(rows) {
  return rows.map((item) => ({
    ...item,
    sla_status: getSlaStatus(item),
  }));
}

async function get(sql, params = []) {
  const result = await pool.query(toPgSql(sql), params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await pool.query(toPgSql(sql), params);
  return result.rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(error) {
  const message = String(error && error.message || '').toLowerCase();
  return (
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '08006'].includes(error && error.code) ||
    message.includes('connection terminated') ||
    message.includes('timeout') ||
    message.includes('econnreset')
  );
}

async function withDbRetry(label, fn, attempts = Number(process.env.DB_BOOTSTRAP_RETRIES || 5)) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts) {
        throw error;
      }
      const waitMs = Math.min(2000 * attempt, 10000);
      console.warn(`${label} failed (${error.message}). Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function bootstrap() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  await withDbRetry('Database schema bootstrap', () => pool.query(schema));

  await withDbRetry('Database migration bootstrap', ensureAppMigrations);
  await withDbRetry('Task assignment backfill', ensureTaskAssigneeBackfill);

  const admin = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['admin', hash, 'System Admin', 'admin@example.com', 'ADMIN']
    );
  }

  const sales = await get('SELECT id FROM users WHERE username = ?', ['kinhdoanh']);
  if (!sales) {
    const hash = await bcrypt.hash('kinhdoanh123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['kinhdoanh', hash, 'Nhan vien Kinh Doanh', 'kinhdoanh@example.com', 'KINH_DOANH']
    );
  }

  const reviewer = await get('SELECT id FROM users WHERE username = ?', ['thamdinh']);
  if (!reviewer) {
    const hash = await bcrypt.hash('thamdinh123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['thamdinh', hash, 'Nhan vien Tham Dinh', 'thamdinh@example.com', 'THAM_DINH']
    );
  }

  const appraiser = await get('SELECT id FROM users WHERE username = ?', ['thamdinhvien']);
  if (!appraiser) {
    const hash = await bcrypt.hash('thamdinhvien123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)` ,
      ['thamdinhvien', hash, 'Tham Dinh Vien', 'thamdinhvien@example.com', 'THAM_DINH_VIEN']
    );
  }

  const manager = await get('SELECT id FROM users WHERE username = ?', ['truongphong']);
  if (!manager) {
    const hash = await bcrypt.hash('truongphong123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['truongphong', hash, 'Truong phong Duyet', 'truongphong@example.com', 'TP_DUYET']
    );
  }

  const printer = await get('SELECT id FROM users WHERE username = ?', ['inan']);
  if (!printer) {
    const hash = await bcrypt.hash('inan123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['inan', hash, 'Nhan vien In An', 'inan@example.com', 'IN_AN']
    );
  }
}

function makeTaskCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `HS-${y}${m}${d}-${h}${min}${s}${rand}`;
}

function mapWorkflowStatus(task) {
  if (task.current_stage === 'KINH_DOANH' && task.status === 'PENDING') {
    return 'new';
  }
  if (task.current_stage === 'THAM_DINH' && task.status === 'IN_PROGRESS') {
    return 'in_review';
  }
  if (task.status === 'APPROVED' && task.current_stage === 'KINH_DOANH') {
    return 'approved';
  }
  if (task.current_stage === 'IN_AN' && task.status === 'IN_PROGRESS') {
    return 'printing';
  }
  if (task.status === 'REJECTED') {
    return 'rejected';
  }
  if (task.current_stage === 'DONE') {
    return 'done';
  }
  return 'in_progress';
}

function canViewTaskByRole(task, user) {
  if (user.role === 'ADMIN' || user.role === 'TP_DUYET') {
    return true;
  }
  if (user.role === 'KINH_DOANH') {
    return Number(task.created_by) === Number(user.id);
  }
  if (user.role === 'THAM_DINH') {
    return hasTaskAssignment(task, user.id);
  }
  if (user.role === 'THAM_DINH_VIEN') {
    return hasTaskAssignment(task, user.id);
  }
  if (user.role === 'IN_AN') {
    return ['IN_AN', 'DONE'].includes(task.current_stage);
  }
  return false;
}

function hasTaskAssignment(task, userId) {
  const assignedUserIds = Array.isArray(task.assigned_user_ids)
    ? task.assigned_user_ids.map((value) => Number(value))
    : [];

  if (assignedUserIds.length > 0) {
    return assignedUserIds.includes(Number(userId));
  }

  return Number(task.assignee_id) === Number(userId);
}

async function isUserAssignedToTask(taskId, userId) {
  const assignment = await get(
    `SELECT id FROM task_assignees WHERE task_id = ? AND user_id = ?`,
    [taskId, userId]
  );
  return !!assignment;
}

function buildAttachmentResponse(req, item) {
  if (/^https?:\/\//i.test(item.storage_path || '')) {
    const isPrivateBlob = item.storage_path.includes('.private.blob.vercel-storage.com');
    const downloadUrl = isPrivateBlob ? `/api/attachments/${item.id}/download` : item.storage_path;
    return {
      ...item,
      exists: true,
      public_url: downloadUrl,
      download_url: downloadUrl,
      full_url: downloadUrl,
    };
  }

  const primaryPath = path.resolve(uploadDir, item.storage_path);
  const legacyPath = path.resolve(legacyUploadDir, item.storage_path);
  const existsInPrimary = fs.existsSync(primaryPath);
  const existsInLegacy = fs.existsSync(legacyPath);
  const relative = existsInPrimary ? `/uploads/${item.storage_path}` : `/legacy-files/${item.storage_path}`;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  return {
    ...item,
    exists: existsInPrimary || existsInLegacy,
    public_url: relative,
    download_url: relative,
    full_url: `${baseUrl}${relative}`,
  };
}

async function getTaskById(taskId, user) {
  const task = await get(
    `SELECT t.id, t.code, t.title, t.description, t.project_name, t.customer_name,
            t.current_stage, t.status, t.due_at, t.completed_at, t.created_at, t.updated_at, t.created_by, t.assignee_id,
            creator.username AS created_by_username,
            assignee.username AS assignee_username
     FROM tasks t
     JOIN users creator ON creator.id = t.created_by
     LEFT JOIN users assignee ON assignee.id = t.assignee_id
     WHERE t.id = ? AND COALESCE(t.is_deleted, 0) = 0`,
    [taskId]
  );

  if (!task) {
    return { error: 404, message: 'Ho so khong ton tai' };
  }

  const assignedUsers = await all(
    `SELECT user_id
     FROM task_assignees
     WHERE task_id = ?
     ORDER BY assigned_at ASC`,
    [taskId]
  );

  const taskWithAssignments = {
    ...task,
    assigned_user_ids: assignedUsers.map((row) => row.user_id),
  };

  if (!canViewTaskByRole(taskWithAssignments, user)) {
    return { error: 403, message: 'Ban khong du quyen xem ho so nay' };
  }

  return {
    task: {
      ...taskWithAssignments,
      workflow_status: mapWorkflowStatus(taskWithAssignments),
      sla_status: getSlaStatus(taskWithAssignments),
    },
  };
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);

    if (!user) {
      return res.status(401).json({ message: 'Sai thong tin dang nhap' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Sai thong tin dang nhap' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '8h' }
    );

    return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/dashboard/summary', auth, async (req, res) => {
  try {
    const visibility = buildTaskVisibility(req, 't');
    const whereSql = visibility.where.join(' AND ');
    const rows = await all(
      `SELECT t.current_stage, COUNT(DISTINCT t.id) AS count
       FROM tasks t
       WHERE ${whereSql}
       GROUP BY t.current_stage`,
      visibility.params
    );

    const summary = {
      KINH_DOANH: 0,
      THAM_DINH: 0,
      TP_DUYET: 0,
      IN_AN: 0,
      DONE: 0,
    };

    rows.forEach((row) => {
      summary[row.current_stage] = Number(row.count || 0);
    });

    const taskRows = await all(
      `SELECT t.id, t.current_stage, t.status, t.due_at, t.completed_at
       FROM tasks t
       WHERE ${whereSql}`,
      visibility.params
    );
    const visibleTasks = withSla(taskRows);
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sameDay = (value) => {
      if (!value) {
        return false;
      }
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) &&
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    };

    summary.total = visibleTasks.length;
    summary.overdue = visibleTasks.filter((task) => task.sla_status === 'overdue').length;
    summary.dueSoon = visibleTasks.filter((task) => task.sla_status === 'due_soon').length;
    summary.dueToday = visibleTasks.filter((task) => sameDay(task.due_at)).length;
    summary.dueThisWeek = visibleTasks.filter((task) => {
      if (!task.due_at) {
        return false;
      }
      const due = new Date(task.due_at);
      return !Number.isNaN(due.getTime()) && due >= now && due <= weekEnd;
    }).length;
    summary.rejected = visibleTasks.filter((task) => task.status === 'REJECTED').length;
    summary.completed = visibleTasks.filter((task) => task.current_stage === 'DONE' || task.completed_at).length;
    summary.unreadNotifications = Number((await get(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    )).count || 0);

    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/tasks', auth, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 50);
    const visibility = buildTaskVisibility(req, 't');
    const where = [...visibility.where];
    const params = [...visibility.params];
    addTaskSearchFilters(where, params, req.query.q);
    addTaskStructuredFilters(where, params, req.query);
    const whereSql = where.join(' AND ');

    let rows = await all(
      `SELECT t.id, t.code, t.title, t.description, t.project_name, t.customer_name,
              t.current_stage, t.status, t.due_at, t.completed_at, t.created_at, t.created_by AS created_by_id,
              u.username AS created_by,
              a.username AS assignee, a.id AS assignee_id
       FROM tasks t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assignee_id
       WHERE ${whereSql}
       ORDER BY t.created_at DESC`,
      params
    );

    rows = withSla(rows);
    if (req.query.sla) {
      rows = rows.filter((item) => item.sla_status === req.query.sla);
    }

    if (!hasPaginationQuery(req.query)) {
      return res.json(rows);
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return res.json({
      items: rows.slice(start, start + pageSize),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks', auth, requireRole('KINH_DOANH'), uploadMultiple, async (req, res) => {
  try {
    if (req.uploadValidationError) {
      return res.status(400).json({ message: req.uploadValidationError });
    }

    const { projectName, customerName, description, dueAt } = req.body;
    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ message: 'Ten du an la bat buoc' });
    }

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ message: 'Khach hang la bat buoc' });
    }

    const proposalFile = req.files && req.files.proposalFile && req.files.proposalFile[0];
    if (!proposalFile) {
      return res.status(400).json({ message: 'Phieu de nghi la bat buoc' });
    }

    const code = makeTaskCode();
    const normalizedDueAt = normalizeDueAt(dueAt);
    const created = await run(
      `INSERT INTO tasks (code, title, description, project_name, customer_name, due_at, current_stage, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        code,
        projectName.trim(),
        (description || '').trim(),
        projectName.trim(),
        customerName.trim(),
        normalizedDueAt,
        'KINH_DOANH',
        'PENDING',
        req.user.id,
      ]
    );

    const taskId = created.lastID;

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        null,
        'KINH_DOANH',
        'CREATE',
        `${req.user.username} da tao ho so ${code} cho khach hang ${customerName.trim()}`,
        req.user.id,
      ]
    );

    const proposalStoredFile = await saveUploadedFile(proposalFile);

    // Upload proposal file
    await run(
      `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        req.user.id,
        'KINH_DOANH',
        proposalStoredFile.fileName,
        proposalStoredFile.storagePath,
        proposalStoredFile.mimeType,
        proposalStoredFile.fileSize,
      ]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        'KINH_DOANH',
        'KINH_DOANH',
        'UPLOAD',
        `${req.user.username} da upload Phieu de nghi cho ho so ${code}`,
        req.user.id,
      ]
    );

    // Upload document files
    const documentFiles = req.files && req.files.documentFiles || [];
    if (documentFiles.length > 0) {
      for (const docFile of documentFiles) {
        const storedDocFile = await saveUploadedFile(docFile);
        await run(
          `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            req.user.id,
            'KINH_DOANH',
            storedDocFile.fileName,
            storedDocFile.storagePath,
            storedDocFile.mimeType,
            storedDocFile.fileSize,
          ]
        );
      }

      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          'KINH_DOANH',
          'KINH_DOANH',
          'UPLOAD',
          `${req.user.username} da upload ${documentFiles.length} tai lieu cho ho so ${code}`,
          req.user.id,
        ]
      );
    }

    const createdTask = await get(
      `SELECT id, code, title, description, project_name, customer_name, due_at, current_stage, status, created_at
       FROM tasks
       WHERE id = ?`,
      [taskId]
    );

    return res.status(201).json({ message: 'Tao ho so thanh cong', task: createdTask });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/tasks/:taskId', auth, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(404).json({ message: 'Ho so khong ton tai' });
    }

    const result = await getTaskById(taskId, req.user);
    if (result.error) {
      return res.status(result.error).json({ message: result.message });
    }

    return res.json(result.task);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/tasks/:taskId/detail', auth, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(404).json({ message: 'Ho so khong ton tai' });
    }

    const detail = await getTaskById(taskId, req.user);
    if (detail.error) {
      return res.status(detail.error).json({ message: detail.message });
    }

    const attachments = await all(
      `SELECT id, file_name, storage_path, stage, file_size, uploaded_at
       FROM attachments
       WHERE task_id = ?
       ORDER BY uploaded_at DESC`,
      [taskId]
    );

    const logs = await all(
      `SELECT tl.id, tl.from_stage, tl.to_stage, tl.action, tl.note, tl.changed_at, u.username AS changed_by
       FROM task_logs tl
       JOIN users u ON u.id = tl.changed_by
       WHERE tl.task_id = ?
       ORDER BY tl.changed_at DESC`,
      [taskId]
    );

    const response = {
      id: detail.task.id,
      code: detail.task.code,
      title: detail.task.title,
      description: detail.task.description,
      project_name: detail.task.project_name,
      customer_name: detail.task.customer_name,
      status: detail.task.status,
      current_stage: detail.task.current_stage,
      workflow_status: detail.task.workflow_status,
      sla_status: detail.task.sla_status,
      due_at: detail.task.due_at,
      completed_at: detail.task.completed_at,
      created_at: detail.task.created_at,
      created_by_username: detail.task.created_by_username,
      assignee_id: detail.task.assignee_id,
      assignee_username: detail.task.assignee_username,
      attachments: attachments.map((item) => buildAttachmentResponse(req, item)),
      logs,
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/users/reviewers', auth, requireRole('ADMIN', 'TP_DUYET'), async (_, res) => {
  try {
    const reviewers = await all(
      `SELECT id, username, full_name, email
       FROM users
       WHERE role = 'THAM_DINH' AND is_active = 1
       ORDER BY full_name ASC`
    );
    return res.json(reviewers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/admin/users', auth, requireRole('ADMIN'), async (_, res) => {
  try {
    const users = await all(
      `SELECT id, username, full_name, email, role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/admin/users', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { username, password, fullName, email, role } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ message: 'Ten dang nhap la bat buoc' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Mat khau toi thieu 6 ky tu' });
    }
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: 'Ho ten la bat buoc' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email la bat buoc' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Vai tro khong hop le' });
    }

    const existed = await get('SELECT id FROM users WHERE username = ? OR email = ?', [username.trim(), email.trim()]);
    if (existed) {
      return res.status(409).json({ message: 'Ten dang nhap hoac email da ton tai' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const created = await run(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      [username.trim(), hash, fullName.trim(), email.trim(), role]
    );

    const user = await get(
      `SELECT id, username, full_name, email, role, is_active, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [created.lastID]
    );

    return res.status(201).json({ message: 'Tao user thanh cong', user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put('/api/admin/users/:userId', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'User khong hop le' });
    }

    const existing = await get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    const { username, fullName, email, role, isActive, password } = req.body;
    const sets = [];
    const params = [];

    if (typeof username === 'string') {
      if (!username.trim()) {
        return res.status(400).json({ message: 'Ten dang nhap khong duoc de trong' });
      }
      const conflict = await get('SELECT id FROM users WHERE username = ? AND id <> ?', [username.trim(), userId]);
      if (conflict) {
        return res.status(409).json({ message: 'Ten dang nhap da ton tai' });
      }
      sets.push('username = ?');
      params.push(username.trim());
    }

    if (typeof fullName === 'string') {
      if (!fullName.trim()) {
        return res.status(400).json({ message: 'Ho ten khong duoc de trong' });
      }
      sets.push('full_name = ?');
      params.push(fullName.trim());
    }

    if (typeof email === 'string') {
      if (!email.trim()) {
        return res.status(400).json({ message: 'Email khong duoc de trong' });
      }
      const conflict = await get('SELECT id FROM users WHERE email = ? AND id <> ?', [email.trim(), userId]);
      if (conflict) {
        return res.status(409).json({ message: 'Email da ton tai' });
      }
      sets.push('email = ?');
      params.push(email.trim());
    }

    if (typeof role !== 'undefined') {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Vai tro khong hop le' });
      }
      sets.push('role = ?');
      params.push(role);
    }

    if (typeof isActive !== 'undefined') {
      sets.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (typeof password === 'string') {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Mat khau toi thieu 6 ky tu' });
      }
      const hash = await bcrypt.hash(password, 10);
      sets.push('password_hash = ?');
      params.push(hash);
    }

    if (!sets.length) {
      return res.status(400).json({ message: 'Khong co du lieu can cap nhat' });
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    const user = await get(
      `SELECT id, username, full_name, email, role, is_active, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [userId]
    );

    return res.json({ message: 'Cap nhat user thanh cong', user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.delete('/api/admin/users/:userId', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'User khong hop le' });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ message: 'Khong the xoa chinh tai khoan dang dang nhap' });
    }

    const existing = await get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    const refs = await get(
      `SELECT
          (SELECT COUNT(*) FROM tasks WHERE created_by = ? OR assignee_id = ? OR approved_by = ?) AS task_ref,
          (SELECT COUNT(*) FROM task_logs WHERE changed_by = ?) AS log_ref,
          (SELECT COUNT(*) FROM attachments WHERE uploaded_by = ?) AS att_ref`,
      [userId, userId, userId, userId, userId]
    );

    const hasRef = Number(refs?.task_ref || 0) > 0 || Number(refs?.log_ref || 0) > 0 || Number(refs?.att_ref || 0) > 0;

    if (hasRef) {
      await run('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
      return res.json({ message: 'User da duoc vo hieu hoa do co du lieu lien quan' });
    }

    await run('DELETE FROM users WHERE id = ?', [userId]);
    return res.json({ message: 'Xoa user thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/admin/tasks', auth, requireRole('ADMIN'), uploadMultiple, async (req, res) => {
  try {
    if (req.uploadValidationError) {
      return res.status(400).json({ message: req.uploadValidationError });
    }

    const { projectName, customerName, description, dueAt, currentStage, status, assigneeId } = req.body;

    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ message: 'Ten du an la bat buoc' });
    }
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ message: 'Khach hang la bat buoc' });
    }

    const stage = VALID_TASK_STAGES.includes(currentStage) ? currentStage : 'KINH_DOANH';
    const taskStatus = VALID_TASK_STATUS.includes(status) ? status : 'PENDING';
    const normalizedDueAt = normalizeDueAt(dueAt);
    let validAssigneeId = null;

    if (assigneeId) {
      const assignee = await get('SELECT id, role, is_active FROM users WHERE id = ?', [Number(assigneeId)]);
      if (!assignee || !assignee.is_active) {
        return res.status(400).json({ message: 'Nguoi duoc giao khong hop le' });
      }
      validAssigneeId = assignee.id;
    }

    const code = makeTaskCode();
    const created = await run(
      `INSERT INTO tasks (code, title, description, project_name, customer_name, due_at, current_stage, status, created_by, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        code,
        projectName.trim(),
        (description || '').trim(),
        projectName.trim(),
        customerName.trim(),
        normalizedDueAt,
        stage,
        taskStatus,
        req.user.id,
        validAssigneeId,
      ]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        created.lastID,
        null,
        stage,
        'ADMIN_CREATE_TASK',
        `${req.user.username} tao ho so ${code}`,
        req.user.id,
      ]
    );

    const proposalFile = req.files && req.files.proposalFile && req.files.proposalFile[0];
    if (proposalFile) {
      const proposalStoredFile = await saveUploadedFile(proposalFile);
      await run(
        `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          created.lastID,
          req.user.id,
          stage,
          proposalStoredFile.fileName,
          proposalStoredFile.storagePath,
          proposalStoredFile.mimeType,
          proposalStoredFile.fileSize,
        ]
      );
      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [created.lastID, stage, stage, 'UPLOAD', `${req.user.username} da upload Phieu de nghi cho ho so ${code}`, req.user.id]
      );
    }

    const documentFiles = (req.files && req.files.documentFiles) || [];
    if (documentFiles.length > 0) {
      for (const docFile of documentFiles) {
        const storedDocFile = await saveUploadedFile(docFile);
        await run(
          `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            created.lastID,
            req.user.id,
            stage,
            storedDocFile.fileName,
            storedDocFile.storagePath,
            storedDocFile.mimeType,
            storedDocFile.fileSize,
          ]
        );
      }
      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [created.lastID, stage, stage, 'UPLOAD', `${req.user.username} da upload ${documentFiles.length} tai lieu cho ho so ${code}`, req.user.id]
      );
    }

    const task = await get('SELECT * FROM tasks WHERE id = ?', [created.lastID]);
    return res.status(201).json({ message: 'Tao ho so thanh cong', task });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
app.put('/api/admin/tasks/:taskId', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: 'Ho so khong hop le' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Ho so khong ton tai' });
    }

    const { projectName, customerName, description, dueAt, currentStage, status, assigneeId } = req.body;
    const sets = [];
    const params = [];

    if (typeof projectName === 'string') {
      if (!projectName.trim()) {
        return res.status(400).json({ message: 'Ten du an khong duoc de trong' });
      }
      sets.push('title = ?', 'project_name = ?');
      params.push(projectName.trim(), projectName.trim());
    }

    if (typeof customerName === 'string') {
      if (!customerName.trim()) {
        return res.status(400).json({ message: 'Khach hang khong duoc de trong' });
      }
      sets.push('customer_name = ?');
      params.push(customerName.trim());
    }

    if (typeof description === 'string') {
      sets.push('description = ?');
      params.push(description.trim());
    }

    if (typeof dueAt !== 'undefined') {
      sets.push('due_at = ?');
      params.push(normalizeDueAt(dueAt));
    }

    if (typeof currentStage !== 'undefined') {
      if (!VALID_TASK_STAGES.includes(currentStage)) {
        return res.status(400).json({ message: 'Cong doan khong hop le' });
      }
      sets.push('current_stage = ?');
      params.push(currentStage);
    }

    if (typeof status !== 'undefined') {
      if (!VALID_TASK_STATUS.includes(status)) {
        return res.status(400).json({ message: 'Trang thai khong hop le' });
      }
      sets.push('status = ?');
      params.push(status);
    }

    if (typeof assigneeId !== 'undefined') {
      if (assigneeId === null || assigneeId === '') {
        sets.push('assignee_id = NULL');
      } else {
        const assignee = await get('SELECT id, is_active FROM users WHERE id = ?', [Number(assigneeId)]);
        if (!assignee || !assignee.is_active) {
          return res.status(400).json({ message: 'Nguoi duoc giao khong hop le' });
        }
        sets.push('assignee_id = ?');
        params.push(Number(assigneeId));
      }
    }

    if (!sets.length) {
      return res.status(400).json({ message: 'Khong co du lieu can cap nhat' });
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(taskId);
    await run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        updated.current_stage,
        'ADMIN_UPDATE_TASK',
        `${req.user.username} cap nhat ho so ${updated.code}`,
        req.user.id,
      ]
    );

    return res.json({ message: 'Cap nhat ho so thanh cong', task: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.delete('/api/admin/tasks/:taskId', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: 'Ho so khong hop le' });
    }

    const task = await get('SELECT id, code, current_stage FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Ho so khong ton tai' });
    }

    await run(
      `UPDATE tasks
       SET is_deleted = 1,
           deleted_at = CURRENT_TIMESTAMP,
           deleted_by = ?,
           delete_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, 'Admin luu tru ho so', taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        task.current_stage,
        'ARCHIVE_TASK',
        `${req.user.username} da luu tru ho so ${task.code}`,
        req.user.id,
      ]
    );

    return res.json({ message: `Da luu tru ho so ${task.code}` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/assign', auth, requireRole('ADMIN', 'TP_DUYET'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const { reviewerIds } = req.body; // Now accepts array of reviewer IDs

    const task = await get('SELECT id, code, current_stage FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    // Handle both single ID (backward compatibility) and array
    const ids = Array.isArray(reviewerIds) ? reviewerIds : [reviewerIds];
    if (ids.length === 0) {
      return res.status(400).json({ message: 'Phai chi dinh it nhat 1 tham dinh vien' });
    }

    // Validate all reviewers
    const reviewers = [];
    for (const id of ids) {
      const reviewer = await get(
        `SELECT id, username, full_name, role, is_active FROM users WHERE id = ?`,
        [Number(id)]
      );
      if (!reviewer || reviewer.role !== 'THAM_DINH' || !reviewer.is_active) {
        return res.status(400).json({ message: `Tham dinh vien ID ${id} khong hop le` });
      }
      reviewers.push(reviewer);
    }

    // Set assignee_id to the first reviewer (for backward compatibility)
    const primaryReviewerId = reviewers[0].id;
    
    // Update task
    await run(
      `UPDATE tasks
       SET assignee_id = ?, current_stage = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [primaryReviewerId, 'THAM_DINH', 'IN_PROGRESS', taskId]
    );

    // Clear existing assignees for this task (if any)
    await run(`DELETE FROM task_assignees WHERE task_id = ?`, [taskId]);

    // Add all reviewers to task_assignees
    for (const reviewer of reviewers) {
      await run(
        `INSERT INTO task_assignees (task_id, user_id, assigned_by)
         VALUES (?, ?, ?)`,
        [taskId, reviewer.id, req.user.id]
      );
    }

    const reviewerNames = reviewers.map((r) => r.username).join(', ');
    
    // Log the assignment
    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        'THAM_DINH',
        'ASSIGN',
        `${req.user.username} da chuyen ho so ${task.code} cho ${reviewers.length > 1 ? `nhom ${reviewers.length} tham dinh vien` : `${reviewerNames}`}`,
        req.user.id,
      ]
    );

    await safeCreateNotifications(reviewers.map((reviewer) => ({
      userId: reviewer.id,
      taskId,
      type: 'TASK_ASSIGNED',
      title: `Ho so ${task.code} vua duoc giao`,
      message: `${req.user.username} da giao ho so ${task.code} cho ban xu ly.`,
    })));

    return res.json({ 
      message: `Chi dinh ${reviewers.length} tham dinh vien thanh cong`,
      assignees: reviewers.map((r) => ({ id: r.id, username: r.username, full_name: r.full_name }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/upload-appraisal', auth, requireRole('THAM_DINH'), upload.single('appraisalFile'), async (req, res) => {
  try {
    if (req.uploadValidationError) {
      return res.status(400).json({ message: req.uploadValidationError });
    }

    const taskId = Number(req.params.taskId);
    const { note } = req.body;

    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (Number(task.assignee_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Ban chi duoc upload ket qua cho ho so duoc giao' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Can upload file ket qua tham dinh' });
    }

    const appraiser = await get(
      `SELECT id, username
       FROM users
       WHERE role = 'THAM_DINH_VIEN' AND is_active = 1
       ORDER BY id ASC
       LIMIT 1`
    );

    if (!appraiser) {
      return res.status(400).json({ message: 'Khong co tham dinh vien dang hoat dong de ban giao' });
    }

    const storedAppraisalFile = await saveUploadedFile(req.file);

    await run(
      `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)` ,
      [
        taskId,
        req.user.id,
        'THAM_DINH',
        storedAppraisalFile.fileName,
        storedAppraisalFile.storagePath,
        storedAppraisalFile.mimeType,
        storedAppraisalFile.fileSize,
      ]
    );

    await run(
      `INSERT INTO task_assignees (task_id, user_id, assigned_by)
       SELECT ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1
         FROM task_assignees
         WHERE task_id = ? AND user_id = ?
       )`,
      [taskId, appraiser.id, req.user.id, taskId, appraiser.id]
    );

    // Hand off to THAM_DINH_VIEN while keeping the task in progress.
    await run(
      `UPDATE tasks
       SET status = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['IN_PROGRESS', appraiser.id, taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        task.current_stage,
        'UPLOAD_APPRAISAL_FILE',
        note && note.trim()
          ? note.trim()
          : `${req.user.username} da upload ket qua tham dinh cho ho so ${task.code}`,
        req.user.id,
      ]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        task.current_stage,
        'HANDOFF_TO_APPRAISER',
        `${req.user.username} ban giao ho so ${task.code} cho tham dinh vien ${appraiser.username}`,
        req.user.id,
      ]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        task.current_stage,
        'APPRAISAL_COMPLETED',
        `${req.user.username} da hoan thanh cong doan tham dinh cho ho so ${task.code}`,
        req.user.id,
      ]
    );

    await safeCreateNotification({
      userId: appraiser.id,
      taskId,
      type: 'TASK_HANDOFF',
      title: `Ho so ${task.code} can danh gia`,
      message: `${req.user.username} da ban giao ho so ${task.code} cho ban danh gia ket qua tham dinh.`,
    });

    return res.json({ message: 'Upload ket qua tham dinh thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/review', auth, requireRole('THAM_DINH_VIEN'), upload.single('reviewFile'), async (req, res) => {
  try {
    if (req.uploadValidationError) {
      return res.status(400).json({ message: req.uploadValidationError });
    }

    const taskId = Number(req.params.taskId);
    const { result, note } = req.body;

    if (!['DAT', 'KHONG_DAT'].includes(result)) {
      return res.status(400).json({ message: 'Ket qua phai la DAT hoac KHONG_DAT' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (Number(task.assignee_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Ban chi duoc danh gia ho so duoc giao' });
    }

    const taskReviewer = await get(
      `SELECT u.id, u.username, u.email
       FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ? AND u.role = 'THAM_DINH' AND u.is_active = 1
       ORDER BY ta.assigned_at ASC
       LIMIT 1`,
      [taskId]
    );

    if (!taskReviewer) {
      return res.status(400).json({ message: 'Khong tim thay tham dinh de ban giao lai ho so' });
    }

    const nextStage = result === 'DAT' ? 'TP_DUYET' : 'THAM_DINH';
    const nextStatus = result === 'DAT' ? 'IN_PROGRESS' : 'REJECTED';
    const nextAssigneeId = result === 'DAT' ? task.assignee_id : taskReviewer.id;

    await run(
      `UPDATE tasks
       SET current_stage = ?, status = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextStage, nextStatus, nextAssigneeId, taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        nextStage,
        result === 'DAT' ? 'APPRAISER_RESULT_PASS' : 'APPRAISER_RESULT_FAIL',
        result === 'DAT'
          ? `${req.user.username} danh gia DAT va chuyen ho so ${task.code} sang TP_DUYET`
          : `${req.user.username} danh gia KHONG DAT va tra lai ho so ${task.code} cho ${taskReviewer.username} lam lai`,
        req.user.id,
      ]
    );

    if (result === 'KHONG_DAT') {
      await run(
        `DELETE FROM task_assignees
         WHERE task_id = ? AND user_id = ?`,
        [taskId, req.user.id]
      );

      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [
          taskId,
          'THAM_DINH',
          'THAM_DINH',
          'RETURN_TO_REVIEWER',
          `${req.user.username} yeu cau ${taskReviewer.username} bo sung va lam lai ho so ${task.code}`,
          req.user.id,
        ]
      );

      if (taskReviewer.email) {
        await safeSendTaskStageEmail({
          to: taskReviewer.email,
          taskCode: task.code,
          fromStage: 'THAM_DINH_VIEN',
          toStage: 'THAM_DINH',
        });
      }

      await safeCreateNotification({
        userId: taskReviewer.id,
        taskId,
        type: 'TASK_REJECTED',
        title: `Ho so ${task.code} khong dat`,
        message: `${req.user.username} danh gia khong dat. Ban can bo sung va lam lai ho so nay.`,
      });
    } else {
      const managers = await all(
        `SELECT id FROM users
         WHERE role = 'TP_DUYET' AND is_active = 1`
      );
      await safeCreateNotifications(managers.map((manager) => ({
        userId: manager.id,
        taskId,
        type: 'TASK_READY_FOR_APPROVAL',
        title: `Ho so ${task.code} cho duyet`,
        message: `${req.user.username} da danh gia dat va chuyen ho so sang Truong phong duyet.`,
      })));
    }

    if (req.file) {
      const storedReviewFile = await saveUploadedFile(req.file);
      await run(
        `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)` ,
        [
          taskId,
          req.user.id,
          'THAM_DINH',
          storedReviewFile.fileName,
          storedReviewFile.storagePath,
          storedReviewFile.mimeType,
          storedReviewFile.fileSize,
        ]
      );

      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [
          taskId,
          'THAM_DINH',
          nextStage,
          'UPLOAD_APPRAISER_FILE',
          `${req.user.username} da upload file ket qua tham dinh vien cho ho so ${task.code}`,
          req.user.id,
        ]
      );
    }

    if (note && note.trim()) {
      await run(
        `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, 'THAM_DINH', nextStage, 'APPRAISER_NOTE', note.trim(), req.user.id]
      );
    }

    return res.json({ message: 'Danh gia ho so thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/approval', auth, requireRole('TP_DUYET'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const { decision, note } = req.body;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      return res.status(400).json({ message: 'Decision khong hop le' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (!(task.current_stage === 'TP_DUYET' && task.status === 'IN_PROGRESS')) {
      return res.status(400).json({ message: 'Ho so khong o trang thai cho duyet' });
    }

    const toStage = 'KINH_DOANH';
    const toStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await run(
      `UPDATE tasks
       SET current_stage = ?, status = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [toStage, toStatus, req.user.id, taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        'TP_DUYET',
        toStage,
        decision === 'APPROVE' ? 'MANAGER_APPROVE' : 'MANAGER_REJECT',
        decision === 'APPROVE'
          ? `${req.user.username} da phe duyet ho so ${task.code} va chuyen lai Kinh doanh`
          : `${req.user.username} da tu choi ho so ${task.code}${note ? ` - ${note}` : ''}`,
        req.user.id,
      ]
    );

    await safeCreateNotification({
      userId: task.created_by,
      taskId,
      type: decision === 'APPROVE' ? 'TASK_APPROVED' : 'TASK_MANAGER_REJECTED',
      title: decision === 'APPROVE' ? `Ho so ${task.code} da duoc duyet` : `Ho so ${task.code} bi tu choi`,
      message: decision === 'APPROVE'
        ? `${req.user.username} da phe duyet. Ban co the chuyen ho so sang in an.`
        : `${req.user.username} da tu choi ho so. Vui long kiem tra ghi chu va xu ly lai.`,
    });

    return res.json({ message: decision === 'APPROVE' ? 'Phe duyet thanh cong' : 'Tu choi ho so thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/to-print', auth, requireRole('KINH_DOANH'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (Number(task.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Ban chi duoc chuyen in an ho so cua minh' });
    }

    if (!(task.current_stage === 'KINH_DOANH' && task.status === 'APPROVED')) {
      return res.status(400).json({ message: 'Ho so chua du dieu kien chuyen in an' });
    }

    await run(
      `UPDATE tasks
       SET current_stage = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['IN_AN', 'IN_PROGRESS', taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        'KINH_DOANH',
        'IN_AN',
        'MOVE_PRINT',
        `${req.user.username} da chuyen ho so ${task.code} sang bo phan In an`,
        req.user.id,
      ]
    );

    const printers = await all(
      `SELECT id FROM users
       WHERE role = 'IN_AN' AND is_active = 1`
    );
    await safeCreateNotifications(printers.map((printer) => ({
      userId: printer.id,
      taskId,
      type: 'TASK_READY_TO_PRINT',
      title: `Ho so ${task.code} can in an`,
      message: `${req.user.username} da chuyen ho so ${task.code} sang bo phan in an.`,
    })));

    return res.json({ message: 'Chuyen in an thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/complete-print', auth, requireRole('IN_AN'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (!(task.current_stage === 'IN_AN' && task.status === 'IN_PROGRESS')) {
      return res.status(400).json({ message: 'Ho so khong o trang thai in an de hoan tat' });
    }

    await run(
      `UPDATE tasks
       SET current_stage = ?, status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['DONE', 'APPROVED', taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        'IN_AN',
        'DONE',
        'COMPLETE_PRINT',
        `${req.user.username} da hoan tat in an cho ho so ${task.code}`,
        req.user.id,
      ]
    );

    await safeCreateNotification({
      userId: task.created_by,
      taskId,
      type: 'TASK_COMPLETED',
      title: `Ho so ${task.code} da hoan tat`,
      message: `${req.user.username} da hoan tat in an cho ho so ${task.code}.`,
    });

    return res.json({ message: 'Hoan tat in an thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/attachments', auth, upload.single('file'), async (req, res) => {
  try {
    if (req.uploadValidationError) {
      return res.status(400).json({ message: req.uploadValidationError });
    }

    const taskId = Number(req.params.taskId);
    const task = await get('SELECT id, current_stage FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Can upload file dinh kem' });
    }

    const storedAttachment = await saveUploadedFile(req.file);

    await run(
      `INSERT INTO attachments (task_id, uploaded_by, stage, file_name, storage_path, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        req.user.id,
        task.current_stage,
        storedAttachment.fileName,
        storedAttachment.storagePath,
        storedAttachment.mimeType,
        storedAttachment.fileSize,
      ]
    );

    return res.status(201).json({ message: 'Upload thanh cong', file: storedAttachment.storagePath });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/attachments/:attachmentId/download', auth, async (req, res) => {
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ message: 'File khong hop le' });
    }

    const attachment = await get(
      `SELECT a.*, t.id AS task_id, t.created_by, t.assignee_id, t.current_stage,
              COALESCE(array_agg(ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assigned_user_ids
       FROM attachments a
       JOIN tasks t ON t.id = a.task_id
       LEFT JOIN task_assignees ta ON ta.task_id = t.id
       WHERE a.id = ? AND COALESCE(t.is_deleted, 0) = 0
       GROUP BY a.id, t.id`,
      [attachmentId]
    );

    if (!attachment) {
      return res.status(404).json({ message: 'Khong tim thay file' });
    }

    if (!canViewTaskByRole(attachment, req.user)) {
      return res.status(403).json({ message: 'Khong co quyen tai file nay' });
    }

    if (!/^https?:\/\//i.test(attachment.storage_path || '')) {
      const localPath = path.join(uploadDir, attachment.storage_path);
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ message: 'Khong tim thay file vat ly' });
      }
      return res.download(localPath, attachment.file_name);
    }

    if (!attachment.storage_path.includes('.private.blob.vercel-storage.com')) {
      return res.redirect(attachment.storage_path);
    }

    const { get: getBlob } = await import('@vercel/blob');
    const pathname = new URL(attachment.storage_path).pathname.replace(/^\//, '');
    const result = await getBlob(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) {
      return res.status(404).json({ message: 'Khong tim thay file tren Blob' });
    }

    res.setHeader('Content-Type', result.blob.contentType || attachment.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
    return Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
app.get('/api/tasks/:taskId/attachments', auth, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const detail = await getTaskById(taskId, req.user);
    if (detail.error) {
      return res.status(detail.error).json({ message: detail.message });
    }

    const rows = await all(
      `SELECT id, file_name, storage_path, stage, file_size, uploaded_at
       FROM attachments
       WHERE task_id = ?
       ORDER BY uploaded_at DESC`,
      [taskId]
    );

    const mapped = rows.map((item) => buildAttachmentResponse(req, item));
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/tasks/:taskId/move', auth, requireRole('ADMIN', 'TP_DUYET'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const { toStage, action, note } = req.body;
    if (!VALID_TASK_STAGES.includes(toStage)) {
      return res.status(400).json({ message: 'Cong doan khong hop le' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Task khong ton tai' });
    }

    await run('UPDATE tasks SET current_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [toStage, taskId]);

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, task.current_stage, toStage, action || 'MOVE_STAGE', note || '', req.user.id]
    );

    // Notify assignee or stakeholders when stage changes.
    if (req.user.email) {
      await safeSendTaskStageEmail({
        to: req.user.email,
        taskCode: task.code,
        fromStage: task.current_stage,
        toStage,
      });
    }

    return res.json({ message: 'Chuyen buoc thanh cong' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/tasks/:taskId/logs', auth, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const detail = await getTaskById(taskId, req.user);
    if (detail.error) {
      return res.status(detail.error).json({ message: detail.message });
    }

    const rows = await all(
      `SELECT tl.id, tl.from_stage, tl.to_stage, tl.action, tl.note, tl.changed_at, u.username AS changed_by
       FROM task_logs tl
       JOIN users u ON u.id = tl.changed_by
       WHERE tl.task_id = ?
       ORDER BY tl.changed_at DESC`,
      [taskId]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/logs', auth, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 50);
    const visibility = buildTaskVisibility(req, 't');
    const where = [...visibility.where];
    const params = [...visibility.params];
    const q = String(req.query.q || '').trim().toLowerCase();

    if (q) {
      const like = `%${q}%`;
      where.push(`(
        LOWER(t.code) LIKE ?
        OR LOWER(COALESCE(t.project_name, '')) LIKE ?
        OR LOWER(COALESCE(t.customer_name, '')) LIKE ?
        OR LOWER(tl.action) LIKE ?
        OR LOWER(COALESCE(tl.note, '')) LIKE ?
        OR LOWER(u.username) LIKE ?
      )`);
      params.push(like, like, like, like, like, like);
    }

    const whereSql = where.join(' AND ');
    const countRow = await get(
      `SELECT COUNT(*) AS count
       FROM task_logs tl
       JOIN users u ON u.id = tl.changed_by
       JOIN tasks t ON t.id = tl.task_id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const rows = await all(
      `SELECT tl.id, tl.task_id, t.code AS task_code, tl.from_stage, tl.to_stage, tl.action,
              tl.note, tl.changed_at, u.username AS changed_by
       FROM task_logs tl
       JOIN users u ON u.id = tl.changed_by
       JOIN tasks t ON t.id = tl.task_id
       WHERE ${whereSql}
       ORDER BY tl.changed_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    if (!req.query.page && !req.query.pageSize && !req.query.q) {
      return res.json(rows);
    }

    return res.json({
      items: rows,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT n.id, n.task_id, t.code AS task_code, n.type, n.title, n.message, n.is_read, n.created_at
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.patch('/api/notifications/:notificationId/read', auth, async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ message: 'Thong bao khong hop le' });
    }

    const updated = await run(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ? AND user_id = ?
       RETURNING id`,
      [notificationId, req.user.id]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Thong bao khong ton tai' });
    }

    return res.json({ message: 'Da danh dau da doc' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/admin/archived-tasks', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 50);
    const where = ['COALESCE(t.is_deleted, 0) = 1'];
    const params = [];
    addTaskSearchFilters(where, params, req.query.q);
    const whereSql = where.join(' AND ');
    const countRow = await get(
      `SELECT COUNT(*) AS count
       FROM tasks t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assignee_id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const rows = await all(
      `SELECT t.id, t.code, t.title, t.description, t.project_name, t.customer_name,
              t.current_stage, t.status, t.due_at, t.completed_at, t.created_at,
              t.deleted_at, t.delete_reason, t.created_by AS created_by_id,
              u.username AS created_by,
              a.username AS assignee, a.id AS assignee_id,
              d.username AS deleted_by_username
       FROM tasks t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users d ON d.id = t.deleted_by
       WHERE ${whereSql}
       ORDER BY t.deleted_at DESC NULLS LAST, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return res.json({
      items: withSla(rows),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/admin/tasks/:taskId/restore', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: 'Ho so khong hop le' });
    }

    const task = await get('SELECT id, code, current_stage FROM tasks WHERE id = ? AND COALESCE(is_deleted, 0) = 1', [taskId]);
    if (!task) {
      return res.status(404).json({ message: 'Ho so luu tru khong ton tai' });
    }

    await run(
      `UPDATE tasks
       SET is_deleted = 0,
           deleted_at = NULL,
           deleted_by = NULL,
           delete_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [taskId]
    );

    await run(
      `INSERT INTO task_logs (task_id, from_stage, to_stage, action, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        task.current_stage,
        task.current_stage,
        'RESTORE_TASK',
        `${req.user.username} da khoi phuc ho so ${task.code}`,
        req.user.id,
      ]
    );

    return res.json({ message: `Da khoi phuc ho so ${task.code}` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'tham-dinh-in-an' });
});

app.use((error, _, res, next) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `File vuot qua gioi han ${process.env.MAX_UPLOAD_MB || 25}MB`
      : error.message;
    return res.status(400).json({ message });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return next(error);
});

if (require.main === module) {
  ensureBootstrapStarted()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
      });
    })
    .catch((err) => {
      console.error('Bootstrap error:', err);
      process.exit(1);
    });
}

module.exports = app;






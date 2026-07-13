const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'app.js');
let content = fs.readFileSync(appPath, 'utf8');

// Fix 1: Update GET /api/tasks for THAM_DINH to check task_assignees
const oldThamDinhFilter = `    if (req.user.role === 'THAM_DINH') {
      // THAM_DINH can see:
      // 1. Tasks where they are the current assignee, OR
      // 2. Tasks in THAM_DINH stage (they may have handed off to THAM_DINH_VIEN but still need access)
      return res.json(rows.filter((item) => Number(item.assignee_id) === Number(req.user.id) || item.current_stage === 'THAM_DINH'));
    }`;

const newThamDinhFilter = `    if (req.user.role === 'THAM_DINH') {
      // THAM_DINH can see:
      // 1. Tasks where they are assigned (in task_assignees), OR
      // 2. Tasks where they are the current assignee, OR
      // 3. Tasks in THAM_DINH stage (they may have handed off to THAM_DINH_VIEN but still need access)
      (async () => {
        const assignedTasks = await all(
          \`SELECT DISTINCT task_id FROM task_assignees WHERE user_id = ?\`,
          [req.user.id]
        );
        const assignedTaskIds = new Set(assignedTasks.map((t) => t.task_id));
        return res.json(rows.filter((item) => assignedTaskIds.has(item.id) || Number(item.assignee_id) === Number(req.user.id) || item.current_stage === 'THAM_DINH'));
      })();
      return;
    }`;

// This won't work because of async, let me rewrite the entire GET /api/tasks endpoint
const getTasksStart = content.indexOf("app.get('/api/tasks', auth, async (req, res) => {");
const getTasksEnd = content.indexOf("app.post('/api/tasks', auth, requireRole('KINH_DOANH')");

if (getTasksStart !== -1 && getTasksEnd !== -1) {
  const newGetTasks = `app.get('/api/tasks', auth, async (req, res) => {
  try {
    const rows = await all(
      \`SELECT t.id, t.code, t.title, t.description, t.project_name, t.customer_name,
              t.current_stage, t.status, t.created_at, t.created_by AS created_by_id,
              u.username AS created_by,
              a.username AS assignee, a.id AS assignee_id
       FROM tasks t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assignee_id
       ORDER BY t.created_at DESC\`
    );

    if (req.user.role === 'KINH_DOANH') {
      return res.json(rows.filter((item) => item.created_by_id === req.user.id));
    }

    if (req.user.role === 'THAM_DINH') {
      // THAM_DINH can see:
      // 1. Tasks where they are assigned (in task_assignees), OR
      // 2. Tasks where they are the current assignee, OR
      // 3. Tasks in THAM_DINH stage (they may have handed off to THAM_DINH_VIEN but still need access)
      const assignedTasks = await all(
        \`SELECT DISTINCT task_id FROM task_assignees WHERE user_id = ?\`,
        [req.user.id]
      );
      const assignedTaskIds = new Set(assignedTasks.map((t) => t.task_id));
      return res.json(rows.filter((item) => assignedTaskIds.has(item.id) || Number(item.assignee_id) === Number(req.user.id) || item.current_stage === 'THAM_DINH'));
    }

    if (req.user.role === 'THAM_DINH_VIEN') {
      // THAM_DINH_VIEN can only see tasks where they are the current assignee
      return res.json(rows.filter((item) => Number(item.assignee_id) === Number(req.user.id)));
    }

    if (req.user.role === 'IN_AN') {
      return res.json(rows.filter((item) => ['IN_AN', 'DONE'].includes(item.current_stage)));
    }

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

`;

  content = content.substring(0, getTasksStart) + newGetTasks + content.substring(getTasksEnd);
}

// Fix 2: Update dashboard summary for THAM_DINH
const oldDashboardThamDinh = `    if (req.user.role === 'THAM_DINH') {
      // THAM_DINH can see tasks where they are assignee OR in THAM_DINH stage
      rows = await all(
        \`SELECT current_stage, COUNT(*) AS count
         FROM tasks
         WHERE assignee_id = ? OR current_stage = 'THAM_DINH'
         GROUP BY current_stage\`,
        [req.user.id]
      );`;

const newDashboardThamDinh = `    if (req.user.role === 'THAM_DINH') {
      // THAM_DINH can see tasks where they are assigned OR assignee OR in THAM_DINH stage
      rows = await all(
        \`SELECT t.current_stage, COUNT(DISTINCT t.id) AS count
         FROM tasks t
         LEFT JOIN task_assignees ta ON ta.task_id = t.id
         WHERE t.assignee_id = ? OR t.current_stage = 'THAM_DINH' OR (ta.user_id = ?)
         GROUP BY t.current_stage\`,
        [req.user.id, req.user.id]
      );`;

content = content.replace(oldDashboardThamDinh, newDashboardThamDinh);

fs.writeFileSync(appPath, content, 'utf8');
console.log('Fixed app.js successfully!');

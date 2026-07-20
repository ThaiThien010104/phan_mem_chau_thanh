const authToken = localStorage.getItem('authToken');
const authUser = JSON.parse(localStorage.getItem('authUser') || 'null');

if (!authToken || !authUser) {
  window.location.href = '/';
}

const roleMenus = {
  ADMIN: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
    { key: 'users', label: 'Người dùng' },
    { key: 'logs', label: 'Lịch sử hệ thống' },
  ],
  TP_DUYET: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
    { key: 'logs', label: 'Lịch sử hệ thống' },
  ],
  KINH_DOANH: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
  ],
  THAM_DINH: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
  ],
  THAM_DINH_VIEN: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
  ],
  IN_AN: [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'tasks', label: 'Danh sách hồ sơ' },
  ],
};

let currentTab = 'overview';
let tasksCache = [];
let reviewersCache = [];
let usersCache = [];
let selectedTaskId = null;

const stageLabels = {
  KINH_DOANH: 'Kinh doanh',
  THAM_DINH: 'Thẩm định',
  THAM_DINH_VIEN: 'Thẩm định viên',
  TP_DUYET: 'Trình báo thẩm định viên về giá',
  IN_AN: 'In ấn',
  DONE: 'Hoàn tất',
};

const statusLabels = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  APPROVED: 'Đã đạt',
  REJECTED: 'Không đạt',
  ON_HOLD: 'Tạm dừng',
};

const slaLabels = {
  no_due: 'Chua dat han',
  on_track: 'Dung han',
  due_soon: 'Sap den han',
  overdue: 'Qua han',
  completed: 'Da hoan tat',
};

const actionLabels = {
  CREATE: 'Tạo hồ sơ',
  UPLOAD: 'Tải lên phiếu đề nghị',
  ASSIGN: 'Giao thẩm định viên',
  REVIEW_RESULT: 'Trả kết quả thẩm định',
  REVIEW_REJECT: 'Kết luận không đạt',
  UPLOAD_REVIEW_FILE: 'Tải lên file kết quả thẩm định',
  REVIEW_NOTE: 'Ghi chú thẩm định',
  MOVE_PRINT: 'Chuyển In ấn',
  UPLOAD_APPRAISAL_FILE: 'Thẩm định tải file kết quả',
  APPRAISER_RESULT_PASS: 'Thẩm định viên đánh giá đạt',
  APPRAISER_RESULT_FAIL: 'Thẩm định viên đánh giá không đạt',
  UPLOAD_APPRAISER_FILE: 'Tải file kết quả thẩm định viên',
  APPRAISER_NOTE: 'Ghi chú thẩm định viên',
  APPRAISAL_COMPLETED: 'Hoàn thành công đoạn thẩm định',
  HANDOFF_TO_APPRAISER: 'Bàn giao hồ sơ cho thẩm định viên',
  RETURN_TO_REVIEWER: 'Trả hồ sơ cho thẩm định làm lại',
  COMPLETE_PRINT: 'Hoàn tất in ấn',
};

Object.assign(stageLabels, {
  KINH_DOANH: 'Kinh doanh',
  THAM_DINH: 'Thẩm định',
  THAM_DINH_VIEN: 'Thẩm định viên',
  TP_DUYET: 'Trưởng phòng duyệt',
  IN_AN: 'In ấn',
  DONE: 'Hoàn tất',
});

Object.assign(statusLabels, {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  APPROVED: 'Đã đạt',
  REJECTED: 'Không đạt',
  ON_HOLD: 'Tạm dừng',
});

Object.assign(slaLabels, {
  no_due: 'Chưa đặt hạn',
  on_track: 'Đúng hạn',
  due_soon: 'Sắp đến hạn',
  overdue: 'Quá hạn',
  completed: 'Đã hoàn tất',
});

Object.assign(actionLabels, {
  CREATE: 'Tạo hồ sơ',
  UPLOAD: 'Tải phiếu đề nghị',
  ASSIGN: 'Giao thẩm định',
  REVIEW_RESULT: 'Trả kết quả thẩm định',
  REVIEW_REJECT: 'Kết luận không đạt',
  UPLOAD_REVIEW_FILE: 'Tải file kết quả',
  REVIEW_NOTE: 'Ghi chú thẩm định',
  MOVE_PRINT: 'Chuyển in ấn',
  UPLOAD_APPRAISAL_FILE: 'Thẩm định tải file kết quả',
  APPRAISER_RESULT_PASS: 'Thẩm định viên đánh giá đạt',
  APPRAISER_RESULT_FAIL: 'Thẩm định viên đánh giá không đạt',
  UPLOAD_APPRAISER_FILE: 'Tải file kết quả thẩm định viên',
  APPRAISER_NOTE: 'Ghi chú thẩm định viên',
  APPRAISAL_COMPLETED: 'Hoàn thành công đoạn thẩm định',
  HANDOFF_TO_APPRAISER: 'Bàn giao cho thẩm định viên',
  RETURN_TO_REVIEWER: 'Trả hồ sơ cho thẩm định làm lại',
  COMPLETE_PRINT: 'Hoàn tất in ấn',
  ARCHIVE_TASK: 'Lưu trữ hồ sơ',
});

function labelStage(value) {
  return stageLabels[value] || value || '-';
}

function labelStatus(value) {
  return statusLabels[value] || value || '-';
}

function labelAction(value) {
  return actionLabels[value] || value || '-';
}

function setCount(id, value) {
  document.getElementById(id).textContent = `${value} hồ sơ`;
}

function decodeMojibakeText(text) {
  if (!/[ÃÄÆÂâ]|á[º»]/.test(text)) {
    return text;
  }

  const bytes = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 255) {
      return text;
    }
    bytes.push(code);
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decoded || text;
  } catch {
    return text;
  }
}

function fixMojibakeInDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  nodes.forEach((node) => {
    node.nodeValue = decodeMojibakeText(node.nodeValue)
      .replaceAll('Xóa hồ sơ', 'Lưu trữ hồ sơ')
      .replaceAll('Han xu ly', 'Hạn xử lý')
      .replaceAll('Chua dat han', 'Chưa đặt hạn')
      .replaceAll('Dung han', 'Đúng hạn')
      .replaceAll('Sap den han', 'Sắp đến hạn')
      .replaceAll('Qua han', 'Quá hạn')
      .replaceAll('Da hoan tat', 'Đã hoàn tất');
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  fixMojibakeInDom(modal);
}

function hideModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${authToken}` };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Yêu cầu thất bại');
  }
  return data;
}

async function apiForm(url, formData) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Yeu cau that bai');
  }
  return data;
}
function formatDate(sqlDateTime) {
  if (!sqlDateTime) {
    return '-';
  }

  const date = new Date(sqlDateTime.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return sqlDateTime;
  }

  return date.toLocaleString('vi-VN');
}

function statusBadgeClass(status) {
  const map = {
    PENDING: 'bg-amber-100 text-amber-800',
    IN_PROGRESS: 'bg-sky-100 text-sky-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-rose-100 text-rose-800',
    ON_HOLD: 'bg-slate-200 text-slate-700',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

function slaBadgeClass(status) {
  const map = {
    no_due: 'bg-slate-100 text-slate-700',
    on_track: 'bg-emerald-100 text-emerald-800',
    due_soon: 'bg-amber-100 text-amber-800',
    overdue: 'bg-rose-100 text-rose-800',
    completed: 'bg-slate-200 text-slate-700',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

function formatDateInput(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function renderTaskCard(task) {
  const canAssignRoles = ['ADMIN', 'TP_DUYET'];
  const canAssign = canAssignRoles.includes(authUser.role) && ['KINH_DOANH', 'THAM_DINH'].includes(task.current_stage);
  const canUploadAppraisal =
    authUser.role === 'THAM_DINH' && Number(task.assignee_id) === Number(authUser.id) && task.current_stage === 'THAM_DINH';
  const canReview =
    authUser.role === 'THAM_DINH_VIEN' && Number(task.assignee_id) === Number(authUser.id) && task.current_stage === 'THAM_DINH';
  const canAdminEdit = authUser.role === 'ADMIN';

  let actionHtml = '';
  if (canAssign) {
    actionHtml = `<button data-action="assign" data-task-id="${task.id}" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">Chỉ định thẩm định viên</button>`;
  }
  if (canReview) {
    actionHtml = `<button data-action="review" data-task-id="${task.id}" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">Đánh giá hồ sơ</button>`;
  }
  if (canUploadAppraisal) {
    actionHtml = `<button data-action="upload-appraisal" data-task-id="${task.id}" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">Tải kết quả thẩm định</button>`;
  }

  let adminTaskActionHtml = '';
  if (canAdminEdit) {
    adminTaskActionHtml = `
      <div class="mt-2 flex items-center gap-2">
        <button data-action="edit-task" data-task-id="${task.id}" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">Sửa hồ sơ</button>
        <button data-action="delete-task" data-task-id="${task.id}" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Xóa hồ sơ</button>
      </div>
    `;
  }

  const displayStatus = task.current_stage === 'THAM_DINH' && task.status === 'APPROVED' ? 'Đã hoàn thành' : labelStatus(task.status);

  const dueLabel = task.due_at ? formatDate(task.due_at) : 'Chua dat han';
  const slaStatus = task.sla_status || 'no_due';

  return `
    <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p class="text-xs font-extrabold tracking-wide text-brand-700">${escapeHtml(task.code)}</p>
      <h4 class="mt-2 text-base font-bold text-slate-900">${escapeHtml(task.project_name || task.title || 'Không có tiêu đề')}</h4>
      <p class="mt-1 text-sm text-slate-500">Khách hàng: <span class="font-semibold text-slate-700">${escapeHtml(task.customer_name || '-')}</span></p>
      <p class="mt-2 text-sm text-slate-500">Người tạo: <span class="font-semibold text-slate-700">${escapeHtml(task.created_by || '-')}</span></p>
      <p class="mt-1 text-sm text-slate-500">Ngày tạo: <span class="font-semibold text-slate-700">${escapeHtml(formatDate(task.created_at))}</span></p>
      <div class="mt-3 flex items-center justify-between gap-2">
        <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(task.status)}">${escapeHtml(displayStatus)}</span>
        <span class="text-xs font-semibold text-slate-500">${escapeHtml(labelStage(task.current_stage))}</span>
      </div>
      <div class="mt-3 flex items-center justify-between gap-2">
        <a href="/task/${task.id}" class="text-xs font-bold text-brand-700 hover:underline">Xem chi tiết</a>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-slate-500">Han xu ly: ${escapeHtml(dueLabel)}</span>
        <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${slaBadgeClass(slaStatus)}">${escapeHtml(slaLabels[slaStatus] || slaStatus)}</span>
      </div>
      ${actionHtml ? `<div class="mt-3">${actionHtml}</div>` : ''}
      ${adminTaskActionHtml}
    </article>
  `;
}

function renderUserCard(user) {
  const roleClass = user.is_active ? 'text-emerald-700' : 'text-slate-400';
  const statusClass = user.is_online ? 'user-status--active' : 'user-status--inactive';
  const statusLabel = user.is_online ? 'Đang online' : 'Không online';
  const accountLabel = user.is_active ? 'Tài khoản hoạt động' : 'Tài khoản bị khóa';
  return `
    <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-bold text-slate-900">${escapeHtml(user.full_name || user.username)}</p>
          <p class="mt-1 text-xs text-slate-500">@${escapeHtml(user.username)}</p>
        </div>
        <span class="user-status ${statusClass}">${statusLabel}</span>
      </div>
      <p class="mt-1 text-xs text-slate-500">${escapeHtml(user.email)}</p>
      <p class="mt-2 text-xs font-bold ${roleClass}">${escapeHtml(user.role)} - ${accountLabel}</p>
      <div class="mt-3 flex items-center gap-2">
        <button data-action="edit-user" data-user-id="${user.id}" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">Sửa</button>
        <button data-action="delete-user" data-user-id="${user.id}" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Xóa</button>
      </div>
    </article>
  `;
}

function renderMenu() {
  const menuItems = roleMenus[authUser.role] || [{ key: 'overview', label: 'Tổng quan' }];
  const menu = document.getElementById('menu-list');
  menu.innerHTML = menuItems
    .map(
      (item) =>
        `<li><button data-tab="${item.key}" class="menu-btn w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100 ${
          item.key === currentTab ? 'bg-brand-50 text-brand-700' : ''
        }">${item.label}</button></li>`
    )
    .join('');

  menu.querySelectorAll('button[data-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      currentTab = button.dataset.tab;
      renderMenu();
      setActivePanel();
      if (currentTab === 'logs') {
        await loadLogs();
      }
      if (currentTab === 'users') {
        await loadUsers();
      }
    });
  });
}

function setActivePanel() {
  const panelIds = ['overview', 'tasks', 'logs', 'users'];
  panelIds.forEach((panel) => {
    const el = document.getElementById(`panel-${panel}`);
    if (!el) {
      return;
    }
    el.classList.toggle('hidden', panel !== currentTab);
  });

  const labels = {
    overview: 'TỔNG QUAN',
    tasks: 'DANH SÁCH HỒ SƠ',
    users: 'NGƯỜI DÙNG',
    logs: 'LỊCH SỬ HỆ THỐNG',
  };
  document.getElementById('active-tab').textContent = labels[currentTab] || 'TỔNG QUAN';
}

function renderTaskPanels(tasks) {
  const overviewContainer = document.getElementById('overview-card-grid');
  const taskListContainer = document.getElementById('task-list-grid');
  const emptyBlock = '<p class="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm font-semibold text-slate-500">Chưa có hồ sơ</p>';

  if (!tasks.length) {
    overviewContainer.innerHTML = emptyBlock;
    taskListContainer.innerHTML = emptyBlock;
    return;
  }

  const cards = tasks.map(renderTaskCard).join('');
  overviewContainer.innerHTML = cards;
  taskListContainer.innerHTML = cards;
  fixMojibakeInDom(overviewContainer);
  fixMojibakeInDom(taskListContainer);
}

async function loadLogs() {
  const logsWrap = document.getElementById('logs-list');
  try {
    const logs = await api('/api/logs');
    if (!logs.length) {
      logsWrap.innerHTML = '<p class="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm font-semibold text-slate-500">Chưa có lịch sử</p>';
      return;
    }

    logsWrap.innerHTML = logs
      .map(
        (item) => `
          <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-bold text-slate-900">${escapeHtml(labelAction(item.action))} - ${escapeHtml(item.task_code)}</p>
              <p class="text-xs font-semibold text-slate-500">${escapeHtml(formatDate(item.changed_at))}</p>
            </div>
            <p class="mt-1 text-sm text-slate-600">Thực hiện bởi: <span class="font-semibold">${escapeHtml(item.changed_by)}</span></p>
            <p class="mt-1 text-sm text-slate-600">Chuyển bước: <span class="font-semibold">${escapeHtml(labelStage(item.from_stage))} -> ${escapeHtml(labelStage(item.to_stage))}</span></p>
            <p class="mt-1 text-sm text-slate-500">${escapeHtml(item.note || '')}</p>
          </article>
        `
      )
      .join('');
    fixMojibakeInDom(logsWrap);
  } catch (error) {
    logsWrap.innerHTML = `<p class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">${escapeHtml(error.message)}</p>`;
  }
}

async function loadUsers() {
  if (authUser.role !== 'ADMIN') {
    return;
  }

  const wrap = document.getElementById('users-list');
  try {
    usersCache = await api('/api/admin/users');
    if (!usersCache.length) {
      wrap.innerHTML = '<p class="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm font-semibold text-slate-500">Chưa có user</p>';
      return;
    }

    wrap.innerHTML = usersCache.map(renderUserCard).join('');
    fixMojibakeInDom(wrap);
    bindUserActions();
  } catch (error) {
    wrap.innerHTML = `<p class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">${escapeHtml(error.message)}</p>`;
  }
}

async function loadReviewers() {
  if (!['ADMIN', 'TP_DUYET'].includes(authUser.role)) {
    return;
  }
  reviewersCache = await api('/api/users/reviewers');
}

async function loadDashboard() {
  const summary = await api('/api/dashboard/summary');
  setCount('count-kd', summary.KINH_DOANH || 0);
  setCount('count-td', summary.THAM_DINH || 0);
  setCount('count-tp', summary.TP_DUYET || 0);
  setCount('count-ia', summary.IN_AN || 0);

  tasksCache = await api('/api/tasks');
  renderTaskPanels(tasksCache);
  bindTaskActions();
}

function bindTaskActions() {
  document.querySelectorAll('button[data-action="assign"]').forEach((button) => {
    button.addEventListener('click', () => openAssignModal(Number(button.dataset.taskId)));
  });

  document.querySelectorAll('button[data-action="review"]').forEach((button) => {
    button.addEventListener('click', () => openReviewModal(Number(button.dataset.taskId)));
  });

  document.querySelectorAll('button[data-action="upload-appraisal"]').forEach((button) => {
    button.addEventListener('click', () => openUploadAppraisalModal(Number(button.dataset.taskId)));
  });

  document.querySelectorAll('button[data-action="edit-task"]').forEach((button) => {
    button.addEventListener('click', () => openEditTaskModal(Number(button.dataset.taskId)));
  });

  document.querySelectorAll('button[data-action="delete-task"]').forEach((button) => {
    button.addEventListener('click', () => deleteTaskByAdmin(Number(button.dataset.taskId)));
  });
}

function bindUserActions() {
  document.querySelectorAll('button[data-action="edit-user"]').forEach((button) => {
    button.addEventListener('click', () => openEditUserModal(Number(button.dataset.userId)));
  });

  document.querySelectorAll('button[data-action="delete-user"]').forEach((button) => {
    button.addEventListener('click', () => deleteUserByAdmin(Number(button.dataset.userId)));
  });
}

function openAssignModal(taskId) {
  selectedTaskId = taskId;
  const task = tasksCache.find((item) => item.id === taskId);
  document.getElementById('action-title').textContent = `Chỉ định thẩm định viên - ${task?.code || ''}`;

  const options = reviewersCache.length
    ? reviewersCache
        .map((user) => `<option value="${user.id}">${escapeHtml(user.full_name || user.username)} (${escapeHtml(user.username)})</option>`)
        .join('')
    : '<option value="">Không có thẩm định viên</option>';

  document.getElementById('action-body').innerHTML = `
    <form id="assign-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Chọn thẩm định viên</span>
        <select id="reviewer-ids" multiple size="6" class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" required>
          ${options}
        </select>
      </label>
      <p class="text-xs text-slate-500">Giữ Ctrl hoặc Command để chọn nhiều người.</p>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Xác nhận giao việc</button>
    </form>
  `;

  document.getElementById('action-state').textContent = '';
  document.getElementById('assign-form').addEventListener('submit', submitAssign);
  showModal('action-modal');
}

async function submitAssign(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Đang xử lý...';

  try {
    const reviewerIds = Array.from(document.getElementById('reviewer-ids').selectedOptions)
      .map((option) => Number(option.value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (!reviewerIds.length) {
      stateEl.textContent = 'Vui lòng chọn ít nhất 1 thẩm định viên';
      return;
    }

    await api(`/api/tasks/${selectedTaskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerIds }),
    });
    stateEl.textContent = 'Chỉ định thành công';
    await loadDashboard();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

function openReviewModal(taskId) {
  selectedTaskId = taskId;
  const task = tasksCache.find((item) => item.id === taskId);
  document.getElementById('action-title').textContent = `Đánh giá hồ sơ - ${task?.code || ''}`;

  document.getElementById('action-body').innerHTML = `
    <form id="review-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Kết quả đánh giá</span>
        <select id="review-result" class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" required>
          <option value="DAT">Đạt</option>
          <option value="KHONG_DAT">Không đạt</option>
        </select>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Ghi chú</span>
        <textarea id="review-note" rows="3" class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"></textarea>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>File kết quả thẩm định viên</span>
        <input id="review-file" type="file" class="w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Gửi đánh giá</button>
    </form>
  `;

  document.getElementById('action-state').textContent = '';
  document.getElementById('review-form').addEventListener('submit', submitReview);
  showModal('action-modal');
}

async function submitReview(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Dang xu ly...';

  try {
    const result = document.getElementById('review-result').value;
    const note = document.getElementById('review-note').value.trim();
    const file = document.getElementById('review-file').files[0];
    const formData = new FormData();
    formData.append('result', result);
    formData.append('note', note);
    if (file) {
      formData.append('reviewFile', file);
    }

    await apiForm(`/api/tasks/${selectedTaskId}/review`, formData);
    stateEl.textContent = 'Danh gia thanh cong';
    await loadDashboard();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

function openUploadAppraisalModal(taskId) {
  selectedTaskId = taskId;
  const task = tasksCache.find((item) => item.id === taskId);
  document.getElementById('action-title').textContent = `Tải kết quả thẩm định - ${task?.code || ''}`;

  document.getElementById('action-body').innerHTML = `
    <form id="upload-appraisal-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>File kết quả thẩm định</span>
        <input id="appraisal-file" type="file" required class="w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Ghi chú</span>
        <textarea id="appraisal-note" rows="3" class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"></textarea>
      </label>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Tải lên</button>
    </form>
  `;

  document.getElementById('action-state').textContent = '';
  document.getElementById('upload-appraisal-form').addEventListener('submit', submitUploadAppraisal);
  showModal('action-modal');
}

async function submitUploadAppraisal(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Dang tai file...';

  try {
    const note = document.getElementById('appraisal-note').value.trim();
    const file = document.getElementById('appraisal-file').files[0];
    const formData = new FormData();
    formData.append('note', note);
    if (file) {
      formData.append('appraisalFile', file);
    }

    await apiForm(`/api/tasks/${selectedTaskId}/upload-appraisal`, formData);
    stateEl.textContent = 'Tai file thanh cong';
    await loadDashboard();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

function openEditTaskModal(taskId) {
  selectedTaskId = taskId;
  const task = tasksCache.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  document.getElementById('action-title').textContent = `Sửa hồ sơ - ${task.code}`;
  document.getElementById('action-body').innerHTML = `
    <form id="edit-task-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Tên dự án</span>
        <input id="edit-project-name" type="text" value="${escapeHtml(task.project_name || task.title || '')}" required class="w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Khách hàng</span>
        <input id="edit-customer-name" type="text" value="${escapeHtml(task.customer_name || '')}" required class="w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Mô tả</span>
        <textarea id="edit-description" rows="3" class="w-full rounded-xl border border-slate-200 px-3 py-2">${escapeHtml(task.description || '')}</textarea>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600">
        <span>Han xu ly</span>
        <input id="edit-due-at" type="date" value="${escapeHtml(formatDateInput(task.due_at))}" class="w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Lưu thay đổi</button>
    </form>
  `;

  document.getElementById('action-state').textContent = '';
  document.getElementById('edit-task-form').addEventListener('submit', submitEditTask);
  showModal('action-modal');
}

async function submitEditTask(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Đang cập nhật hồ sơ...';

  try {
    await api(`/api/admin/tasks/${selectedTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: document.getElementById('edit-project-name').value.trim(),
        customerName: document.getElementById('edit-customer-name').value.trim(),
        description: document.getElementById('edit-description').value.trim(),
        dueAt: document.getElementById('edit-due-at').value,
      }),
    });
    stateEl.textContent = 'Cập nhật hồ sơ thành công';
    await loadDashboard();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

async function deleteTaskByAdmin(taskId) {
  const ok = window.confirm('Bạn chắc chắn muốn xóa hồ sơ này?');
  if (!ok) {
    return;
  }

  try {
    await api(`/api/admin/tasks/${taskId}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    window.alert(error.message);
  }
}

function openCreateUserModal() {
  document.getElementById('action-title').textContent = 'Thêm user mới';
  document.getElementById('action-body').innerHTML = `
    <form id="create-user-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Tên đăng nhập</span><input id="new-username" type="text" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Họ tên</span><input id="new-fullname" type="text" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Email</span><input id="new-email" type="email" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Vai trò</span>
        <select id="new-role" class="w-full rounded-xl border border-slate-200 px-3 py-2" required>
          <option value="ADMIN">ADMIN</option>
          <option value="KINH_DOANH">KINH_DOANH</option>
          <option value="THAM_DINH">THAM_DINH</option>
          <option value="THAM_DINH_VIEN">THAM_DINH_VIEN</option>
          <option value="TP_DUYET">TP_DUYET</option>
          <option value="IN_AN">IN_AN</option>
        </select>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Mật khẩu</span><input id="new-password" type="password" minlength="6" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Tạo user</button>
    </form>
  `;
  document.getElementById('action-state').textContent = '';
  document.getElementById('create-user-form').addEventListener('submit', submitCreateUser);
  showModal('action-modal');
}

async function submitCreateUser(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Đang tạo user...';
  try {
    await api('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('new-username').value.trim(),
        fullName: document.getElementById('new-fullname').value.trim(),
        email: document.getElementById('new-email').value.trim(),
        role: document.getElementById('new-role').value,
        password: document.getElementById('new-password').value,
      }),
    });
    stateEl.textContent = 'Tạo user thành công';
    await loadUsers();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

function openEditUserModal(userId) {
  selectedTaskId = userId;
  const user = usersCache.find((item) => item.id === userId);
  if (!user) {
    return;
  }

  document.getElementById('action-title').textContent = `Sửa user - ${user.username}`;
  document.getElementById('action-body').innerHTML = `
    <form id="edit-user-form" class="space-y-3">
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Tên đăng nhập</span><input id="edit-username" type="text" value="${escapeHtml(user.username)}" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Họ tên</span><input id="edit-fullname" type="text" value="${escapeHtml(user.full_name || '')}" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Email</span><input id="edit-email" type="email" value="${escapeHtml(user.email || '')}" required class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Vai trò</span>
        <select id="edit-role" class="w-full rounded-xl border border-slate-200 px-3 py-2" required>
          ${['ADMIN', 'KINH_DOANH', 'THAM_DINH', 'THAM_DINH_VIEN', 'TP_DUYET', 'IN_AN']
            .map((role) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`)
            .join('')}
        </select>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Trạng thái</span>
        <select id="edit-active" class="w-full rounded-xl border border-slate-200 px-3 py-2">
          <option value="1" ${user.is_active ? 'selected' : ''}>Hoạt động</option>
          <option value="0" ${!user.is_active ? 'selected' : ''}>Vô hiệu hóa</option>
        </select>
      </label>
      <label class="block space-y-1 text-sm font-semibold text-slate-600"><span>Mật khẩu mới (không bắt buộc)</span><input id="edit-password" type="password" minlength="6" class="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      <button type="submit" class="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">Lưu user</button>
    </form>
  `;

  document.getElementById('action-state').textContent = '';
  document.getElementById('edit-user-form').addEventListener('submit', submitEditUser);
  showModal('action-modal');
}

async function submitEditUser(event) {
  event.preventDefault();
  const stateEl = document.getElementById('action-state');
  stateEl.textContent = 'Đang cập nhật user...';
  try {
    const payload = {
      username: document.getElementById('edit-username').value.trim(),
      fullName: document.getElementById('edit-fullname').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      role: document.getElementById('edit-role').value,
      isActive: document.getElementById('edit-active').value === '1',
    };
    const newPassword = document.getElementById('edit-password').value;
    if (newPassword) {
      payload.password = newPassword;
    }

    await api(`/api/admin/users/${selectedTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    stateEl.textContent = 'Cập nhật user thành công';
    await loadUsers();
  } catch (error) {
    stateEl.textContent = error.message;
  }
}

async function deleteUserByAdmin(userId) {
  const ok = window.confirm('Bạn chắc chắn muốn xóa user này?');
  if (!ok) {
    return;
  }

  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    await loadUsers();
  } catch (error) {
    window.alert(error.message);
  }
}

function setupCreateModal() {
  const openBtn = document.getElementById('open-create-btn');
  const closeBtn = document.getElementById('close-create-btn');
  const form = document.getElementById('create-modal-form');
  const documentsInput = document.getElementById('documents-upload');
  const documentsList = document.getElementById('documents-list');

  openBtn.classList.toggle('hidden', !['KINH_DOANH', 'ADMIN'].includes(authUser.role));
  if (authUser.role === 'ADMIN') {
    document.getElementById('proposal-upload').required = false;
  }

  // Display selected documents
  documentsInput.addEventListener('change', () => {
    const files = documentsInput.files;
    if (files.length === 0) {
      documentsList.innerHTML = '';
    } else {
      documentsList.innerHTML = `<div class="mt-2 p-2 bg-slate-50 rounded-lg">
        <p class="font-semibold mb-2">Đã chọn ${files.length} tài liệu:</p>
        <ul class="space-y-1">
          ${Array.from(files).map(f => `<li class="text-xs">✓ ${f.name} (${(f.size / 1024).toFixed(2)} KB)</li>`).join('')}
        </ul>
      </div>`;
    }
  });

  openBtn.addEventListener('click', () => {
    document.getElementById('create-modal-state').textContent = '';
    documentsList.innerHTML = '';
    showModal('create-modal');
  });

  closeBtn.addEventListener('click', () => hideModal('create-modal'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const stateEl = document.getElementById('create-modal-state');
    stateEl.textContent = 'Đang tạo hồ sơ...';

    try {
      const projectName = document.getElementById('project-name').value.trim();
      const customerName = document.getElementById('customer-name').value.trim();
      const description = document.getElementById('project-description').value.trim();
      const dueAt = document.getElementById('due-at').value;

      const proposalFile = document.getElementById('proposal-upload').files[0];
      const documentFiles = document.getElementById('documents-upload').files;

      const createUrl = authUser.role === 'ADMIN' ? '/api/admin/tasks' : '/api/tasks';
      const formData = new FormData();
      formData.append('projectName', projectName);
      formData.append('customerName', customerName);
      formData.append('description', description);
      formData.append('dueAt', dueAt);
      if (proposalFile) {
        formData.append('proposalFile', proposalFile);
      }
      Array.from(documentFiles).forEach((file) => {
        formData.append('documentFiles', file);
      });

      await apiForm(createUrl, formData);
      stateEl.textContent = 'Tao ho so thanh cong';
      event.target.reset();
      documentsList.innerHTML = '';
      await loadDashboard();
    } catch (error) {
      stateEl.textContent = error.message;
    }
  });
}

function setupShell() {
  document.getElementById('user-info').textContent = `${authUser.username} (${authUser.role})`;
  const heartbeat = () => api('/api/me/heartbeat', { method: 'PATCH' }).catch(() => {});
  heartbeat();
  window.setInterval(heartbeat, 60000);
  renderMenu();
  setActivePanel();
  fixMojibakeInDom();

  setupCreateModal();

  if (authUser.role === 'ADMIN') {
    document.getElementById('open-create-user-btn').addEventListener('click', openCreateUserModal);
  }

  const closeActionBtn = document.getElementById('close-action-btn');
  closeActionBtn.addEventListener('click', () => hideModal('action-modal'));

  document.getElementById('action-modal').addEventListener('click', (event) => {
    if (event.target.id === 'action-modal') {
      hideModal('action-modal');
    }
  });

  document.getElementById('create-modal').addEventListener('click', (event) => {
    if (event.target.id === 'create-modal') {
      hideModal('create-modal');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = '/';
  });

}

(async () => {
  try {
    setupShell();
    await loadReviewers();
    await loadDashboard();
    await loadUsers();
  } catch (error) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = '/';
  }
})();


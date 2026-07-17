(function applyDashboardRedesign() {
  Object.assign(roleMenus, {
    ADMIN: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
      { key: 'archive', label: 'Luu tru' },
      { key: 'users', label: 'Nguoi dung' },
      { key: 'logs', label: 'Lich su' },
    ],
    TP_DUYET: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
      { key: 'logs', label: 'Lich su' },
    ],
    KINH_DOANH: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
    ],
    THAM_DINH: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
    ],
    THAM_DINH_VIEN: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
    ],
    IN_AN: [
      { key: 'overview', label: 'Tong quan' },
      { key: 'tasks', label: 'Ho so' },
    ],
  });

  Object.assign(stageLabels, {
    KINH_DOANH: 'Kinh doanh',
    THAM_DINH: 'Tham dinh',
    THAM_DINH_VIEN: 'Tham dinh vien',
    TP_DUYET: 'Truong phong duyet',
    IN_AN: 'In an',
    DONE: 'Hoan tat',
  });

  Object.assign(statusLabels, {
    PENDING: 'Cho xu ly',
    IN_PROGRESS: 'Dang xu ly',
    APPROVED: 'Da dat',
    REJECTED: 'Khong dat',
    ON_HOLD: 'Tam dung',
  });

  Object.assign(slaLabels, {
    no_due: 'Chua dat han',
    on_track: 'Dung han',
    due_soon: 'Sap den han',
    overdue: 'Qua han',
    completed: 'Da hoan tat',
  });

  Object.assign(actionLabels, {
    CREATE: 'Tao ho so',
    ADMIN_CREATE_TASK: 'Admin tao ho so',
    ADMIN_UPDATE_TASK: 'Admin cap nhat ho so',
    UPLOAD: 'Tai phieu de nghi',
    ASSIGN: 'Giao tham dinh',
    REVIEW_RESULT: 'Tra ket qua tham dinh',
    REVIEW_REJECT: 'Ket luan khong dat',
    UPLOAD_REVIEW_FILE: 'Tai file ket qua',
    REVIEW_NOTE: 'Ghi chu tham dinh',
    MOVE_PRINT: 'Chuyen in an',
    UPLOAD_APPRAISAL_FILE: 'Tham dinh tai file ket qua',
    APPRAISER_RESULT_PASS: 'Tham dinh vien danh gia dat',
    APPRAISER_RESULT_FAIL: 'Tham dinh vien danh gia khong dat',
    UPLOAD_APPRAISER_FILE: 'Tai file ket qua tham dinh vien',
    APPRAISER_NOTE: 'Ghi chu tham dinh vien',
    APPRAISAL_COMPLETED: 'Hoan thanh cong doan tham dinh',
    HANDOFF_TO_APPRAISER: 'Ban giao cho tham dinh vien',
    RETURN_TO_REVIEWER: 'Tra ho so cho tham dinh lam lai',
    MANAGER_APPROVE: 'Truong phong phe duyet',
    MANAGER_REJECT: 'Truong phong tu choi',
    COMPLETE_PRINT: 'Hoan tat in an',
    ARCHIVE_TASK: 'Luu tru ho so',
    RESTORE_TASK: 'Khoi phuc ho so',
  });

  const listState = {
    overview: { page: 1, pageSize: 5, query: '' },
    tasks: { page: 1, pageSize: 10, query: '' },
    logs: { page: 1, pageSize: 10, query: '' },
    archive: { page: 1, pageSize: 10, query: '' },
  };
  const listSearchTimers = {};
  const taskCacheById = new Map();

  function rememberTasks(items) {
    (items || []).forEach((item) => taskCacheById.set(Number(item.id), item));
    tasksCache = Array.from(taskCacheById.values());
  }

  function toQuery(state) {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));
    if (state.query) {
      params.set('q', state.query);
    }
    return params.toString();
  }

  function ensureEnhancements() {
    const overviewPanel = document.getElementById('panel-overview');
    const firstMetricGrid = overviewPanel && overviewPanel.querySelector('.grid');
    if (firstMetricGrid && !document.getElementById('count-overdue')) {
      firstMetricGrid.insertAdjacentHTML('beforeend', `
        <article class="metric-card ui-card p-4"><p class="text-sm font-bold text-slate-600">Quá hạn</p><p id="count-overdue" class="mt-2 text-3xl font-extrabold text-rose-700">0</p></article>
        <article class="metric-card ui-card p-4"><p class="text-sm font-bold text-slate-600">Sắp đến hạn</p><p id="count-due-soon" class="mt-2 text-3xl font-extrabold text-amber-700">0</p></article>
        <article class="metric-card ui-card p-4"><p class="text-sm font-bold text-slate-600">Bị trả lại</p><p id="count-rejected" class="mt-2 text-3xl font-extrabold text-slate-950">0</p></article>
        <article class="metric-card ui-card p-4"><p class="text-sm font-bold text-slate-600">Thông báo mới</p><p id="count-unread" class="mt-2 text-3xl font-extrabold text-brand-700">0</p></article>
      `);
    }
    const main = document.getElementById('main-content');
    if (main && !document.getElementById('panel-archive')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="panel-archive" class="panel hidden">
          <div class="mb-3">
            <h3 class="text-base font-extrabold text-slate-950">Kho lưu trữ hồ sơ</h3>
            <p class="text-sm text-slate-600">Quản lý các hồ sơ đã lưu trữ và khôi phục khi cần.</p>
          </div>
          <div id="archive-list-grid" class="task-grid"></div>
        </section>
      `);
    }

    const refreshBtn = document.getElementById('refresh-notifications-btn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.addEventListener('click', loadNotifications);
    }

    const notificationToggle = document.getElementById('notifications-toggle');
    const notificationPopover = document.getElementById('notifications-popover');
    if (notificationToggle && notificationPopover && !notificationToggle.dataset.bound) {
      notificationToggle.dataset.bound = '1';
      notificationToggle.addEventListener('click', async (event) => {
        event.stopPropagation();
        const nextOpen = notificationPopover.classList.contains('hidden');
        notificationPopover.classList.toggle('hidden', !nextOpen);
        notificationToggle.setAttribute('aria-expanded', String(nextOpen));
        if (nextOpen) {
          await loadNotifications();
        }
      });
      document.addEventListener('click', (event) => {
        if (!notificationPopover.contains(event.target) && !notificationToggle.contains(event.target)) {
          notificationPopover.classList.add('hidden');
          notificationToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function renderSummary(summary) {
    setCount('count-kd', summary.KINH_DOANH || 0);
    setCount('count-td', summary.THAM_DINH || 0);
    setCount('count-tp', summary.TP_DUYET || 0);
    setCount('count-ia', summary.IN_AN || 0);
    const metricMap = {
      'count-overdue': summary.overdue || 0,
      'count-due-soon': summary.dueSoon || 0,
      'count-rejected': summary.rejected || 0,
      'count-unread': summary.unreadNotifications || 0,
    };
    Object.entries(metricMap).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = String(value);
      }
    });
  }

  function renderListToolbar(kind, pagination, placeholder) {
    const state = listState[kind];
    const total = pagination.total || 0;
    const totalPages = Math.max(1, pagination.totalPages || 1);
    const start = total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
    const end = Math.min(total, pagination.page * pagination.pageSize);
    return `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <label class="min-w-[240px] flex-1 text-sm font-bold text-slate-700">
          <span class="sr-only">Tìm kiếm</span>
          <input data-list-search="${kind}" type="search" value="${escapeHtml(state.query)}" placeholder="${placeholder}" class="w-full border px-3 py-2 text-sm" />
        </label>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="font-bold text-slate-600">${start}-${end}/${total}</span>
          <select data-list-size="${kind}" class="border px-2 py-2 text-sm font-bold">
            <option value="5" ${state.pageSize === 5 ? 'selected' : ''}>5 / trang</option>
            <option value="10" ${state.pageSize === 10 ? 'selected' : ''}>10 / trang</option>
            <option value="20" ${state.pageSize === 20 ? 'selected' : ''}>20 / trang</option>
          </select>
          <button data-list-prev="${kind}" type="button" class="btn-secondary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold" ${pagination.page <= 1 ? 'disabled' : ''}>Trước</button>
          <span class="min-w-16 text-center font-extrabold text-slate-700">${pagination.page}/${totalPages}</span>
          <button data-list-next="${kind}" type="button" class="btn-secondary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold" ${pagination.page >= totalPages ? 'disabled' : ''}>Sau</button>
        </div>
      </div>
    `;
  }

  function ensureListToolbar(container, id) {
    let toolbar = document.getElementById(id);
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = id;
      toolbar.className = 'list-toolbar ui-card mb-3 p-3';
      container.parentElement.insertBefore(toolbar, container);
    }
    return toolbar;
  }

  function bindListToolbar(kind, loader) {
    const search = document.querySelector(`[data-list-search="${kind}"]`);
    const size = document.querySelector(`[data-list-size="${kind}"]`);
    const prev = document.querySelector(`[data-list-prev="${kind}"]`);
    const next = document.querySelector(`[data-list-next="${kind}"]`);

    if (search) {
      search.addEventListener('input', () => {
        listState[kind].query = search.value.trim();
        listState[kind].page = 1;
        window.clearTimeout(listSearchTimers[kind]);
        listSearchTimers[kind] = window.setTimeout(loader, 250);
      });
    }
    if (size) {
      size.addEventListener('change', () => {
        listState[kind].pageSize = Number(size.value) || 10;
        listState[kind].page = 1;
        loader();
      });
    }
    if (prev) {
      prev.addEventListener('click', () => {
        listState[kind].page -= 1;
        loader();
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        listState[kind].page += 1;
        loader();
      });
    }
  }

  renderTaskCard = function renderTaskCard(task) {
    const canAssignRoles = ['ADMIN', 'TP_DUYET'];
    const canAssign = canAssignRoles.includes(authUser.role) && ['KINH_DOANH', 'THAM_DINH'].includes(task.current_stage);
    const canUploadAppraisal = authUser.role === 'THAM_DINH' && Number(task.assignee_id) === Number(authUser.id) && task.current_stage === 'THAM_DINH';
    const canReview = authUser.role === 'THAM_DINH_VIEN' && Number(task.assignee_id) === Number(authUser.id) && task.current_stage === 'THAM_DINH';
    const canAdminEdit = authUser.role === 'ADMIN' && !task.is_archive_card;
    const displayStatus = task.current_stage === 'THAM_DINH' && task.status === 'APPROVED' ? 'Da hoan thanh' : labelStatus(task.status);
    const dueLabel = task.due_at ? formatDate(task.due_at) : 'Chua dat han';
    const slaStatus = task.sla_status || 'no_due';

    let actionHtml = '';
    if (canAssign) {
      actionHtml = `<button data-action="assign" data-task-id="${task.id}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Chỉ định thẩm định</button>`;
    }
    if (canReview) {
      actionHtml = `<button data-action="review" data-task-id="${task.id}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Đánh giá hồ sơ</button>`;
    }
    if (canUploadAppraisal) {
      actionHtml = `<button data-action="upload-appraisal" data-task-id="${task.id}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Tải kết quả</button>`;
    }

    const adminTaskActionHtml = canAdminEdit
      ? `
        <button data-action="edit-task" data-task-id="${task.id}" class="btn-secondary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Sửa</button>
        <button data-action="delete-task" data-task-id="${task.id}" class="min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-amber-700 hover:bg-amber-50">Lưu trữ</button>
      `
      : '';
    const archiveActionHtml = task.is_archive_card
      ? `<button data-action="restore-task" data-task-id="${task.id}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Khôi phục</button>`
      : '';

    return `
      <article class="task-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="task-card__code">${escapeHtml(task.code)}</p>
            <h4 class="task-card__title">${escapeHtml(task.project_name || task.title || 'Không có tiêu đề')}</h4>
          </div>
          <span class="status-pill ${statusBadgeClass(task.status)}">${escapeHtml(displayStatus)}</span>
        </div>
        <div class="task-card__meta">
          <p>Khách hàng: <span class="font-bold text-slate-800">${escapeHtml(task.customer_name || '-')}</span></p>
          <p>Người tạo: <span class="font-bold text-slate-800">${escapeHtml(task.created_by || '-')}</span></p>
          <p>Ngày tạo: <span class="font-bold text-slate-800">${escapeHtml(formatDate(task.created_at))}</span></p>
          ${task.deleted_at ? `<p>Đã lưu trữ: <span class="font-bold text-slate-800">${escapeHtml(formatDate(task.deleted_at))}</span></p>` : ''}
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          <span class="status-pill bg-slate-100 text-slate-700">${escapeHtml(labelStage(task.current_stage))}</span>
          <span class="status-pill ${slaBadgeClass(slaStatus)}">${escapeHtml(slaLabels[slaStatus] || slaStatus)}</span>
          <span class="text-xs font-bold text-slate-500">Hạn xử lý: ${escapeHtml(dueLabel)}</span>
        </div>
        <div class="task-card__actions">
          ${task.is_archive_card ? '' : `<a href="/task/${task.id}" class="btn-secondary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Xem chi tiết</a>`}
          ${actionHtml}
          ${adminTaskActionHtml}
          ${archiveActionHtml}
        </div>
      </article>
    `;
  };

  function renderTaskPage(kind, container, data) {
    const toolbar = ensureListToolbar(container, `${kind}-list-toolbar`);
    toolbar.innerHTML = renderListToolbar(kind, data.pagination, 'Tìm theo mã hồ sơ, dự án, khách hàng, người tạo...');
    container.innerHTML = data.items.length
      ? data.items.map(renderTaskCard).join('')
      : '<p class="ui-card p-6 text-sm font-bold text-slate-500">Không có hồ sơ phù hợp.</p>';
    bindListToolbar(kind, () => loadTaskList(kind));
    if (kind === 'archive') {
      bindArchiveActions();
    } else {
      bindTaskActions();
    }
  }

  async function loadTaskList(kind) {
    const container = document.getElementById(kind === 'overview' ? 'overview-card-grid' : 'task-list-grid');
    if (!container) {
      return;
    }
    const data = await api(`/api/tasks?${toQuery(listState[kind])}`);
    rememberTasks(data.items);
    renderTaskPage(kind, container, data);
  }

  renderTaskPanels = function renderTaskPanels(tasks) {
    const overviewContainer = document.getElementById('overview-card-grid');
    const taskListContainer = document.getElementById('task-list-grid');
    const items = Array.isArray(tasks) ? tasks : [];
    const overviewItems = items.slice(0, listState.overview.pageSize);
    const taskItems = items.slice(0, listState.tasks.pageSize);
    if (overviewContainer) {
      overviewContainer.innerHTML = overviewItems.length ? overviewItems.map(renderTaskCard).join('') : '<p class="ui-card p-6 text-sm font-bold text-slate-500">Chưa có hồ sơ.</p>';
    }
    if (taskListContainer) {
      taskListContainer.innerHTML = taskItems.length ? taskItems.map(renderTaskCard).join('') : '<p class="ui-card p-6 text-sm font-bold text-slate-500">Chưa có hồ sơ.</p>';
    }
  };

  function renderLogCard(item) {
    return `
      <article class="ui-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-extrabold text-slate-950">${escapeHtml(labelAction(item.action))}</p>
            <p class="mt-1 text-xs font-bold text-brand-700">${escapeHtml(item.task_code || '-')}</p>
          </div>
          <p class="text-xs font-bold text-slate-500">${escapeHtml(formatDate(item.changed_at))}</p>
        </div>
        <div class="mt-3 grid gap-1 text-sm text-slate-600">
          <p>Thuc hien boi: <span class="font-bold text-slate-800">${escapeHtml(item.changed_by || '-')}</span></p>
          <p>Chuyen buoc: <span class="font-bold text-slate-800">${escapeHtml(labelStage(item.from_stage))} -> ${escapeHtml(labelStage(item.to_stage))}</span></p>
          ${item.note ? `<p class="text-slate-500">${escapeHtml(item.note)}</p>` : ''}
        </div>
      </article>
    `;
  }

  loadLogs = async function loadLogs() {
    const wrap = document.getElementById('logs-list');
    if (!wrap) {
      return;
    }
    try {
      const data = await api(`/api/logs?${toQuery(listState.logs)}`);
      const toolbar = ensureListToolbar(wrap, 'logs-list-toolbar');
      toolbar.innerHTML = renderListToolbar('logs', data.pagination, 'Tìm theo mã hồ sơ, thao tác, người thực hiện...');
      wrap.innerHTML = data.items.length
        ? data.items.map(renderLogCard).join('')
        : '<p class="ui-card p-6 text-sm font-bold text-slate-500">không có lịch sử phù hợp.</p>';
      bindListToolbar('logs', loadLogs);
    } catch (error) {
      wrap.innerHTML = `<p class="ui-card border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">${escapeHtml(error.message)}</p>`;
    }
  };

  async function loadNotifications() {
    const wrap = document.getElementById('notifications-list');
    if (!wrap) {
      return;
    }
    try {
      const items = await api('/api/notifications');
      const unreadCount = items.filter((item) => !item.is_read).length;
      const badge = document.getElementById('notifications-badge');
      if (badge) {
        badge.textContent = String(unreadCount);
        badge.classList.toggle('hidden', unreadCount === 0);
      }
      wrap.innerHTML = items.length
        ? items.map((item) => `
          <article class="notification-item p-3 ${item.is_read ? 'is-read' : ''}">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-extrabold text-slate-950">${escapeHtml(item.title)}</p>
                <p class="mt-1 text-sm text-slate-600">${escapeHtml(item.message)}</p>
                <p class="mt-1 text-xs font-bold text-slate-500">${escapeHtml(item.task_code || '')} ${escapeHtml(formatDate(item.created_at))}</p>
              </div>
              ${item.is_read ? '<span class="status-pill bg-slate-100 text-slate-700">Đã đọc</span>' : `<button data-action="read-notification" data-notification-id="${item.id}" class="btn-secondary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold">Đã đọc</button>`}
            </div>
          </article>
        `).join('')
        : '<p class="text-sm font-bold text-slate-500">Chưa có thông báo mới.</p>';
      bindNotificationActions();
    } catch (error) {
      wrap.innerHTML = `<p class="text-sm font-bold text-rose-700">${escapeHtml(error.message)}</p>`;
    }
  }

  function bindNotificationActions() {
    document.querySelectorAll('button[data-action="read-notification"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await api(`/api/notifications/${button.dataset.notificationId}/read`, { method: 'PATCH' });
        await loadNotifications();
        const summary = await api('/api/dashboard/summary');
        renderSummary(summary);
      });
    });
  }

  async function loadArchive() {
    if (authUser.role !== 'ADMIN') {
      return;
    }
    const wrap = document.getElementById('archive-list-grid');
    if (!wrap) {
      return;
    }
    try {
      const data = await api(`/api/admin/archived-tasks?${toQuery(listState.archive)}`);
      data.items = data.items.map((item) => ({ ...item, is_archive_card: true }));
      renderTaskPage('archive', wrap, data);
    } catch (error) {
      wrap.innerHTML = `<p class="ui-card border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">${escapeHtml(error.message)}</p>`;
    }
  }

  function bindArchiveActions() {
    document.querySelectorAll('button[data-action="restore-task"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = window.confirm('Khoi phuc ho so nay?');
        if (!ok) {
          return;
        }
        await api(`/api/admin/tasks/${button.dataset.taskId}/restore`, { method: 'POST' });
        await loadArchive();
        await loadDashboard();
      });
    });
  }

  deleteTaskByAdmin = async function deleteTaskByAdmin(taskId) {
    const ok = window.confirm('Luu tru ho so nay? Ho so se khong hien trong danh sach dang xu ly.');
    if (!ok) {
      return;
    }
    try {
      await api(`/api/admin/tasks/${taskId}`, { method: 'DELETE' });
      await loadDashboard();
      if (currentTab === 'archive') {
        await loadArchive();
      }
    } catch (error) {
      window.alert(error.message);
    }
  };

  renderMenu = function renderMenu() {
    const menuItems = roleMenus[authUser.role] || [{ key: 'overview', label: 'Tong quan' }];
    const menu = document.getElementById('menu-list');
    menu.innerHTML = menuItems.map((item) => `
      <li><button data-tab="${item.key}" class="menu-btn w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm font-semibold transition ${item.key === currentTab ? 'bg-brand-50 text-brand-700' : ''}">${item.label}</button></li>
    `).join('');

    menu.querySelectorAll('button[data-tab]').forEach((button) => {
      button.addEventListener('click', async () => {
        currentTab = button.dataset.tab;
        renderMenu();
        setActivePanel();
        if (currentTab === 'logs') {
          await loadLogs();
        }
        if (currentTab === 'archive') {
          await loadArchive();
        }
        if (currentTab === 'users') {
          await loadUsers();
        }
      });
    });
  };

  setActivePanel = function setActivePanel() {
    ['overview', 'tasks', 'logs', 'users', 'archive'].forEach((panel) => {
      const el = document.getElementById(`panel-${panel}`);
      if (el) {
        el.classList.toggle('hidden', panel !== currentTab);
      }
    });
    const labels = {
      overview: 'TONG QUAN',
      tasks: 'DANH SACH HO SO',
      users: 'NGUOI DUNG',
      logs: 'LICH SU HE THONG',
      archive: 'KHO LUU TRU',
    };
    document.getElementById('active-tab').textContent = labels[currentTab] || 'TONG QUAN';
  };

  loadDashboard = async function loadDashboard() {
    ensureEnhancements();
    const summary = await api('/api/dashboard/summary');
    renderSummary(summary);
    await Promise.all([loadTaskList('overview'), loadTaskList('tasks'), loadNotifications()]);
  };

  try {
    ensureEnhancements();
    renderMenu();
    setActivePanel();
    if (usersCache.length) {
      document.getElementById('users-list').innerHTML = usersCache.map(renderUserCard).join('');
      bindUserActions();
    }
  } catch {
    // Main dashboard setup may still be running; async loaders will use these overrides.
  }
})();

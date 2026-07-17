(function applyTaskDetailRedesign() {
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
    APPROVED: 'Dat - cho Kinh doanh chuyen in an',
    REJECTED: 'Khong dat',
    ON_HOLD: 'Tam dung',
  });

  Object.assign(workflowLabels, {
    new: 'Ho so moi',
    in_review: 'Dang tham dinh',
    approved: 'Da co ket qua tham dinh',
    printing: 'Da chuyen in an',
    rejected: 'Can tham dinh lam lai',
    done: 'Hoan tat',
    in_progress: 'Dang xu ly',
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
    REVIEW_RESULT: 'Tham dinh vien tra ket qua',
    REVIEW_REJECT: 'Tham dinh vien ket luan khong dat',
    UPLOAD_REVIEW_FILE: 'Tai file ket qua',
    REVIEW_NOTE: 'Ghi chu tham dinh',
    MOVE_PRINT: 'Kinh doanh chuyen in an',
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

  renderTaskInfo = function renderTaskInfo(task) {
    const displayStatus = task.current_stage === 'THAM_DINH' && task.status === 'APPROVED' ? 'Da hoan thanh' : labelStatus(task.status);
    document.getElementById('task-code').textContent = task.code || '-';
    document.getElementById('task-name').textContent = task.project_name || task.title || '-';
    document.getElementById('task-status').textContent = `${displayStatus} (${labelWorkflow(task.workflow_status)})`;
    document.getElementById('task-owner').textContent = task.created_by_username || '-';
    document.getElementById('task-created').textContent = fmtDate(task.created_at);
    document.getElementById('task-assignee').textContent = task.assignee_username || 'Chua giao';
  };

  renderFiles = function renderFiles(files) {
    const wrap = document.getElementById('files-list');
    if (!files.length) {
      wrap.innerHTML = '<p class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">Chua co file dinh kem.</p>';
      return;
    }

    wrap.innerHTML = files.map((f) => {
      const downloadUrl = f.public_url || f.download_url || f.full_url || '';
      return `
      <article class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <p class="text-sm font-extrabold text-slate-950">${escapeHtml(f.file_name)}${f.exists ? '' : ' (khong tim thay file vat ly)'}</p>
          <p class="mt-1 text-xs font-semibold text-slate-500">
            ${escapeHtml(formatBytes(f.file_size))} - ${escapeHtml(labelStage(f.stage))} - ${escapeHtml(fmtDate(f.uploaded_at))}
          </p>
        </div>
        <button type="button" data-download-url="${escapeHtml(downloadUrl)}" data-file-name="${escapeHtml(f.file_name)}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold disabled:cursor-not-allowed disabled:bg-slate-400">Tai xuong</button>
      </article>
    `;
    }).join('');
    bindFileDownloadButtons(wrap);
  };

  renderTimeline = function renderTimeline(logs) {
    const wrap = document.getElementById('timeline-list');
    if (!logs.length) {
      wrap.innerHTML = '<p class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">Chua co lich su xu ly.</p>';
      return;
    }

    wrap.innerHTML = logs.map((log) => `
      <article class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-extrabold text-slate-950">${escapeHtml(labelAction(log.action))}</p>
          <p class="text-xs font-bold text-slate-500">${escapeHtml(fmtDate(log.changed_at))}</p>
        </div>
        <p class="mt-1 text-sm text-slate-600">Thuc hien boi <span class="font-bold">${escapeHtml(log.changed_by)}</span></p>
        ${log.note ? `<p class="mt-1 text-sm text-slate-500">${escapeHtml(log.note)}</p>` : ''}
      </article>
    `).join('');
  };
})();

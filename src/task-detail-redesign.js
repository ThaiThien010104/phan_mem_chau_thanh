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
    PENDING: 'Chờ xử lý',
    IN_PROGRESS: 'Đang xử lý',
    APPROVED: 'Đạt - cho Kinh doanh chuyển in an',
    REJECTED: 'Không đạt',
    ON_HOLD: 'Đang tạm dừng',
  });

  Object.assign(workflowLabels, {
    new: 'Hồ sơ mới',
    in_review: 'Đang thẩm định',
    approved: 'Đã có kết quả thẩm định',
    printing: 'Đã chuyển in ấn',
    rejected: 'ần thẩm định lại',
    done: 'Hoàn tất',
    in_progress: 'Đang xử lý',
  });

  Object.assign(slaLabels, {
    no_due: 'Chưa đạt hạn',
    on_track: 'Đúng hạn',
    due_soon: 'Sắp đến hạn',
    overdue: 'Quá hạn',
    completed: 'Đã hoàn tất',
  });

  Object.assign(actionLabels, {
    CREATE: 'Tạo hồ sơ',
    ADMIN_CREATE_TASK: 'Admin tạo hồ sơ',
    ADMIN_UPDATE_TASK: 'Admin cập nhật hồ sơ',
    UPLOAD: 'Tải phiếu đề nghị',
    ASSIGN: 'Giao thẩm định',
    REVIEW_RESULT: 'Thẩm định viên trả kết quả',
    REVIEW_REJECT: 'Thẩm định viên kết luận không đạt',
    UPLOAD_REVIEW_FILE: 'Tải file kết quả',
    REVIEW_NOTE: 'Ghi chú thẩm định',
    MOVE_PRINT: 'Kinh doanh chuyển in ấn',
    UPLOAD_APPRAISAL_FILE: 'Thẩm định tải file kết quả',
    APPRAISER_RESULT_PASS: 'Thẩm định viên đánh giá đạt',
    APPRAISER_RESULT_FAIL: 'Thẩm định viên đánh giá không đạt',
    UPLOAD_APPRAISER_FILE: 'Tải file kết quả thẩm định viên',
    APPRAISER_NOTE: 'Ghi chú thẩm định viên',
    APPRAISAL_COMPLETED: 'Hoàn thành công đoạn thẩm định',
    HANDOFF_TO_APPRAISER: 'Bàn giao cho thẩm định viên',
    RETURN_TO_REVIEWER: 'Trả hồ sơ cho thẩm định làm lại',
    MANAGER_APPROVE: 'Trưởng phòng phê duyệt',
    MANAGER_REJECT: 'Trưởng phòng từ chối',
    COMPLETE_PRINT: 'Hoàn tất in ấn',
    ARCHIVE_TASK: 'Lưu trữ hồ sơ',
    RESTORE_TASK: 'Khôi phục hồ sơ',
  });

  renderTaskInfo = function renderTaskInfo(task) {
    const displayStatus = task.current_stage === 'THAM_DINH' && task.status === 'APPROVED' ? 'Đã hoàn thành' : labelStatus(task.status);
    document.getElementById('task-code').textContent = task.code || '-';
    document.getElementById('task-name').textContent = task.project_name || task.title || '-';
    document.getElementById('task-status').textContent = `${displayStatus} (${labelWorkflow(task.workflow_status)})`;
    document.getElementById('task-owner').textContent = task.created_by_username || '-';
    document.getElementById('task-created').textContent = fmtDate(task.created_at);
    document.getElementById('task-assignee').textContent = task.assignee_username || 'Chưa giao';
  };

  renderFiles = function renderFiles(files) {
    const wrap = document.getElementById('files-list');
    if (!files.length) {
      wrap.innerHTML = '<p class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">Chưa có file đính kèm.</p>';
      return;
    }

    const stageOrder = ['KINH_DOANH', 'THAM_DINH', 'THAM_DINH_VIEN', 'TP_DUYET', 'IN_AN', 'DONE'];
    const grouped = files.reduce((acc, file) => {
      const stage = file.stage || 'KHAC';
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(file);
      return acc;
    }, {});
    const orderedStages = [
      ...stageOrder.filter((stage) => grouped[stage]),
      ...Object.keys(grouped).filter((stage) => !stageOrder.includes(stage)),
    ];

    wrap.innerHTML = orderedStages.map((stage) => `
      <section class="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-extrabold text-slate-950">${escapeHtml(labelStage(stage))}</h3>
          <span class="status-pill bg-white text-slate-700">${grouped[stage].length} file</span>
        </div>
        <div class="grid gap-2">
          ${grouped[stage].map((f) => {
            const downloadUrl = f.public_url || f.download_url || f.full_url || '';
            return `
              <article class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div>
                  <p class="text-sm font-extrabold text-slate-950">${escapeHtml(f.file_name)}${f.exists ? '' : ' (không tìm thấy file vật lý)'}</p>
                  <p class="mt-1 text-xs font-semibold text-slate-500">
                    ${escapeHtml(formatBytes(f.file_size))} - ${escapeHtml(fmtDate(f.uploaded_at))}
                  </p>
                </div>
                <button type="button" data-download-url="${escapeHtml(downloadUrl)}" data-file-name="${escapeHtml(f.file_name)}" class="btn-primary min-h-10 rounded-lg px-3 py-2 text-xs font-extrabold disabled:cursor-not-allowed disabled:bg-slate-400">Tải xuống</button>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `).join('');
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
        <p class="mt-1 text-sm text-slate-600">Thực hiện bởi <span class="font-bold">${escapeHtml(log.changed_by)}</span></p>
        ${log.note ? `<p class="mt-1 text-sm text-slate-500">${escapeHtml(log.note)}</p>` : ''}
      </article>
    `).join('');
  };
})();

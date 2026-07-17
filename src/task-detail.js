const token = localStorage.getItem('authToken');
const user = JSON.parse(localStorage.getItem('authUser') || 'null');
const API_BASE = window.location.origin;

if (!token || !user) {
  window.location.href = '/';
}

const taskId = Number(window.location.pathname.split('/').pop());

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
  APPROVED: 'Đạt - chờ Kinh doanh chuyển In ấn',
  REJECTED: 'Không đạt',
  ON_HOLD: 'Tạm dừng',
};

const workflowLabels = {
  new: 'Hồ sơ mới',
  in_review: 'Đang thẩm định',
  approved: 'Đã có kết quả thẩm định',
  printing: 'Đã chuyển In ấn',
  rejected: 'Trả lại Kinh doanh',
  done: 'Hoàn tất',
  in_progress: 'Đang xử lý',
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
  REVIEW_RESULT: 'Thẩm định viên trả kết quả',
  REVIEW_REJECT: 'Thẩm định viên kết luận không đạt',
  UPLOAD_REVIEW_FILE: 'Tải lên file kết quả thẩm định',
  REVIEW_NOTE: 'Ghi chú thẩm định',
  MOVE_PRINT: 'Kinh doanh chuyển In ấn',
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

function labelStage(value) {
  return stageLabels[value] || value || '-';
}

function labelStatus(value) {
  return statusLabels[value] || value || '-';
}

function labelWorkflow(value) {
  return workflowLabels[value] || value || '-';
}

function labelAction(value) {
  return actionLabels[value] || value || '-';
}

function showPageError(message) {
  const box = document.getElementById('page-error');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hidePageError() {
  document.getElementById('page-error').classList.add('hidden');
}

function setLoading(loading) {
  const el = document.getElementById('page-loading');
  if (!el) {
    return;
  }
  el.classList.toggle('hidden', !loading);
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

function fmtDate(value) {
  if (!value) {
    return '-';
  }
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleString('vi-VN');
}

function upsertInfoLine(id, label, value) {
  let target = document.getElementById(id);
  if (!target) {
    const assignee = document.getElementById('task-assignee');
    const parent = assignee && assignee.closest('div');
    if (!parent) {
      return;
    }
    const line = document.createElement('p');
    line.innerHTML = `<span class="font-semibold">${escapeHtml(label)}:</span> <span id="${id}">-</span>`;
    parent.appendChild(line);
    target = document.getElementById(id);
  }
  target.textContent = value || '-';
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Yêu cầu thất bại');
  }
  return data;
}

async function downloadAttachment(url, fileName) {
  if (!url) {
    throw new Error('Khong tim thay duong dan file');
  }

  if (!url.startsWith('/api/')) {
    window.open(url, '_blank', 'noopener');
    return;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Khong tai duoc file');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function bindFileDownloadButtons(wrap) {
  wrap.querySelectorAll('[data-download-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Dang tai...';
      try {
        await downloadAttachment(button.dataset.downloadUrl, button.dataset.fileName);
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

let blobClientModulePromise;

function safeBlobFileName(name) {
  return String(name || 'file').split(/[\/]/).pop().replace(/[^\w.\-]+/g, '-');
}

async function getBlobClientModule() {
  if (!blobClientModulePromise) {
    blobClientModulePromise = import('@vercel/blob/client');
  }
  return blobClientModulePromise;
}

async function uploadFileToBlob(file, label = 'file') {
  if (!file) {
    return null;
  }

  const { upload } = await getBlobClientModule();
  const safeName = safeBlobFileName(file.name);
  const pathname = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
  const blob = await upload(pathname, file, {
    access: 'private',
    handleUploadUrl: '/api/blob/client-upload',
    headers: { Authorization: `Bearer ${token}` },
    contentType: file.type || 'application/octet-stream',
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => {
      setActionState(`Dang tai ${label}: ${file.name} (${Math.round(percentage)}%)`);
    },
  });

  return { fileName: file.name, storagePath: blob.url, mimeType: file.type || 'application/octet-stream', fileSize: file.size };
}
function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!bytes) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setActionState(text) {
  document.getElementById('action-state').textContent = text;
}

function roleAlias(role) {
  const map = {
    ADMIN: 'admin',
    THAM_DINH: 'thamdinh',
    THAM_DINH_VIEN: 'appraiser',
    TP_DUYET: 'manager',
    KINH_DOANH: 'sales',
  };
  return map[role] || role;
}

async function submitAppraisalUpload(event) {
  event.preventDefault();
  setActionState('Dang tai file...');
  try {
    const note = document.getElementById('appraisal-note').value.trim();
    const file = document.getElementById('appraisal-file').files[0];
    const uploadedFile = file ? await uploadFileToBlob(file, 'file ket qua tham dinh') : null;

    await api(`/api/tasks/${taskId}/upload-appraisal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, uploadedFile }),
    });
    setActionState('Tai file thanh cong');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function submitAssign(event) {
  event.preventDefault();
  setActionState('Đang giao việc...');
  try {
    const reviewerId = Number(document.getElementById('reviewer-id').value);
    await api(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerIds: [reviewerId] }),
    });
    setActionState('Đã giao việc thành công');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function submitReview(event) {
  event.preventDefault();
  setActionState('Dang cap nhat...');
  try {
    const result = document.getElementById('review-result').value;
    const note = document.getElementById('review-note').value.trim();
    const file = document.getElementById('review-file').files[0];
    const uploadedFile = file ? await uploadFileToBlob(file, 'file danh gia') : null;

    await api(`/api/tasks/${taskId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, note, uploadedFile }),
    });
    setActionState('Da trinh duyet ket qua');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function submitApproval(decision) {
  setActionState('Đang xử lý phê duyệt...');
  try {
    await api(`/api/tasks/${taskId}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    setActionState(decision === 'APPROVE' ? 'Đã phê duyệt' : 'Đã từ chối');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function submitToPrint() {
  setActionState('Đang chuyển in ấn...');
  try {
    await api(`/api/tasks/${taskId}/to-print`, { method: 'POST' });
    setActionState('Đã chuyển in ấn');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function submitCompletePrint() {
  setActionState('Dang hoan tat in an...');
  try {
    await api(`/api/tasks/${taskId}/complete-print`, { method: 'POST' });
    setActionState('Da hoan tat in an');
    await loadData();
  } catch (error) {
    setActionState(error.message);
  }
}

async function renderActions(task) {
  const wrap = document.getElementById('action-panel');
  const currentRole = roleAlias(user.role);

  if ((currentRole === 'admin' || currentRole === 'manager') && task.workflow_status === 'new') {
    const reviewers = await api('/api/users/reviewers');
    const options = reviewers
      .map((r) => `<option value="${r.id}">${escapeHtml(r.full_name || r.username)} (${escapeHtml(r.username)})</option>`)
      .join('');

    wrap.innerHTML = `
      <form id="assign-form" class="space-y-2">
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Chọn nhân viên Thẩm định</span>
          <select id="reviewer-id" class="w-full rounded-xl border border-slate-200 px-3 py-2" required>${options}</select>
        </label>
        <button type="submit" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Chỉ định thẩm định viên</button>
      </form>
    `;
    document.getElementById('assign-form').addEventListener('submit', submitAssign);
    return;
  }

  if (currentRole === 'thamdinh' && Number(task.assignee_id) === Number(user.id) && task.current_stage === 'THAM_DINH') {
    wrap.innerHTML = `
      <form id="upload-appraisal-form" class="space-y-2">
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Tải lên kết quả thẩm định</span>
          <input id="appraisal-file" type="file" required class="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Ghi chú</span>
          <textarea id="appraisal-note" rows="3" class="w-full rounded-xl border border-slate-200 px-3 py-2"></textarea>
        </label>
        <button type="submit" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Tải file</button>
      </form>
    `;
    document.getElementById('upload-appraisal-form').addEventListener('submit', submitAppraisalUpload);
    return;
  }

  if (currentRole === 'appraiser' && Number(task.assignee_id) === Number(user.id) && task.current_stage === 'THAM_DINH') {
    wrap.innerHTML = `
      <form id="review-form" class="space-y-2">
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Kết quả</span>
          <select id="review-result" class="w-full rounded-xl border border-slate-200 px-3 py-2" required>
            <option value="DAT">Đạt</option>
            <option value="KHONG_DAT">Không đạt</option>
          </select>
        </label>
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Tải lên kết quả thẩm định</span>
          <input id="review-file" type="file" class="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label class="block space-y-1 text-sm font-semibold text-slate-600">
          <span>Ghi chú</span>
          <textarea id="review-note" rows="3" class="w-full rounded-xl border border-slate-200 px-3 py-2"></textarea>
        </label>
        <button type="submit" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Trình duyệt</button>
      </form>
    `;
    document.getElementById('review-form').addEventListener('submit', submitReview);
    return;
  }

  if (currentRole === 'manager' && task.current_stage === 'TP_DUYET' && task.status === 'IN_PROGRESS') {
    wrap.innerHTML = `
      <div class="space-y-2">
        <button id="approve-btn" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Phe duyet ho so</button>
        <button id="reject-btn" class="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">Tu choi ho so</button>
      </div>
    `;
    document.getElementById('approve-btn').addEventListener('click', () => submitApproval('APPROVE'));
    document.getElementById('reject-btn').addEventListener('click', () => submitApproval('REJECT'));
    return;
  }

  if (currentRole === 'sales' && task.workflow_status === 'approved') {
    wrap.innerHTML = `
      <button id="to-print-btn" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Chuyển in ấn</button>
    `;
    document.getElementById('to-print-btn').addEventListener('click', submitToPrint);
    return;
  }

  wrap.innerHTML = '<p class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-500">Không có hành động khả dụng</p>';
  if (currentRole === 'IN_AN' && task.current_stage === 'IN_AN' && task.status === 'IN_PROGRESS') {
    wrap.innerHTML = `
      <button id="complete-print-btn" class="w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">Hoan tat in an</button>
    `;
    document.getElementById('complete-print-btn').addEventListener('click', submitCompletePrint);
    return;
  }

  wrap.innerHTML = '<p class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-500">Khong co hanh dong kha dung</p>';
}

async function loadData() {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new Error('Hồ sơ không tồn tại');
  }

  setLoading(true);
  const detail = await api(`/api/tasks/${taskId}/detail`);
  if (!detail || !detail.id) {
    throw new Error('Không tìm thấy dữ liệu');
  }

  hidePageError();
  renderTaskInfo(detail);
  upsertInfoLine('task-due', 'Han xu ly', detail.due_at ? fmtDate(detail.due_at) : 'Chua dat han');
  upsertInfoLine('task-sla', 'SLA', slaLabels[detail.sla_status] || detail.sla_status || '-');
  renderFiles(detail.attachments || []);
  renderTimeline(detail.logs || []);
  await renderActions(detail);
  fixMojibakeInDom();
  setLoading(false);
}

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = '/dashboard';
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  window.location.href = '/';
});

(async () => {
  try {
    await loadData();
  } catch (error) {
    setLoading(false);
    if ((error.message || '').toLowerCase().includes('không tồn tại')) {
      showPageError('Hồ sơ không tồn tại');
    } else if ((error.message || '').toLowerCase().includes('không tìm thấy')) {
      showPageError('Không tìm thấy dữ liệu');
    } else {
      showPageError(error.message || 'Không tải được dữ liệu hồ sơ');
    }
    setActionState(error.message);
  }
})();

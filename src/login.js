const stateEl = document.getElementById('auth-state');

function setState(text) {
  stateEl.textContent = text;
}

async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Đăng nhập thất bại');
  }

  return data;
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  setState('Đang xác thực...');

  try {
    const data = await login(username, password);
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('authUser', JSON.stringify(data.user));
    setState('Đăng nhập thành công. Đang chuyển hướng...');
    window.location.href = '/dashboard';
  } catch (error) {
    setState(error.message);
  }
});

(() => {
  const token = localStorage.getItem('authToken');
  if (token) {
    window.location.href = '/dashboard';
    return;
  }
  window.history.replaceState({}, '', '/');
})();

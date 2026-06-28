// Theme
function initTheme() {
  const saved = localStorage.getItem('cka-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cka-theme', next);
  updateThemeBtn(next);
}
function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Nav active link
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === page || (page === '' && href === 'index.html'));
  });
}

// Copy to clipboard
function copyCode(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ 복사됨';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1500);
  });
}

// Tab switcher
function initTabs(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const panels = document.querySelectorAll('.tab-panel');
  group.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b === btn));
      panels.forEach(p => p.classList.toggle('on', p.id === 'tab-' + target));
    });
  });
  // activate first
  const first = group.querySelector('.tab-btn');
  if (first) first.click();
}

// Toggle card
function toggleCard(headEl) {
  const body = headEl.nextElementSibling;
  const arrow = headEl.querySelector('.toggle-arrow');
  const open = body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open', open);
}

// Storage helpers
const STORE_KEY = 'cka-tracker-v2';
const CLOUD_CFG_KEY = 'cka-github-sync-v1';
const CLOUD_DEFAULT_PATH = 'tracker-state.json';
let _state = null;
let _cloudTimer = null;
let _cloudPushInFlight = false;
let _cloudPushQueued = false;

function getState() {
  if (_state) return _state;
  try { _state = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch(e) { _state = {}; }
  return _state;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(_state)); } catch(e) {}
}
function stateSet(key, val) {
  getState()[key] = val;
  saveState();
  scheduleCloudPush();
}
function stateGet(key) { return getState()[key]; }

function getCloudConfig() {
  try { return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)) || {}; } catch(e) { return {}; }
}
function saveCloudConfig(cfg) {
  localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify({
    owner: (cfg.owner || '').trim(),
    repo: (cfg.repo || '').trim(),
    branch: (cfg.branch || 'main').trim(),
    path: (cfg.path || CLOUD_DEFAULT_PATH).trim(),
    token: (cfg.token || '').trim(),
    auto: cfg.auto === true
  }));
}
function cloudReady(cfg = getCloudConfig()) {
  return Boolean(cfg.owner && cfg.repo && cfg.branch && cfg.path && cfg.token);
}
function cloudStatus(msg, isError = false) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', isError);
}
function encodeBase64Unicode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
function decodeBase64Unicode(value) {
  const binary = atob((value || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function cloudFilePath(cfg) {
  return (cfg.path || CLOUD_DEFAULT_PATH).split('/').map(encodeURIComponent).join('/');
}
function cloudReadUrl(cfg) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cloudFilePath(cfg)}?ref=${encodeURIComponent(cfg.branch || 'main')}`;
}
function cloudWriteUrl(cfg) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cloudFilePath(cfg)}`;
}
async function fetchCloudFile(cfg) {
  const res = await fetch(cloudReadUrl(cfg), {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (res.status === 404) return { sha: null, state: {} };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const data = await res.json();
  const parsed = JSON.parse(decodeBase64Unicode(data.content || '{}') || '{}');
  return { sha: data.sha, state: parsed.state || parsed || {} };
}
async function pushCloudState(message = 'Update CKA tracker state') {
  const cfg = getCloudConfig();
  if (!cloudReady(cfg)) {
    cloudStatus('GitHub sync is not configured.', true);
    return false;
  }
  if (_cloudPushInFlight) {
    _cloudPushQueued = true;
    cloudStatus('Sync queued...');
    return false;
  }

  _cloudPushInFlight = true;
  try {
    cloudStatus('Syncing to GitHub...');
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await fetchCloudFile(cfg);
      const body = {
        message,
        content: encodeBase64Unicode(JSON.stringify({
          updatedAt: new Date().toISOString(),
          state: getState()
        }, null, 2)),
        branch: cfg.branch || 'main'
      };
      if (remote.sha) body.sha = remote.sha;

      const res = await fetch(cloudWriteUrl(cfg), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        cloudStatus(`Synced ${new Date().toLocaleTimeString()}`);
        return true;
      }
      if (res.status === 409 && attempt === 0) continue;
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch(e) {}
      throw new Error(`GitHub write failed (${res.status})${detail ? ': ' + detail : ''}`);
    }
    return false;
  } finally {
    _cloudPushInFlight = false;
    if (_cloudPushQueued) {
      _cloudPushQueued = false;
      clearTimeout(_cloudTimer);
      _cloudTimer = setTimeout(() => {
        pushCloudState().catch(e => cloudStatus(e.message, true));
      }, 800);
    }
  }
}
async function pullCloudState() {
  const cfg = getCloudConfig();
  if (!cloudReady(cfg)) {
    cloudStatus('GitHub sync is not configured.', true);
    return false;
  }
  cloudStatus('Loading from GitHub...');
  const remote = await fetchCloudFile(cfg);
  _state = remote.state || {};
  saveState();
  cloudStatus(`Loaded ${new Date().toLocaleTimeString()}`);
  document.dispatchEvent(new CustomEvent('cka-state-updated'));
  return true;
}
async function initCloudState() {
  const cfg = getCloudConfig();
  if (cfg.auto && cloudReady(cfg)) {
    try { await pullCloudState(); } catch(e) { cloudStatus(e.message, true); }
  }
}
function scheduleCloudPush() {
  const cfg = getCloudConfig();
  if (!cfg.auto || !cloudReady(cfg)) return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(() => {
    pushCloudState().catch(e => cloudStatus(e.message, true));
  }, 2500);
}
function renderSyncPanel() {
  const panel = document.getElementById('sync-panel');
  if (!panel) return;
  const cfg = getCloudConfig();
  panel.innerHTML = `
    <div class="sync-grid">
      <input id="sync-owner" class="sync-input" placeholder="GitHub owner" value="${cfg.owner || ''}">
      <input id="sync-repo" class="sync-input" placeholder="repo" value="${cfg.repo || ''}">
      <input id="sync-branch" class="sync-input" placeholder="branch" value="${cfg.branch || 'main'}">
      <input id="sync-path" class="sync-input" placeholder="tracker-state.json" value="${cfg.path || CLOUD_DEFAULT_PATH}">
      <input id="sync-token" class="sync-input sync-token" type="password" placeholder="Fine-grained token" value="${cfg.token || ''}">
      <label class="sync-auto"><input id="sync-auto" type="checkbox" ${cfg.auto ? 'checked' : ''}> Auto sync</label>
    </div>
    <div class="sync-actions">
      <button class="sync-btn" id="sync-save">Save settings</button>
      <button class="sync-btn" id="sync-pull">Pull</button>
      <button class="sync-btn primary" id="sync-push">Push</button>
      <span id="sync-status" class="sync-status">${cloudReady(cfg) ? 'Ready' : 'Not configured'}</span>
    </div>`;

  document.getElementById('sync-save').addEventListener('click', () => {
    saveCloudConfig({
      owner: document.getElementById('sync-owner').value,
      repo: document.getElementById('sync-repo').value,
      branch: document.getElementById('sync-branch').value,
      path: document.getElementById('sync-path').value,
      token: document.getElementById('sync-token').value,
      auto: document.getElementById('sync-auto').checked
    });
    cloudStatus('Settings saved');
  });
  document.getElementById('sync-pull').addEventListener('click', () => pullCloudState().catch(e => cloudStatus(e.message, true)));
  document.getElementById('sync-push').addEventListener('click', () => pushCloudState().catch(e => cloudStatus(e.message, true)));
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setActiveNav();
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
  renderSyncPanel();
});

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
  group.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b === btn));
      group.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('on', p.id === 'tab-' + target));
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
let _state = null;
function getState() {
  if (_state) return _state;
  try { _state = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch(e) { _state = {}; }
  return _state;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(_state)); } catch(e) {}
}
function stateSet(key, val) { getState()[key] = val; saveState(); }
function stateGet(key) { return getState()[key]; }

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setActiveNav();
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
});

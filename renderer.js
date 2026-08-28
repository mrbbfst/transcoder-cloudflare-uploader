window.onerror = function(msg, url, lineNo, columnNo, error) {
  const fileName = url ? url.split('/').pop() : 'renderer.js';
  console.error(`🔴 UNCAUGHT RENDERER ERROR: ${msg} (${fileName}:${lineNo}:${columnNo})`, error);
  alert(`🔴 Помилка в інтерфейсі (L${lineNo}):\n${msg}`);
  return false;
};

window.onunhandledrejection = function(event) {
  console.error(`🔴 UNHANDLED PROMISE REJECTION:`, event.reason);
};

document.addEventListener('DOMContentLoaded', async () => {
  // Handle all external links to open in OS default browser
  const affiBlogLink = document.getElementById('affi-blog-link');
  if (affiBlogLink) {
    affiBlogLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternal('https://affi.blog?source=hls-transcoder');
    });
  }

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && href !== '#' && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault();
        window.api.openExternal(href);
      }
    }
  });

  // Navigation elements
  const navTranscodeBtn = document.getElementById('nav-transcode-btn');
  const navExplorerBtn = document.getElementById('nav-explorer-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const navHelpBtn = document.getElementById('nav-help-btn');
  const viewTranscode = document.getElementById('view-transcode');
  const viewExplorer = document.getElementById('view-explorer');
  const viewSettings = document.getElementById('view-settings');
  const viewHelp = document.getElementById('view-help');

  // Explorer elements
  const explorerCreateFolderBtn = document.getElementById('explorer-create-folder-btn');
  const explorerUploadBtn = document.getElementById('explorer-upload-btn');
  const explorerDeleteSelectedBtn = document.getElementById('explorer-delete-selected-btn');
  const explorerRefreshBtn = document.getElementById('explorer-refresh-btn');
  const explorerBreadcrumbs = document.getElementById('explorer-breadcrumbs');
  const explorerListBody = document.getElementById('explorer-list-body');
  const explorerStatus = document.getElementById('explorer-status');
  const selectAllExplorer = document.getElementById('select-all-explorer');

  // Form & Quality Controls
  const qualityCheckboxes = document.querySelectorAll('.quality-checkbox');
  const startBtn = document.getElementById('start-btn');

  let currentExplorerPrefix = '';

  // --- Tab Navigation ---
  function setActiveTab(tab) {
    navTranscodeBtn.classList.toggle('active', tab === 'transcode');
    navExplorerBtn.classList.toggle('active', tab === 'explorer');
    navSettingsBtn.classList.toggle('active', tab === 'settings');
    if (navHelpBtn) navHelpBtn.classList.toggle('active', tab === 'help');

    viewTranscode.classList.toggle('hidden', tab !== 'transcode');
    viewExplorer.classList.toggle('hidden', tab !== 'explorer');
    viewSettings.classList.toggle('hidden', tab !== 'settings');
    if (viewHelp) viewHelp.classList.toggle('hidden', tab !== 'help');

    if (tab === 'explorer') {
      loadExplorer(currentExplorerPrefix);
    } else if (tab === 'settings') {
      loadSettings();
    }
  }

  navTranscodeBtn.addEventListener('click', () => setActiveTab('transcode'));
  navExplorerBtn.addEventListener('click', () => setActiveTab('explorer'));
  navSettingsBtn.addEventListener('click', () => setActiveTab('settings'));
  if (navHelpBtn) navHelpBtn.addEventListener('click', () => setActiveTab('help'));

  try {
    const version = await window.api.getAppVersion();
    if (version) {
      document.querySelectorAll('.app-version-val').forEach(el => {
        el.textContent = `v${version}`;
      });
    }
  } catch (e) {}

  // --- Explorer Logic ---
  async function loadExplorer(prefix = '') {
    currentExplorerPrefix = prefix;
    renderBreadcrumbs(prefix);

    if (selectAllExplorer) selectAllExplorer.checked = false;
    if (explorerDeleteSelectedBtn) explorerDeleteSelectedBtn.disabled = true;

    explorerStatus.className = 'explorer-status info';
    explorerStatus.textContent = 'Завантаження вмісту R2 бакета...';
    explorerStatus.classList.remove('hidden');
    explorerListBody.innerHTML = '';

    const res = await window.api.listR2Objects(prefix);
    if (!res.success) {
      explorerStatus.className = 'explorer-status error';
      explorerStatus.textContent = res.error;
      return;
    }

    explorerStatus.classList.add('hidden');
    renderExplorerList(res.folders, res.files, prefix);
  }

  // --- Helper: Custom Modal Input Prompt ---
  function showPromptModal({ title, desc, placeholder = '', initialValue = '' }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-input-modal');
      const titleEl = document.getElementById('modal-title');
      const descEl = document.getElementById('modal-desc');
      const inputEl = document.getElementById('modal-input');
      const cancelBtn = document.getElementById('modal-cancel-btn');
      const confirmBtn = document.getElementById('modal-confirm-btn');

      if (!modal || !inputEl) {
        resolve(null);
        return;
      }

      titleEl.textContent = title;
      descEl.textContent = desc;
      inputEl.placeholder = placeholder;
      inputEl.value = initialValue;
      modal.classList.remove('hidden');
      setTimeout(() => inputEl.focus(), 50);

      const cleanup = () => {
        modal.classList.add('hidden');
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        inputEl.removeEventListener('keydown', onKeyDown);
      };

      const onCancel = () => {
        cleanup();
        resolve(null);
      };

      const onConfirm = () => {
        const val = inputEl.value.trim();
        cleanup();
        resolve(val);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Enter') onConfirm();
        if (e.key === 'Escape') onCancel();
      };

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      inputEl.addEventListener('keydown', onKeyDown);
    });
  }

  explorerRefreshBtn.addEventListener('click', () => loadExplorer(currentExplorerPrefix));

  if (explorerCreateFolderBtn) {
    explorerCreateFolderBtn.addEventListener('click', async () => {
      const folderName = await showPromptModal({
        title: 'Створення нової папки',
        desc: 'Введіть назву для нової папки в R2 бакеті:',
        placeholder: 'наприклад: my-hls-folder'
      });

      if (!folderName) return;

      explorerStatus.className = 'explorer-status info';
      explorerStatus.textContent = `Створення папки "${folderName}" у R2...`;
      explorerStatus.classList.remove('hidden');
      disableExplorerControls(true);

      const res = await window.api.createR2Folder({
        prefix: currentExplorerPrefix,
        folderName
      });

      disableExplorerControls(false);
      if (res.success) {
        loadExplorer(currentExplorerPrefix);
      } else {
        alert(`Помилка створення папки: ${res.error}`);
        explorerStatus.classList.add('hidden');
      }
    });
  }

  if (explorerUploadBtn) {
    explorerUploadBtn.addEventListener('click', async () => {
      const res = await window.api.uploadAnyR2File(currentExplorerPrefix);
      if (res.success) {
        loadExplorer(currentExplorerPrefix);
      } else if (res.error) {
        alert(`Помилка завантаження файла: ${res.error}`);
      }
    });
  }

  if (selectAllExplorer) {
    selectAllExplorer.addEventListener('change', () => {
      const rowCheckboxes = explorerListBody.querySelectorAll('.item-checkbox');
      rowCheckboxes.forEach(cb => cb.checked = selectAllExplorer.checked);
      updateBatchDeleteButtonState();
    });
  }

  function updateBatchDeleteButtonState() {
    const checkedCount = explorerListBody.querySelectorAll('.item-checkbox:checked').length;
    if (explorerDeleteSelectedBtn) {
      explorerDeleteSelectedBtn.disabled = checkedCount === 0;
      const textSpan = explorerDeleteSelectedBtn.querySelector('span');
      if (textSpan) {
        textSpan.textContent = checkedCount > 0 ? `Видалити обрані (${checkedCount})` : 'Видалити обрані';
      }
    }
  }

  function disableExplorerControls(disabled) {
    if (explorerCreateFolderBtn) explorerCreateFolderBtn.disabled = disabled;
    if (explorerUploadBtn) explorerUploadBtn.disabled = disabled;
    if (explorerDeleteSelectedBtn) explorerDeleteSelectedBtn.disabled = disabled;
    if (explorerRefreshBtn) explorerRefreshBtn.disabled = disabled;
    if (selectAllExplorer) selectAllExplorer.disabled = disabled;
    if (explorerListBody) {
      explorerListBody.querySelectorAll('button, input').forEach(el => el.disabled = disabled);
    }
  }

  if (explorerDeleteSelectedBtn) {
    explorerDeleteSelectedBtn.addEventListener('click', async () => {
      const checkedBoxes = Array.from(explorerListBody.querySelectorAll('.item-checkbox:checked'));
      if (checkedBoxes.length === 0) return;

      const items = checkedBoxes.map(cb => ({
        key: cb.getAttribute('data-key'),
        isFolder: cb.getAttribute('data-is-folder') === 'true'
      }));

      if (confirm(`Ви дійсно бажаєте видалити ${items.length} обраних елементів?`)) {
        explorerDeleteSelectedBtn.disabled = true;
        const textSpan = explorerDeleteSelectedBtn.querySelector('span');
        if (textSpan) textSpan.textContent = 'Видалення...';
        explorerStatus.className = 'explorer-status info';
        explorerStatus.textContent = `Видалення ${items.length} обраних елементів з R2 бакета... (зачекайте)`;
        explorerStatus.classList.remove('hidden');
        disableExplorerControls(true);

        const res = await window.api.deleteBatchR2Objects(items);
        if (res.success) {
          loadExplorer(currentExplorerPrefix);
        } else {
          alert(`Помилка групового видалення: ${res.error}`);
          disableExplorerControls(false);
        }
      }
    });
  }

  function renderBreadcrumbs(prefix) {
    const parts = prefix.split('/').filter(Boolean);
    let html = `<span class="crumb" data-prefix="">root</span>`;
    let accum = '';

    parts.forEach((part) => {
      accum += `${part}/`;
      html += ` <span class="crumb-sep">/</span> <span class="crumb" data-prefix="${accum}">${part}</span>`;
    });

    explorerBreadcrumbs.innerHTML = html;

    explorerBreadcrumbs.querySelectorAll('.crumb').forEach(el => {
      el.addEventListener('click', () => {
        loadExplorer(el.getAttribute('data-prefix'));
      });
    });
  }

  function renderExplorerList(folders, files, prefix) {
    let html = '';

    const folderSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" style="vertical-align: middle; margin-right: 6px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const playSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" style="vertical-align: middle; margin-right: 6px;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    const fileSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    const trashSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    const copySvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

    // Up parent directory row
    if (prefix) {
      const parts = prefix.split('/').filter(Boolean);
      parts.pop();
      const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
      html += `
        <tr class="explorer-row folder-row" data-prefix="${parentPrefix}">
          <td></td>
          <td>${folderSvg}<strong>.. (на рівень вище)</strong></td>
          <td>Папка</td>
          <td>-</td>
          <td>-</td>
          <td class="text-right"></td>
        </tr>
      `;
    }

    if (folders.length === 0 && files.length === 0) {
      html += `
        <tr>
          <td colspan="6" class="text-center text-muted">Папка порожня або вміст відсутній</td>
        </tr>
      `;
    }

    // Render folders
    folders.forEach(f => {
      html += `
        <tr class="explorer-row folder-row" data-prefix="${f.prefix}">
          <td style="text-align: center;"><input type="checkbox" class="item-checkbox" data-key="${escapeHtml(f.prefix)}" data-is-folder="true" /></td>
          <td>${folderSvg}<strong>${escapeHtml(f.name)}</strong></td>
          <td>Папка HLS</td>
          <td>-</td>
          <td>-</td>
          <td class="text-right">
            <button class="btn-xs btn-danger delete-folder-btn" data-prefix="${f.prefix}" data-name="${escapeHtml(f.name)}" style="display: inline-flex; align-items: center; gap: 4px;">
              ${trashSvg}
              <span>Видалити</span>
            </button>
          </td>
        </tr>
      `;
    });

    // Render files
    files.forEach(file => {
      const iconSvg = file.isM3u8 ? playSvg : fileSvg;
      const formattedSize = formatBytes(file.size);
      const formattedDate = file.lastModified ? new Date(file.lastModified).toLocaleString('uk-UA') : '-';

      html += `
        <tr class="explorer-row file-row">
          <td style="text-align: center;"><input type="checkbox" class="item-checkbox" data-key="${escapeHtml(file.key)}" data-is-folder="false" /></td>
          <td>${iconSvg}${escapeHtml(file.name)}</td>
          <td>${file.isM3u8 ? '<strong>M3U8 Playlist</strong>' : 'Файл'}</td>
          <td>${formattedSize}</td>
          <td>${formattedDate}</td>
          <td class="text-right">
            ${file.cdnUrl ? `<button class="btn-xs btn-success copy-cdn-btn" data-url="${escapeHtml(file.cdnUrl)}" style="display: inline-flex; align-items: center; gap: 4px;">${copySvg}<span>CDN URL</span></button>` : ''}
            <button class="btn-xs btn-danger delete-file-btn" data-key="${escapeHtml(file.key)}" data-name="${escapeHtml(file.name)}" style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px;">${trashSvg}</button>
          </td>
        </tr>
      `;
    });

    explorerListBody.innerHTML = html;

    // Attach checkbox events
    explorerListBody.querySelectorAll('.item-checkbox').forEach(cb => {
      cb.addEventListener('change', updateBatchDeleteButtonState);
    });

    // Attach row events
    explorerListBody.querySelectorAll('.folder-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const targetPrefix = row.getAttribute('data-prefix');
        loadExplorer(targetPrefix);
      });
    });

    explorerListBody.querySelectorAll('.copy-cdn-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        navigator.clipboard.writeText(url);
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Скопійовано!';
        setTimeout(() => {
          if (span) span.textContent = 'CDN URL';
        }, 2000);
      });
    });

    explorerListBody.querySelectorAll('.delete-file-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-key');
        const name = btn.getAttribute('data-name');
        if (confirm(`Ви впевнені, що хочете видалити файл "${name}"?`)) {
          btn.disabled = true;
          explorerStatus.className = 'explorer-status info';
          explorerStatus.textContent = `Видалення файла "${name}" з R2...`;
          explorerStatus.classList.remove('hidden');
          disableExplorerControls(true);

          const res = await window.api.deleteR2Object({ key, isFolder: false });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення: ${res.error}`);
            btn.disabled = false;
            disableExplorerControls(false);
          }
        }
      });
    });

    explorerListBody.querySelectorAll('.delete-folder-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prefix = btn.getAttribute('data-prefix');
        const name = btn.getAttribute('data-name');
        if (confirm(`Ви дійсно хочете повністю видалити папку "${name}" та всі її HLS файли?`)) {
          btn.disabled = true;
          const span = btn.querySelector('span');
          if (span) span.textContent = 'Видалення...';
          explorerStatus.className = 'explorer-status info';
          explorerStatus.textContent = `Видалення папки "${name}" та усіх її HLS файлів з R2... (зачекайте)`;
          explorerStatus.classList.remove('hidden');
          disableExplorerControls(true);

          const res = await window.api.deleteR2Object({ key: prefix, isFolder: true });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення папки: ${res.error}`);
            btn.disabled = false;
            if (span) span.textContent = 'Видалити';
            disableExplorerControls(false);
          }
        }
      });
    });
  }


  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }


  // File selection elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const selectFileBtn = document.getElementById('select-file-btn');
  const changeFileBtn = document.getElementById('change-file-btn');
  const dropContentEmpty = document.getElementById('drop-content-empty');
  const dropContentSelected = document.getElementById('drop-content-selected');
  const selectedFilename = document.getElementById('selected-filename');
  const selectedFilesize = document.getElementById('selected-filesize');

  // Options & Actions
  const folderNameInput = document.getElementById('folder-name-input');
  const randomSuffixCheck = document.getElementById('random-suffix-check');
  const keepLocalCheck = document.getElementById('keep-local-check');

  // Progress Section
  const progressCard = document.getElementById('progress-card');
  const statusSpinner = document.getElementById('status-spinner');
  const statusText = document.getElementById('status-text');
  const stopBtn = document.getElementById('stop-btn');
  const transcodeStatusText = document.getElementById('transcode-status-text');
  const transcodeBar = document.getElementById('transcode-bar');
  const transcodePercent = document.getElementById('transcode-percent');
  const uploadStatusText = document.getElementById('upload-status-text');
  const uploadBar = document.getElementById('upload-bar');
  const uploadPercent = document.getElementById('upload-percent');

  // Stop button handler
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopBtn.disabled = true;
      statusText.textContent = 'Зупинка обробки...';
      window.api.stopProcessing();
    });
  }

  window.api.onCancelled(() => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = '🛑 Процес було зупинено користувачем.';
    if (stopBtn) stopBtn.disabled = false;
    startBtn.disabled = false;
  });

  // Result Section
  const resultCard = document.getElementById('result-card');
  const masterUrlInput = document.getElementById('master-url-input');
  const copyUrlBtn = document.getElementById('copy-url-btn');

  // R2 Settings elements
  const r2AccountId = document.getElementById('r2-account-id');
  const r2AccessKey = document.getElementById('r2-access-key');
  const r2SecretKey = document.getElementById('r2-secret-key');
  const r2BucketName = document.getElementById('r2-bucket-name');
  const r2PublicDomain = document.getElementById('r2-public-domain');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const testSettingsBtn = document.getElementById('test-settings-btn');
  const settingsSavedMsg = document.getElementById('settings-saved-msg');
  const settingsTestMsg = document.getElementById('settings-test-msg');
  const DEFAULT_PROXY_URL = 'https://transcoding.ss.3w.com.ua';

  // Proxy & Telegram Auth Settings elements
  const proxyUrlInput = document.getElementById('proxy-url-input');
  const tgAuthUnlogged = document.getElementById('tg-auth-unlogged');
  const tgAuthPending = document.getElementById('tg-auth-pending');
  const tgAuthLogged = document.getElementById('tg-auth-logged');
  const tgLoginBtn = document.getElementById('tg-login-btn');
  const tgOtpCode = document.getElementById('tg-otp-code');
  const tgBotLink = document.getElementById('tg-bot-link');
  const tgUserInfo = document.getElementById('tg-user-info');
  const tgRefreshBtn = document.getElementById('tg-refresh-btn');
  const tgLogoutBtn = document.getElementById('tg-logout-btn');

  let tgAuthToken = '';
  let authPollInterval = null;

  // Header User Widget Elements
  const headerAuthBtn = document.getElementById('header-auth-btn');
  const headerUserLogged = document.getElementById('header-user-logged');
  const headerBalanceBadge = document.getElementById('header-balance-badge');
  const headerTopupBtn = document.getElementById('header-topup-btn');

  if (headerAuthBtn) {
    headerAuthBtn.addEventListener('click', () => {
      if (navSettingsBtn) navSettingsBtn.click();
    });
  }

  let balancePollInterval = null;

  async function openTopupBot() {
    try {
      const res = await fetch(`${DEFAULT_PROXY_URL}/api/user/topup-link`);
      if (res.ok) {
        const data = await res.json();
        window.open(data.botLink, '_blank');
      } else {
        window.open('https://t.me/', '_blank');
      }
    } catch (err) {
      alert('Не вдалося отримати посилання на бота з сервера.');
    }

    // Auto poll balance every 3s for 60 seconds after opening topup
    let pollCount = 0;
    if (balancePollInterval) clearInterval(balancePollInterval);
    balancePollInterval = setInterval(async () => {
      pollCount++;
      await checkTelegramAuth();
      if (pollCount >= 20) clearInterval(balancePollInterval);
    }, 3000);
  }

  if (headerTopupBtn) {
    headerTopupBtn.addEventListener('click', openTopupBot);
  }

  // Dynamic Pricing Cache (in USD $)
  let serverPricing = {
    minCostUsd: 0.05,
    ratesPerMinuteUsd: { '1080p': 0.02, '720p': 0.01, '480p': 0.005, '360p': 0.003 }
  };

  const cloudCreditCalcBox = document.getElementById('cloud-credit-calc-box');
  const calcCreditAmount = document.getElementById('calc-credit-amount');
  const calcCreditSub = document.getElementById('calc-credit-sub');

  async function fetchServerPricing() {
    try {
      const res = await fetch(`${DEFAULT_PROXY_URL}/api/transcode/pricing`);
      if (res.ok) {
        serverPricing = await res.json();
      }
    } catch (e) {}
    updateCreditCalculator();
  }

  const calcGpuTime = document.getElementById('calc-gpu-time');
  const calcCpuTime = document.getElementById('calc-cpu-time');
  const calcSpeedRatio = document.getElementById('calc-speed-ratio');
  const viewRatesLink = document.getElementById('view-rates-link');

  if (viewRatesLink) {
    viewRatesLink.addEventListener('click', () => {
      const rates1080 = serverPricing.ratesPerMinuteUsd ? (serverPricing.ratesPerMinuteUsd['1080p'] || 0.02) : 0.02;
      const rates720 = serverPricing.ratesPerMinuteUsd ? (serverPricing.ratesPerMinuteUsd['720p'] || 0.012) : 0.012;
      const rates480 = serverPricing.ratesPerMinuteUsd ? (serverPricing.ratesPerMinuteUsd['480p'] || 0.006) : 0.006;
      const rates360 = serverPricing.ratesPerMinuteUsd ? (serverPricing.ratesPerMinuteUsd['360p'] || 0.004) : 0.004;

      let ratesMsg = `📊 ТАРИФНА СІТКА ХМАРНОГО GPU:\n\n` +
        `• 1080p Full HD: $${rates1080.toFixed(3)} / хв\n` +
        `• 720p HD: $${rates720.toFixed(3)} / хв\n` +
        `• 480p SD: $${rates480.toFixed(3)} / хв\n` +
        `• 360p Mobile: $${rates360.toFixed(3)} / хв\n\n` +
        `💡 Мінімальна вартість одного відео: $${(serverPricing.minCostUsd || 0.05).toFixed(2)}\n` +
        `⚡ Розрахунки проводяться з точністю до мікро-долара ($0.00001).`;
      alert(ratesMsg);
    });
  }

  function updateCreditCalculator() {
    const modeRadio = document.querySelector('input[name="transcode-mode"]:checked');
    const isCloud = modeRadio && modeRadio.value === 'cloud';
    const activeQualities = Array.from(qualityCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

    const durationSec = (selectedFile && selectedFile.duration) ? selectedFile.duration : 60;
    const minutes = Math.max(1, Math.ceil(durationSec / 60));

    let ratePerMin = 0;
    for (const q of activeQualities) {
      ratePerMin += ((serverPricing.ratesPerMinuteUsd && serverPricing.ratesPerMinuteUsd[q]) || 0.005);
    }

    const calculated = Number((minutes * ratePerMin).toFixed(2));
    const totalCostUsd = Math.max(serverPricing.minCostUsd || 0.05, calculated);

    // Dynamic cost badges for quality checkboxes
    document.querySelectorAll('.q-cost-badge').forEach(badge => {
      const q = badge.getAttribute('data-quality');
      if (isCloud) {
        const qRate = (serverPricing.ratesPerMinuteUsd && serverPricing.ratesPerMinuteUsd[q]) || 0.005;
        const qCost = selectedFile ? (minutes * qRate).toFixed(2) : (qRate * 1).toFixed(3);
        badge.textContent = selectedFile ? `+$${qCost}` : `+$${qRate.toFixed(3)}/хв`;
        badge.style.display = 'inline-block';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    });

    // Dynamic Start Button Label & Insufficient Balance Validation
    if (startBtn) {
      const startBtnSpan = document.getElementById('start-btn-text') || startBtn;
      const hasQualities = activeQualities.length > 0;
      if (isProcessingActive) {
        startBtn.disabled = true;
        startBtnSpan.textContent = 'Обробка триває...';
      } else if (isCloud) {
        if (currentUserBalanceUsd !== null && selectedFile && currentUserBalanceUsd < totalCostUsd) {
          startBtn.disabled = true;
          startBtnSpan.textContent = `Недостатньо коштів ($${totalCostUsd.toFixed(2)} | Баланс: $${currentUserBalanceUsd.toFixed(2)})`;
        } else if (selectedFile) {
          startBtn.disabled = !hasQualities;
          startBtnSpan.textContent = `Транскодувати за $${totalCostUsd.toFixed(2)} та завантажити в S3 сховище`;
        } else {
          startBtn.disabled = true;
          startBtnSpan.textContent = 'Транскодувати в Хмарі та завантажити в S3 сховище';
        }
      } else {
        startBtn.disabled = !(selectedFile && hasQualities);
        startBtnSpan.textContent = 'Розпочати транскодування та завантаження';
      }
    }

    if (!isCloud || !selectedFile) {
      if (cloudCreditCalcBox) cloudCreditCalcBox.classList.add('hidden');
      return;
    }

    if (cloudCreditCalcBox) cloudCreditCalcBox.classList.remove('hidden');

    // Dynamic Time Estimator based on File Size, Duration, and Selected Qualities
    const fileSizeMb = selectedFile.size ? (selectedFile.size / (1024 * 1024)) : 100;

    const gpuWorkloadFactors = { '1080p': 1.0, '720p': 0.5, '480p': 0.25, '360p': 0.15 };
    const cpuWorkloadFactors = { '1080p': 1.0, '720p': 0.6, '480p': 0.35, '360p': 0.20 };

    let totalGpuFactor = 0;
    let totalCpuFactor = 0;

    for (const q of activeQualities) {
      totalGpuFactor += (gpuWorkloadFactors[q] || 0.5);
      totalCpuFactor += (cpuWorkloadFactors[q] || 0.5);
    }

    // Video Duration Formatter (MM:SS or HH:MM:SS)
    function formatExactDuration(seconds) {
      const s = Math.round(seconds);
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      if (hrs > 0) {
        return `${hrs} год ${mins} хв ${secs} сек`;
      }
      return `${mins} хв ${secs} сек`;
    }

    const videoDurFormatted = formatExactDuration(durationSec);

    // Parallel NVENC GPU hardware encoding vs Local CPU software encoding
    const transferOverheadSec = Math.ceil(15 + (fileSizeMb / 15));
    const pureGpuEncodeSec = Math.ceil(durationSec / 6.5);
    const estimatedGpuSec = Math.max(25, transferOverheadSec + pureGpuEncodeSec);
    const estimatedCpuSec = Math.max(60, Math.ceil(durationSec * totalCpuFactor * 1.8));

    function formatTimeDuration(seconds) {
      if (seconds < 60) return `~${seconds} сек`;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (mins < 60) return secs > 0 ? `~${mins} хв ${secs} сек` : `~${mins} хв`;
      const hrs = (mins / 60).toFixed(1);
      return `~${hrs} год`;
    }

    const gpuFormatted = formatTimeDuration(estimatedGpuSec);
    const cpuFormatted = formatTimeDuration(estimatedCpuSec);
    const speedRatio = Math.max(2, Math.round(estimatedCpuSec / estimatedGpuSec));

    if (calcCreditAmount) calcCreditAmount.textContent = `$${totalCostUsd.toFixed(2)}`;
    if (calcGpuTime) calcGpuTime.textContent = gpuFormatted;
    if (calcCpuTime) calcCpuTime.textContent = cpuFormatted;
    if (calcSpeedRatio) calcSpeedRatio.textContent = `${speedRatio}х`;
  }

  let currentUserBalanceUsd = null;

  function showTgAuthState(state) {
    if (tgAuthUnlogged) tgAuthUnlogged.classList.toggle('hidden', state !== 'unlogged');
    if (tgAuthPending) tgAuthPending.classList.toggle('hidden', state !== 'pending');
    if (tgAuthLogged) tgAuthLogged.classList.toggle('hidden', state !== 'logged');

    if (headerAuthBtn) headerAuthBtn.classList.toggle('hidden', state === 'logged');
    if (headerUserLogged) headerUserLogged.classList.toggle('hidden', state !== 'logged');
  }

  async function checkTelegramAuth() {
    if (!tgAuthToken) {
      currentUserBalanceUsd = null;
      showTgAuthState('unlogged');
      return;
    }

    try {
      const res = await fetch(`${DEFAULT_PROXY_URL}/api/user/me?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${tgAuthToken}` }
      });
      if (res.ok) {
        const user = await res.json();
        currentUserBalanceUsd = user.balanceUsd !== undefined ? user.balanceUsd : 0;
        const formattedBal = user.formattedBalance || `$${(currentUserBalanceUsd).toFixed(2)}`;
        if (tgUserInfo) tgUserInfo.textContent = `@${user.username || user.firstName || user.telegramId} | Баланс: ${formattedBal}`;
        if (headerBalanceBadge) {
          const balText = headerBalanceBadge.querySelector('#header-balance-text');
          if (balText) balText.textContent = formattedBal;
        }
        showTgAuthState('logged');
        updateCreditCalculator();
      } else {
        tgAuthToken = '';
        currentUserBalanceUsd = null;
        showTgAuthState('unlogged');
      }
    } catch (err) {
      if (tgUserInfo) tgUserInfo.textContent = '⚠️ Хмарний сервер тимчасово недоступний';
      showTgAuthState('logged');
    }
  }

  if (headerBalanceBadge) {
    headerBalanceBadge.style.cursor = 'pointer';
    headerBalanceBadge.title = 'Клацніть для оновлення балансу';
    headerBalanceBadge.addEventListener('click', checkTelegramAuth);
  }

  // Periodic background balance refresh every 10 seconds
  setInterval(() => {
    if (tgAuthToken) checkTelegramAuth();
  }, 10000);

  if (tgLoginBtn) {
    tgLoginBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`${DEFAULT_PROXY_URL}/api/auth/request-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Сервер повернув помилку ${res.status}`);
        }

        const data = await res.json();
        if (tgOtpCode) tgOtpCode.textContent = data.code;
        if (tgBotLink) tgBotLink.href = data.botDeepLink;
        showTgAuthState('pending');

        if (authPollInterval) clearInterval(authPollInterval);
        authPollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`${DEFAULT_PROXY_URL}/api/auth/verify-code`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: data.code })
            });
            const pollData = await pollRes.json();
            if (pollData.confirmed && pollData.token) {
              clearInterval(authPollInterval);
              tgAuthToken = pollData.token;
              saveSettingsBtn.click();
              checkTelegramAuth();
            }
          } catch (e) {}
        }, 2000);
      } catch (err) {
        alert('Помилка підключення до хмарного сервера: ' + err.message);
      }
    });
  }

  if (tgRefreshBtn) tgRefreshBtn.addEventListener('click', checkTelegramAuth);

  if (tgLogoutBtn) {
    tgLogoutBtn.addEventListener('click', () => {
      if (authPollInterval) clearInterval(authPollInterval);
      tgAuthToken = '';
      saveSettingsBtn.click();
      showTgAuthState('unlogged');
    });
  }

  let selectedFile = null;

  const ffmpegStatusBox = document.getElementById('ffmpeg-status-box');

  // Auto Updater Elements
  const autoUpdateCheck = document.getElementById('auto-update-check');
  const checkUpdatesBtn = document.getElementById('check-updates-btn');
  const updateCheckStatus = document.getElementById('update-check-status');

  const updateModal = document.getElementById('update-modal');
  const updateModalVer = document.getElementById('update-modal-ver');
  const updateModalCurrVer = document.getElementById('update-modal-curr-ver');
  const updateNotesBox = document.getElementById('update-notes-box');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateNowBtnText = document.getElementById('update-now-btn-text');
  const updateSkipBtn = document.getElementById('update-skip-btn');
  const updateNeverBtn = document.getElementById('update-never-btn');

  const updateProgressContainer = document.getElementById('update-progress-container');
  const updateProgressBar = document.getElementById('update-progress-bar');
  const updateStatusText = document.getElementById('update-status-text');
  const updatePercentText = document.getElementById('update-percent-text');

  let pendingUpdateVersion = null;
  let isUpdateReadyToInstall = false;

  async function checkForUpdates(isManual = false) {
    if (updateCheckStatus) updateCheckStatus.textContent = 'Перевірка...';
    if (checkUpdatesBtn) checkUpdatesBtn.disabled = true;

    try {
      const res = await window.api.checkUpdate(isManual);
      if (checkUpdatesBtn) checkUpdatesBtn.disabled = false;

      if (!res.success) {
        if (updateCheckStatus) updateCheckStatus.textContent = `Помилка: ${res.error || 'не вдалося перевірити'}`;
        if (isManual) alert(`Помилка перевірки оновлень: ${res.error}`);
        return;
      }

      if (res.disabled && !isManual) {
        if (updateCheckStatus) updateCheckStatus.textContent = 'Автооновлення вимкнено';
        return;
      }

      if (res.hasUpdate) {
        pendingUpdateVersion = res.latestVersion;
        if (updateCheckStatus) updateCheckStatus.textContent = `Знайдено нову версію v${res.latestVersion}!`;
        showUpdateModal(res);
      } else {
        if (updateCheckStatus) updateCheckStatus.textContent = `У вас найновіша версія (v${res.currentVersion || ''})`;
        if (isManual) alert(`У вас встановлено найновішу версію (v${res.currentVersion || ''}).`);
      }
    } catch (e) {
      if (checkUpdatesBtn) checkUpdatesBtn.disabled = false;
      if (updateCheckStatus) updateCheckStatus.textContent = 'Помилка перевірки';
    }
  }

  function showUpdateModal({ latestVersion, currentVersion, releaseNotes }) {
    if (!updateModal) return;
    if (updateModalVer) updateModalVer.textContent = `v${latestVersion}`;
    if (updateModalCurrVer) updateModalCurrVer.textContent = `v${currentVersion}`;

    if (releaseNotes && updateNotesBox) {
      updateNotesBox.textContent = releaseNotes;
      updateNotesBox.classList.remove('hidden');
    } else if (updateNotesBox) {
      updateNotesBox.classList.add('hidden');
    }

    isUpdateReadyToInstall = false;
    if (updateNowBtnText) updateNowBtnText.textContent = 'Оновити зараз';
    if (updateProgressContainer) updateProgressContainer.classList.add('hidden');

    updateModal.classList.remove('hidden');
  }

  if (autoUpdateCheck) {
    autoUpdateCheck.addEventListener('change', () => {
      window.api.disableAutoUpdateSetting(!autoUpdateCheck.checked);
    });
  }

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => checkForUpdates(true));
  }

  if (updateSkipBtn) {
    updateSkipBtn.addEventListener('click', async () => {
      if (pendingUpdateVersion) {
        await window.api.skipVersion(pendingUpdateVersion);
      }
      if (updateModal) updateModal.classList.add('hidden');
    });
  }

  if (updateNeverBtn) {
    updateNeverBtn.addEventListener('click', async () => {
      await window.api.disableAutoUpdateSetting(true);
      if (autoUpdateCheck) autoUpdateCheck.checked = false;
      if (updateModal) updateModal.classList.add('hidden');
    });
  }

  if (updateNowBtn) {
    updateNowBtn.addEventListener('click', async () => {
      if (isUpdateReadyToInstall) {
        window.api.installUpdate();
      } else {
        updateNowBtn.disabled = true;
        if (updateNowBtnText) updateNowBtnText.textContent = 'Завантаження...';
        if (updateProgressContainer) updateProgressContainer.classList.remove('hidden');

        const res = await window.api.downloadUpdate();
        if (!res.success) {
          alert(`Помилка завантаження оновлення: ${res.error}`);
          updateNowBtn.disabled = false;
          if (updateNowBtnText) updateNowBtnText.textContent = 'Оновити зараз';
        }
      }
    });
  }

  window.api.onUpdateProgress(({ percent }) => {
    if (updateProgressBar) updateProgressBar.style.width = `${percent}%`;
    if (updatePercentText) updatePercentText.textContent = `${percent}%`;
  });

  window.api.onUpdateDownloaded(() => {
    isUpdateReadyToInstall = true;
    if (updateNowBtn) updateNowBtn.disabled = false;
    if (updateNowBtnText) updateNowBtnText.textContent = 'Перезапустити та встановити';
    if (updateStatusText) updateStatusText.textContent = 'Оновлення завантажено!';
  });

  // --- Load Initial Settings ---
  async function loadSettings() {
    const settings = await window.api.getSettings();
    if (settings) {
      r2AccountId.value = settings.accountId || '';
      r2AccessKey.value = settings.accessKeyId || '';
      r2SecretKey.value = settings.secretAccessKey || '';
      r2BucketName.value = settings.bucketName || '';
      r2PublicDomain.value = settings.publicDomain || '';

      if (settings.disableAutoUpdate !== undefined && autoUpdateCheck) {
        autoUpdateCheck.checked = !settings.disableAutoUpdate;
      }

      if (proxyUrlInput) proxyUrlInput.value = settings.proxyUrl || 'http://localhost:3000';
      if (settings.tgAuthToken) {
        tgAuthToken = settings.tgAuthToken;
        checkTelegramAuth();
      } else {
        showTgAuthState('unlogged');
      }
    }

    fetchServerPricing();

    if (ffmpegStatusBox) {
      const status = await window.api.getFFmpegStatus();
      if (status && status.isAvailable) {
        const typeText = status.isSystem ? 'Системний (Homebrew / System PATH)' : 'Автономний (вбудований бінарник)';
        ffmpegStatusBox.className = 'test-msg success margin-top';
        ffmpegStatusBox.textContent = `FFmpeg підключено (${typeText}): ${status.ffmpegPath}`;
      } else {
        ffmpegStatusBox.className = 'test-msg error margin-top';
        ffmpegStatusBox.textContent = 'Бінарник FFmpeg не знайдено.';
      }
    }
  }
  loadSettings();
  setTimeout(() => checkForUpdates(false), 2000);

  const transcodeModeRadios = document.querySelectorAll('input[name="transcode-mode"]');
  transcodeModeRadios.forEach(radio => {
    radio.addEventListener('change', updateCreditCalculator);
  });

  qualityCheckboxes.forEach(cb => {
    cb.addEventListener('change', updateCreditCalculator);
  });

  // --- Save Settings ---
  saveSettingsBtn.addEventListener('click', async () => {
    const settings = {
      accountId: r2AccountId ? r2AccountId.value.trim() : '',
      accessKeyId: r2AccessKey ? r2AccessKey.value.trim() : '',
      secretAccessKey: r2SecretKey ? r2SecretKey.value.trim() : '',
      bucketName: r2BucketName ? r2BucketName.value.trim() : '',
      publicDomain: r2PublicDomain ? r2PublicDomain.value.trim() : '',
      proxyUrl: DEFAULT_PROXY_URL,
      tgAuthToken
    };

    const res = await window.api.saveSettings(settings);
    if (res.success) {
      settingsSavedMsg.classList.remove('hidden');
      setTimeout(() => {
        settingsSavedMsg.classList.add('hidden');
      }, 3000);
    } else {
      alert(`Помилка збереження налаштувань: ${res.error}`);
    }
  });

  // --- Test Connection ---
  testSettingsBtn.addEventListener('click', async () => {
    const settings = {
      accountId: r2AccountId.value.trim(),
      accessKeyId: r2AccessKey.value.trim(),
      secretAccessKey: r2SecretKey.value.trim(),
      bucketName: r2BucketName.value.trim(),
      publicDomain: r2PublicDomain.value.trim()
    };

    testSettingsBtn.disabled = true;
    settingsTestMsg.className = 'test-msg info';
    settingsTestMsg.textContent = '⏳ Перевірка підключення до Cloudflare R2...';
    settingsTestMsg.classList.remove('hidden');

    const res = await window.api.testR2Settings(settings);
    testSettingsBtn.disabled = false;

    if (res.success) {
      settingsTestMsg.className = 'test-msg success';
      settingsTestMsg.textContent = `✅ ${res.message}`;
    } else {
      settingsTestMsg.className = 'test-msg error';
      settingsTestMsg.textContent = `❌ ${res.error}`;
    }
  });


  // --- File Selection Handlers ---
  const PRESET_HEIGHTS = {
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360
  };

  async function updateSelectedFile(fileInfo) {
    if (!fileInfo) return;
    selectedFile = fileInfo;

    // Reset previous progress & result UI
    if (progressCard) progressCard.classList.add('hidden');
    if (resultCard) resultCard.classList.add('hidden');
    if (masterUrlInput) masterUrlInput.value = '';
    if (fileQueueList) fileQueueList.innerHTML = '';
    if (transcodeBar) transcodeBar.style.width = '0%';
    if (transcodePercent) transcodePercent.textContent = '0%';
    if (uploadBar) uploadBar.style.width = '0%';
    if (uploadPercent) uploadPercent.textContent = '0%';
    if (transcodeStatusText) transcodeStatusText.textContent = '1. Транскодування відео';
    if (uploadStatusText) uploadStatusText.textContent = '2. Завантаження файлів у Cloudflare R2';

    // Probe resolution & duration if missing
    if ((!selectedFile.height || !selectedFile.duration) && selectedFile.path) {
      const meta = await window.api.getVideoResolution(selectedFile.path);
      if (meta) {
        selectedFile.height = meta.height || selectedFile.height;
        selectedFile.width = meta.width || selectedFile.width;
        selectedFile.duration = meta.duration || selectedFile.duration;
      }
    }

    function formatExactDuration(seconds) {
      if (!seconds) return '';
      const s = Math.round(seconds);
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      if (hrs > 0) {
        return `${hrs} год ${mins} хв ${secs} сек`;
      }
      return `${mins} хв ${secs} сек`;
    }

    const durText = selectedFile.duration ? ` • 🎬 ${formatExactDuration(selectedFile.duration)}` : '';
    const resText = selectedFile.height ? ` • ${selectedFile.width}x${selectedFile.height} (${selectedFile.height}p)` : '';
    selectedFilename.textContent = fileInfo.name;
    selectedFilesize.textContent = `${formatBytes(fileInfo.size)}${durText}${resText}`;

    filterQualitiesBySourceHeight(selectedFile.height || 9999);
    updateCreditCalculator();

    dropContentEmpty.classList.add('hidden');
    dropContentSelected.classList.remove('hidden');
    validateForm();
    updateCreditCalculator();
  }

  function filterQualitiesBySourceHeight(sourceHeight) {
    qualityCheckboxes.forEach(cb => {
      const qKey = cb.value;
      const targetHeight = PRESET_HEIGHTS[qKey] || 0;
      const label = cb.closest('.checkbox-label');
      const descTextSpan = label.querySelector('.q-desc-text');

      if (targetHeight > sourceHeight) {
        cb.checked = false;
        cb.disabled = true;
        label.classList.add('disabled-quality');
        if (descTextSpan) descTextSpan.textContent = `недоступно (джерело ${sourceHeight}p)`;
      } else {
        cb.disabled = false;
        label.classList.remove('disabled-quality');
        const defaultBitrates = { '1080p': '5000 kbps', '720p': '2800 kbps', '480p': '1400 kbps', '360p': '800 kbps' };
        if (descTextSpan) descTextSpan.textContent = defaultBitrates[qKey] || '';
        cb.checked = true;
      }
    });
  }

  function resetSelectedFile() {
    selectedFile = null;
    dropContentEmpty.classList.remove('hidden');
    dropContentSelected.classList.add('hidden');

    qualityCheckboxes.forEach(cb => {
      cb.disabled = false;
      const label = cb.closest('.checkbox-label');
      label.classList.remove('disabled-quality');
      const descTextSpan = label.querySelector('.q-desc-text');
      const defaultBitrates = { '1080p': '5000 kbps', '720p': '2800 kbps', '480p': '1400 kbps', '360p': '800 kbps' };
      if (descTextSpan) descTextSpan.textContent = defaultBitrates[cb.value] || '';
      cb.checked = true;
    });

    validateForm();
    updateCreditCalculator();
  }

  let isProcessingActive = false;

  function setProcessingState(isProcessing) {
    isProcessingActive = isProcessing;

    if (selectFileBtn) selectFileBtn.disabled = isProcessing;
    if (changeFileBtn) changeFileBtn.disabled = isProcessing;
    if (folderNameInput) folderNameInput.disabled = isProcessing;
    if (randomSuffixCheck) randomSuffixCheck.disabled = isProcessing;
    if (keepLocalCheck) keepLocalCheck.disabled = isProcessing;
    if (startBtn) startBtn.disabled = isProcessing || !selectedFile;

    qualityCheckboxes.forEach(cb => {
      if (isProcessing) {
        cb.disabled = true;
      } else {
        const height = selectedFile ? (selectedFile.height || 9999) : 9999;
        const presetHeight = PRESET_HEIGHTS[cb.value] || 0;
        cb.disabled = presetHeight > height;
      }
    });
  }

  selectFileBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const fileInfo = await window.api.selectFile();
    if (fileInfo) updateSelectedFile(fileInfo);
  });

  changeFileBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isProcessingActive) return;
    const fileInfo = await window.api.selectFile();
    if (fileInfo) updateSelectedFile(fileInfo);
  });

  dropZone.addEventListener('click', async () => {
    if (isProcessingActive) return;
    if (!selectedFile) {
      const fileInfo = await window.api.selectFile();
      if (fileInfo) updateSelectedFile(fileInfo);
    }
  });

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessingActive) dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    if (isProcessingActive) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      updateSelectedFile({
        path: file.path,
        name: file.name,
        size: file.size
      });
    }
  });

  // Checkbox & Mode validation
  qualityCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      validateForm();
      updateCreditCalculator();
    });
  });

  document.querySelectorAll('input[name="transcode-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      validateForm();
      updateCreditCalculator();
    });
  });

  function validateForm() {
    if (isProcessingActive) {
      if (startBtn) startBtn.disabled = true;
      return;
    }
    const hasQualities = Array.from(qualityCheckboxes).some(cb => cb.checked);
    startBtn.disabled = !(selectedFile && hasQualities);
  }

  const fileQueueList = document.getElementById('file-queue-list');

  function initFileQueue(qualities) {
    if (!fileQueueList) return;
    fileQueueList.innerHTML = '';

    qualities.forEach(q => {
      appendQueueItem(q, `${q}.m3u8`, 'Очікує', 'tag-pending');
    });

    appendQueueItem('master', 'master.m3u8', 'Очікує', 'tag-pending');
  }

  function appendQueueItem(id, fileName, tagText, tagClass) {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.id = `queue-item-${id}`;
    div.innerHTML = `
      <span class="queue-filename" title="${escapeHtml(fileName)}">🎬 ${escapeHtml(fileName)}</span>
      <span class="queue-tag ${tagClass}">${escapeHtml(tagText)}</span>
    `;
    fileQueueList.appendChild(div);
  }

  function updateQueueItemStatus(id, tagText, tagClass) {
    const item = document.getElementById(`queue-item-${id}`);
    if (item) {
      const tagSpan = item.querySelector('.queue-tag');
      if (tagSpan) {
        tagSpan.className = `queue-tag ${tagClass}`;
        tagSpan.textContent = tagText;
      }
    }
  }

  function showConfirmModal({ title, desc, confirmText = 'Підтвердити', cancelText = 'Скасувати' }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-input-modal');
      const titleEl = document.getElementById('modal-title');
      const descEl = document.getElementById('modal-desc');
      const inputEl = document.getElementById('modal-input');
      const cancelBtn = document.getElementById('modal-cancel-btn');
      const confirmBtn = document.getElementById('modal-confirm-btn');

      if (!modal) {
        resolve(false);
        return;
      }

      titleEl.textContent = title;
      descEl.innerHTML = desc;
      inputEl.classList.add('hidden');
      cancelBtn.textContent = cancelText;
      confirmBtn.textContent = confirmText;
      modal.classList.remove('hidden');

      const cleanup = () => {
        modal.classList.add('hidden');
        inputEl.classList.remove('hidden');
        cancelBtn.textContent = 'Скасувати';
        confirmBtn.textContent = 'Підтвердити';
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        window.removeEventListener('keydown', onKeyDown);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Enter') onConfirm();
        if (e.key === 'Escape') onCancel();
      };

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  // --- Start Processing ---
  startBtn.addEventListener('click', async () => {
    if (!selectedFile || isProcessingActive) return;

    const r2Settings = {
      accountId: r2AccountId.value.trim(),
      accessKeyId: r2AccessKey.value.trim(),
      secretAccessKey: r2SecretKey.value.trim(),
      bucketName: r2BucketName.value.trim(),
      publicDomain: r2PublicDomain.value.trim()
    };

    if (!r2Settings.accountId || !r2Settings.accessKeyId || !r2Settings.secretAccessKey || !r2Settings.bucketName || !r2Settings.publicDomain) {
      alert('Будь ласка, перейдіть у налаштування R2 та заповніть усі поля перед запуском!');
      navSettingsBtn.click();
      return;
    }

    const selectedQualities = Array.from(qualityCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    // --- Check Overwrite Risk (Only if random suffix is NOT enabled) ---
    const hasRandomSuffix = randomSuffixCheck ? randomSuffixCheck.checked : false;
    if (!hasRandomSuffix) {
      const rawFolder = folderNameInput.value.trim();
      const defaultFolder = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '-') : '';
      const targetFolderToCheck = rawFolder || defaultFolder;

      if (targetFolderToCheck) {
        const checkRes = await window.api.checkR2FolderExists({ folderName: targetFolderToCheck });
        if (checkRes.success && checkRes.exists) {
          const confirmOverwrite = await showConfirmModal({
            title: '⚠️ Попередження про перезапис',
            desc: `Папка <strong>"${escapeHtml(checkRes.folderName)}"</strong> вже існує у вашому Cloudflare R2 бакеті!<br><br>Запуск обробки оновлить або перезапише матеріали (<code>master.m3u8</code> та сегменти якості) всередині цієї папки.<br><br>Ви дійсно бажаєте продовжити та перезаписати вміст?`,
            confirmText: 'Перезаписати',
            cancelText: 'Скасувати'
          });

          if (!confirmOverwrite) {
            return; // Cancelled by user
          }
        }
      }
    }

    // UI Reset & Lock
    setProcessingState(true);
    initFileQueue(selectedQualities);

    progressCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    transcodeBar.style.width = '0%';
    transcodePercent.textContent = '0%';
    uploadBar.style.width = '0%';
    uploadPercent.textContent = '0%';
    statusSpinner.classList.remove('hidden');

    const transcodeModeRadio = document.querySelector('input[name="transcode-mode"]:checked');
    const transcodeMode = transcodeModeRadio ? transcodeModeRadio.value : 'local';

    const cloudSettings = {
      proxyUrl: DEFAULT_PROXY_URL,
      authToken: tgAuthToken
    };

    window.api.startProcessing({
      inputPath: selectedFile.path,
      durationSec: selectedFile.duration || 60,
      fileSize: selectedFile.size || 0,
      folderName: folderNameInput.value.trim(),
      selectedQualities,
      r2Settings,
      keepLocal: keepLocalCheck.checked,
      addRandomSuffix: randomSuffixCheck ? randomSuffixCheck.checked : false,
      transcodeMode,
      cloudSettings
    });
  });

  // --- IPC Listeners ---
  window.api.onStatusChange(({ status, details }) => {
    statusText.textContent = details ? `${status} (${details})` : status;
  });

  window.api.onTranscodeProgress(({ percent, currentQuality, qualityIndex, totalQualities }) => {
    transcodeBar.style.width = `${percent}%`;
    transcodePercent.textContent = `${percent}%`;
    if (currentQuality && transcodeStatusText) {
      if (currentQuality === 'Cloud GPU') {
        transcodeStatusText.textContent = `1. Хмарне GPU транскодування (${percent}%)`;
      } else {
        transcodeStatusText.textContent = `1. Транскодування [${qualityIndex}/${totalQualities}]: ${currentQuality} (${percent}%)`;
        updateQueueItemStatus(currentQuality, '⚙️ Кодується', 'tag-transcoding');
      }
    }
  });

  window.api.onUploadProgress(({ uploadedFiles, percent, stepDescription }) => {
    const curPct = percent !== undefined ? percent : 0;
    uploadBar.style.width = `${curPct}%`;
    uploadPercent.textContent = `${curPct}% (${uploadedFiles} файлів у CDN)`;
    if (stepDescription && uploadStatusText) {
      uploadStatusText.textContent = `2. CDN Завантаження: ${stepDescription}`;
    }
  });

  window.api.onQualityStateChange(({ quality, status }) => {
    if (status === 'uploading') {
      updateQueueItemStatus(quality, '☁️ Завантажується', 'tag-uploading');
    } else if (status === 'uploaded') {
      updateQueueItemStatus(quality, '✅ Завантажено', 'tag-uploaded');
    }
  });

  window.api.onComplete(({ masterUrl, folderName, totalFiles }) => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = `Готово! Успішно завантажено ${totalFiles} файлів.`;
    transcodeBar.style.width = '100%';
    transcodePercent.textContent = '100%';
    uploadBar.style.width = '100%';
    uploadPercent.textContent = '100%';
    if (stopBtn) stopBtn.classList.add('hidden');

    if (fileQueueList) {
      fileQueueList.querySelectorAll('.queue-tag').forEach(tag => {
        tag.className = 'queue-tag tag-uploaded';
        tag.textContent = '✅ Завантажено';
      });
    }

    masterUrlInput.value = masterUrl;
    resultCard.classList.remove('hidden');
    setProcessingState(false);
  });

  window.api.onCancelled(() => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = '⏹️ Процес зупинено користувачем.';
    if (stopBtn) stopBtn.classList.add('hidden');
    setProcessingState(false);
  });

  window.api.onError(({ error }) => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = `Помилка: ${error}`;
    if (stopBtn) stopBtn.classList.add('hidden');
    alert(`Сталася помилка:\n${error}`);
    setProcessingState(false);
  });

  // Copy Master M3U8 URL button
  copyUrlBtn.addEventListener('click', () => {
    if (masterUrlInput.value) {
      navigator.clipboard.writeText(masterUrlInput.value);
      const originalText = copyUrlBtn.textContent;
      copyUrlBtn.textContent = '✓ Скопійовано!';
      setTimeout(() => {
        copyUrlBtn.textContent = originalText;
      }, 2000);
    }
  });

  // Helper bytes formatter
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
});

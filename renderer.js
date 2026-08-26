document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navTranscodeBtn = document.getElementById('nav-transcode-btn');
  const navExplorerBtn = document.getElementById('nav-explorer-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const viewTranscode = document.getElementById('view-transcode');
  const viewExplorer = document.getElementById('view-explorer');
  const viewSettings = document.getElementById('view-settings');

  // Explorer elements
  const explorerUploadBtn = document.getElementById('explorer-upload-btn');
  const explorerDeleteSelectedBtn = document.getElementById('explorer-delete-selected-btn');
  const explorerRefreshBtn = document.getElementById('explorer-refresh-btn');
  const explorerBreadcrumbs = document.getElementById('explorer-breadcrumbs');
  const explorerListBody = document.getElementById('explorer-list-body');
  const explorerStatus = document.getElementById('explorer-status');
  const selectAllExplorer = document.getElementById('select-all-explorer');

  let currentExplorerPrefix = '';

  // --- Tab Navigation ---
  function setActiveTab(tab) {
    navTranscodeBtn.classList.toggle('active', tab === 'transcode');
    navExplorerBtn.classList.toggle('active', tab === 'explorer');
    navSettingsBtn.classList.toggle('active', tab === 'settings');

    viewTranscode.classList.toggle('hidden', tab !== 'transcode');
    viewExplorer.classList.toggle('hidden', tab !== 'explorer');
    viewSettings.classList.toggle('hidden', tab !== 'settings');

    if (tab === 'explorer') {
      loadExplorer(currentExplorerPrefix);
    } else if (tab === 'settings') {
      loadSettings();
    }
  }

  navTranscodeBtn.addEventListener('click', () => setActiveTab('transcode'));
  navExplorerBtn.addEventListener('click', () => setActiveTab('explorer'));
  navSettingsBtn.addEventListener('click', () => setActiveTab('settings'));

  // --- Explorer Logic ---
  async function loadExplorer(prefix = '') {
    currentExplorerPrefix = prefix;
    renderBreadcrumbs(prefix);

    if (selectAllExplorer) selectAllExplorer.checked = false;
    if (explorerDeleteSelectedBtn) explorerDeleteSelectedBtn.disabled = true;

    explorerStatus.className = 'explorer-status info';
    explorerStatus.textContent = '⏳ Завантаження вмісту R2 бакета...';
    explorerStatus.classList.remove('hidden');
    explorerListBody.innerHTML = '';

    const res = await window.api.listR2Objects(prefix);
    if (!res.success) {
      explorerStatus.className = 'explorer-status error';
      explorerStatus.textContent = `❌ ${res.error}`;
      return;
    }

    explorerStatus.classList.add('hidden');
    renderExplorerList(res.folders, res.files, prefix);
  }

  explorerRefreshBtn.addEventListener('click', () => loadExplorer(currentExplorerPrefix));

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
      explorerDeleteSelectedBtn.textContent = checkedCount > 0 ? `🗑️ Видалити обрані (${checkedCount})` : '🗑️ Видалити обрані';
    }
  }

  function disableExplorerControls(disabled) {
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
        explorerDeleteSelectedBtn.textContent = '⏳ Видалення...';
        explorerStatus.className = 'explorer-status info';
        explorerStatus.textContent = `⏳ Видалення ${items.length} обраних елементів з R2 бакета... (зачекайте)`;
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

    // Up parent directory row
    if (prefix) {
      const parts = prefix.split('/').filter(Boolean);
      parts.pop();
      const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
      html += `
        <tr class="explorer-row folder-row" data-prefix="${parentPrefix}">
          <td></td>
          <td>📁 <strong>.. (на рівень вище)</strong></td>
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
          <td>📁 <strong>${escapeHtml(f.name)}</strong></td>
          <td>Папка HLS</td>
          <td>-</td>
          <td>-</td>
          <td class="text-right">
            <button class="btn-xs btn-danger delete-folder-btn" data-prefix="${f.prefix}" data-name="${escapeHtml(f.name)}">🗑️ Видалити</button>
          </td>
        </tr>
      `;
    });

    // Render files
    files.forEach(file => {
      const icon = file.isM3u8 ? '🎬' : (file.name.endsWith('.ts') ? '🎥' : '📄');
      const formattedSize = formatBytes(file.size);
      const formattedDate = file.lastModified ? new Date(file.lastModified).toLocaleString('uk-UA') : '-';

      html += `
        <tr class="explorer-row file-row">
          <td style="text-align: center;"><input type="checkbox" class="item-checkbox" data-key="${escapeHtml(file.key)}" data-is-folder="false" /></td>
          <td>${icon} ${escapeHtml(file.name)}</td>
          <td>${file.isM3u8 ? '<strong>M3U8 Playlist</strong>' : 'Файл'}</td>
          <td>${formattedSize}</td>
          <td>${formattedDate}</td>
          <td class="text-right">
            ${file.cdnUrl ? `<button class="btn-xs btn-success copy-cdn-btn" data-url="${escapeHtml(file.cdnUrl)}">📋 CDN URL</button>` : ''}
            <button class="btn-xs btn-danger delete-file-btn" data-key="${escapeHtml(file.key)}" data-name="${escapeHtml(file.name)}">🗑️</button>
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
        const originalText = btn.textContent;
        btn.textContent = '✓ Скопійовано!';
        setTimeout(() => {
          btn.textContent = originalText;
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
          btn.textContent = '⏳...';
          explorerStatus.className = 'explorer-status info';
          explorerStatus.textContent = `⏳ Видалення файла "${name}" з R2...`;
          explorerStatus.classList.remove('hidden');
          disableExplorerControls(true);

          const res = await window.api.deleteR2Object({ key, isFolder: false });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення: ${res.error}`);
            btn.disabled = false;
            btn.textContent = '🗑️';
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
          btn.textContent = '⏳ Видалення...';
          explorerStatus.className = 'explorer-status info';
          explorerStatus.textContent = `⏳ Видалення папки "${name}" та усіх її HLS файлів з R2... (зачекайте)`;
          explorerStatus.classList.remove('hidden');
          disableExplorerControls(true);

          const res = await window.api.deleteR2Object({ key: prefix, isFolder: true });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення папки: ${res.error}`);
            btn.disabled = false;
            btn.textContent = '🗑️ Видалити';
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
  const qualityCheckboxes = document.querySelectorAll('.quality-checkbox');
  const randomSuffixCheck = document.getElementById('random-suffix-check');
  const keepLocalCheck = document.getElementById('keep-local-check');
  const startBtn = document.getElementById('start-btn');

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

    if (!isCloud || !selectedFile) {
      if (cloudCreditCalcBox) cloudCreditCalcBox.classList.add('hidden');
      return;
    }

    if (cloudCreditCalcBox) cloudCreditCalcBox.classList.remove('hidden');

    const durationSec = selectedFile.duration || 60;
    const minutes = Math.max(1, Math.ceil(durationSec / 60));
    const activeQualities = Array.from(qualityCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

    let ratePerMin = 0;
    for (const q of activeQualities) {
      ratePerMin += ((serverPricing.ratesPerMinuteUsd && serverPricing.ratesPerMinuteUsd[q]) || 0.005);
    }

    const calculated = Number((minutes * ratePerMin).toFixed(2));
    const totalCostUsd = Math.max(serverPricing.minCostUsd || 0.05, calculated);

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

    // Network transfer & container startup overhead (~15s + 1s per 15MB transfer)
    const transferOverheadSec = Math.ceil(15 + (fileSizeMb / 15));

    // End-to-end GPU processing vs local CPU software encoding
    const pureGpuEncodeSec = Math.ceil((durationSec * totalGpuFactor) / 2.2);
    const estimatedGpuSec = Math.max(30, transferOverheadSec + pureGpuEncodeSec);
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
    if (calcCreditSub) calcCreditSub.textContent = `(тривалість ~${minutes} хв, розмір ${fileSizeMb.toFixed(0)} MB, якостей: ${activeQualities.length})`;
  }

  function showTgAuthState(state) {
    if (tgAuthUnlogged) tgAuthUnlogged.classList.toggle('hidden', state !== 'unlogged');
    if (tgAuthPending) tgAuthPending.classList.toggle('hidden', state !== 'pending');
    if (tgAuthLogged) tgAuthLogged.classList.toggle('hidden', state !== 'logged');

    if (headerAuthBtn) headerAuthBtn.classList.toggle('hidden', state === 'logged');
    if (headerUserLogged) headerUserLogged.classList.toggle('hidden', state !== 'logged');
  }

  async function checkTelegramAuth() {
    if (!tgAuthToken) {
      showTgAuthState('unlogged');
      return;
    }

    try {
      const res = await fetch(`${DEFAULT_PROXY_URL}/api/user/me?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${tgAuthToken}` }
      });
      if (res.ok) {
        const user = await res.json();
        const formattedBal = user.formattedBalance || `$${(user.balanceUsd || 0).toFixed(2)}`;
        if (tgUserInfo) tgUserInfo.textContent = `👤 @${user.username || user.firstName || user.telegramId} | 💳 Баланс: ${formattedBal}`;
        if (headerBalanceBadge) headerBalanceBadge.textContent = `💳 ${formattedBal}`;
        showTgAuthState('logged');
      } else {
        tgAuthToken = '';
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

  // --- Load Initial Settings ---
  async function loadSettings() {
    const settings = await window.api.getSettings();
    if (settings) {
      r2AccountId.value = settings.accountId || '';
      r2AccessKey.value = settings.accessKeyId || '';
      r2SecretKey.value = settings.secretAccessKey || '';
      r2BucketName.value = settings.bucketName || '';
      r2PublicDomain.value = settings.publicDomain || '';

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
        ffmpegStatusBox.textContent = `✅ FFmpeg підключено (${typeText}): ${status.ffmpegPath}`;
      } else {
        ffmpegStatusBox.className = 'test-msg error margin-top';
        ffmpegStatusBox.textContent = '❌ Бінарник FFmpeg не знайдено.';
      }
    }
  }
  loadSettings();

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

    // Probe resolution if not provided
    if (!fileInfo.height && fileInfo.path) {
      const meta = await window.api.getVideoResolution(fileInfo.path);
      if (meta) {
        selectedFile.height = meta.height;
        selectedFile.width = meta.width;
      }
    }

    const resText = selectedFile.height ? ` • ${selectedFile.width}x${selectedFile.height} (${selectedFile.height}p)` : '';
    selectedFilename.textContent = fileInfo.name;
    selectedFilesize.textContent = `${formatBytes(fileInfo.size)}${resText}`;

    filterQualitiesBySourceHeight(selectedFile.height || 9999);

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
      const descSpan = label.querySelector('.q-desc');

      if (targetHeight > sourceHeight) {
        cb.checked = false;
        cb.disabled = true;
        label.classList.add('disabled-quality');
        if (descSpan) descSpan.textContent = `недоступно (джерело ${sourceHeight}p)`;
      } else {
        cb.disabled = false;
        label.classList.remove('disabled-quality');
        const defaultBitrates = { '1080p': '5000 kbps', '720p': '2800 kbps', '480p': '1400 kbps', '360p': '800 kbps' };
        if (descSpan) descSpan.textContent = defaultBitrates[qKey] || '';
        // Auto-check valid qualities if none checked
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
    });

    validateForm();
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

  // Checkbox validation
  qualityCheckboxes.forEach(cb => {
    cb.addEventListener('change', validateForm);
  });

  function validateForm() {
    if (isProcessingActive) return;
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

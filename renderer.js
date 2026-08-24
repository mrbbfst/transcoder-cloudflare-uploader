document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navTranscodeBtn = document.getElementById('nav-transcode-btn');
  const navExplorerBtn = document.getElementById('nav-explorer-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const viewTranscode = document.getElementById('view-transcode');
  const viewExplorer = document.getElementById('view-explorer');
  const viewSettings = document.getElementById('view-settings');

  // Explorer elements
  const explorerRefreshBtn = document.getElementById('explorer-refresh-btn');
  const explorerBreadcrumbs = document.getElementById('explorer-breadcrumbs');
  const explorerListBody = document.getElementById('explorer-list-body');
  const explorerStatus = document.getElementById('explorer-status');

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
    }
  }

  navTranscodeBtn.addEventListener('click', () => setActiveTab('transcode'));
  navExplorerBtn.addEventListener('click', () => setActiveTab('explorer'));
  navSettingsBtn.addEventListener('click', () => setActiveTab('settings'));

  // --- Explorer Logic ---
  async function loadExplorer(prefix = '') {
    currentExplorerPrefix = prefix;
    renderBreadcrumbs(prefix);

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
          <td colspan="5" class="text-center text-muted">Папка порожня або вміст відсутній</td>
        </tr>
      `;
    }

    // Render folders
    folders.forEach(f => {
      html += `
        <tr class="explorer-row folder-row" data-prefix="${f.prefix}">
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

    // Attach row events
    explorerListBody.querySelectorAll('.folder-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
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
          const res = await window.api.deleteR2Object({ key, isFolder: false });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення: ${res.error}`);
            btn.disabled = false;
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
          const res = await window.api.deleteR2Object({ key: prefix, isFolder: true });
          if (res.success) {
            loadExplorer(currentExplorerPrefix);
          } else {
            alert(`Помилка видалення папки: ${res.error}`);
            btn.disabled = false;
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
  const keepLocalCheck = document.getElementById('keep-local-check');
  const startBtn = document.getElementById('start-btn');

  // Progress Section
  const progressCard = document.getElementById('progress-card');
  const statusSpinner = document.getElementById('status-spinner');
  const statusText = document.getElementById('status-text');
  const stopBtn = document.getElementById('stop-btn');
  const transcodeBar = document.getElementById('transcode-bar');
  const transcodePercent = document.getElementById('transcode-percent');
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

  // Settings elements
  const r2AccountId = document.getElementById('r2-account-id');
  const r2AccessKey = document.getElementById('r2-access-key');
  const r2SecretKey = document.getElementById('r2-secret-key');
  const r2BucketName = document.getElementById('r2-bucket-name');
  const r2PublicDomain = document.getElementById('r2-public-domain');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const testSettingsBtn = document.getElementById('test-settings-btn');
  const settingsSavedMsg = document.getElementById('settings-saved-msg');
  const settingsTestMsg = document.getElementById('settings-test-msg');

  let selectedFile = null;

  // --- Load Initial Settings ---
  async function loadSettings() {
    const settings = await window.api.getSettings();
    if (settings) {
      r2AccountId.value = settings.accountId || '';
      r2AccessKey.value = settings.accessKeyId || '';
      r2SecretKey.value = settings.secretAccessKey || '';
      r2BucketName.value = settings.bucketName || '';
      r2PublicDomain.value = settings.publicDomain || '';
    }
  }
  loadSettings();

  // --- Tab Navigation ---
  navTranscodeBtn.addEventListener('click', () => {
    navTranscodeBtn.classList.add('active');
    navSettingsBtn.classList.remove('active');
    viewTranscode.classList.remove('hidden');
    viewSettings.classList.add('hidden');
  });

  navSettingsBtn.addEventListener('click', () => {
    navSettingsBtn.classList.add('active');
    navTranscodeBtn.classList.remove('active');
    viewSettings.classList.remove('hidden');
    viewTranscode.classList.add('hidden');
  });

  // --- Save Settings ---
  saveSettingsBtn.addEventListener('click', async () => {
    const settings = {
      accountId: r2AccountId.value.trim(),
      accessKeyId: r2AccessKey.value.trim(),
      secretAccessKey: r2SecretKey.value.trim(),
      bucketName: r2BucketName.value.trim(),
      publicDomain: r2PublicDomain.value.trim()
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


  selectFileBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const fileInfo = await window.api.selectFile();
    if (fileInfo) updateSelectedFile(fileInfo);
  });

  changeFileBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const fileInfo = await window.api.selectFile();
    if (fileInfo) updateSelectedFile(fileInfo);
  });

  dropZone.addEventListener('click', async () => {
    if (!selectedFile) {
      const fileInfo = await window.api.selectFile();
      if (fileInfo) updateSelectedFile(fileInfo);
    }
  });

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
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
    const hasQualities = Array.from(qualityCheckboxes).some(cb => cb.checked);
    startBtn.disabled = !(selectedFile && hasQualities);
  }

  // --- Start Processing ---
  startBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

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

    // UI Reset
    progressCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    startBtn.disabled = true;
    transcodeBar.style.width = '0%';
    transcodePercent.textContent = '0%';
    uploadBar.style.width = '0%';
    uploadPercent.textContent = '0%';
    statusSpinner.classList.remove('hidden');

    window.api.startProcessing({
      inputPath: selectedFile.path,
      folderName: folderNameInput.value.trim(),
      selectedQualities,
      r2Settings,
      keepLocal: keepLocalCheck.checked
    });
  });

  // --- IPC Listeners ---
  window.api.onStatusChange(({ status, details }) => {
    statusText.textContent = details ? `${status} (${details})` : status;
  });

  window.api.onTranscodeProgress(({ percent, currentQuality, qualityIndex, totalQualities }) => {
    transcodeBar.style.width = `${percent}%`;
    transcodePercent.textContent = `${percent}%`;
    if (currentQuality) {
      statusText.textContent = `Транскодування [${qualityIndex}/${totalQualities}]: ${currentQuality} (${percent}%)`;
    }
  });

  window.api.onUploadProgress(({ uploadedFiles, stepDescription }) => {
    uploadBar.style.width = '100%';
    uploadPercent.textContent = `Паралельно завантажено: ${uploadedFiles} файлів`;
    if (stepDescription) {
      statusText.textContent = `${stepDescription} (${uploadedFiles} файлів у CDN)...`;
    }
  });

  window.api.onComplete(({ masterUrl, folderName, totalFiles }) => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = `Готово! Успішно завантажено ${totalFiles} файлів.`;
    transcodeBar.style.width = '100%';
    transcodePercent.textContent = '100%';
    uploadBar.style.width = '100%';
    uploadPercent.textContent = '100%';

    masterUrlInput.value = masterUrl;
    resultCard.classList.remove('hidden');
    startBtn.disabled = false;
  });

  window.api.onError(({ error }) => {
    statusSpinner.classList.add('hidden');
    statusText.textContent = `Помилка: ${error}`;
    alert(`Сталася помилка:\n${error}`);
    startBtn.disabled = false;
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

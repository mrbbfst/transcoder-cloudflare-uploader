const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const mime = require('mime-types');
const { createCloudProvider } = require('./cloudTranscoder');

const { execSync } = require('child_process');

// Helper: Check system executable or user data directory
function findSystemExecutable(cmdName) {
  const commonPaths = [
    `/usr/local/bin/${cmdName}`,
    `/opt/homebrew/bin/${cmdName}`,
    `/usr/bin/${cmdName}`,
    `/bin/${cmdName}`,
    `${os.homedir()}/bin/${cmdName}`,
    `C:\\ffmpeg\\bin\\${cmdName}.exe`,
    `C:\\Program Files\\ffmpeg\\bin\\${cmdName}.exe`
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const envPath = `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`;
    const whichCmd = process.platform === 'win32' ? `where ${cmdName}` : `which ${cmdName}`;
    const out = execSync(whichCmd, { encoding: 'utf-8', env: { ...process.env, PATH: envPath } }).trim().split('\r\n')[0].split('\n')[0];
    if (out && fs.existsSync(out)) return out;
  } catch (e) {}

  return null;
}

function configureFFmpegPaths() {
  let sysFfmpeg = findSystemExecutable('ffmpeg');
  let sysFfprobe = findSystemExecutable('ffprobe');

  if (sysFfmpeg) ffmpeg.setFfmpegPath(sysFfmpeg);
  if (sysFfprobe) ffmpeg.setFfprobePath(sysFfprobe);

  return {
    ffmpegPath: sysFfmpeg || 'не знайдено',
    ffprobePath: sysFfprobe || 'не знайдено',
    isSystem: true,
    isAvailable: Boolean(sysFfmpeg)
  };
}

const activeFFmpegStatus = configureFFmpegPaths();

app.setName('HLS Transcoder R2');

function getSettingsFilePath() {
  const primaryPath = path.join(app.getPath('userData'), 'r2-settings.json');
  if (fs.existsSync(primaryPath)) return primaryPath;

  const appDataDir = path.dirname(app.getPath('userData'));
  const altNames = ['HLS Transcoder R2', 'transcoder-uploader'];
  for (const alt of altNames) {
    const altPath = path.join(appDataDir, alt, 'r2-settings.json');
    if (fs.existsSync(altPath)) return altPath;
  }
  return primaryPath;
}

const settingsPath = getSettingsFilePath();

let currentFfmpegCommand = null;
let activeCancelRef = { isCancelled: false };

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k', bandwidth: 5400000, name: '1080p' },
  '720p':  { width: 1280, height: 720,  videoBitrate: '2800k', audioBitrate: '128k', bandwidth: 3000000, name: '720p' },
  '480p':  { width: 854,  height: 480,  videoBitrate: '1400k', audioBitrate: '96k',  bandwidth: 1500000, name: '480p' },
  '360p':  { width: 640,  height: 360,  videoBitrate: '800k',  audioBitrate: '64k',  bandwidth: 900000,  name: '360p' }
};

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Settings Handlers ---
ipcMain.handle('settings:get', () => {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return {
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicDomain: ''
  };
});

ipcMain.handle('ffmpeg:getStatus', () => {
  return activeFFmpegStatus;
});

ipcMain.handle('settings:save', (event, settings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    console.error('Error saving settings:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('settings:testR2', async (event, settings) => {
  try {
    if (!settings.accountId || !settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName) {
      throw new Error('Будь ласка, заповніть Account ID, Access Key, Secret Key та Bucket Name!');
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey.trim()
      }
    });

    await s3Client.send(new ListObjectsV2Command({
      Bucket: settings.bucketName.trim(),
      MaxKeys: 1
    }));

    return {
      success: true,
      message: `Успішно підключено до бакета "${settings.bucketName.trim()}"!`
    };
  } catch (err) {
    console.error('R2 test connection error:', err);
    let errMsg = err.message;
    if (err.name === 'NoSuchBucket') {
      errMsg = `Бакет "${settings.bucketName}" не знайдено в Cloudflare R2.`;
    } else if (err.name === 'InvalidAccessKeyId' || err.name === 'SignatureDoesNotMatch' || err.$metadata?.httpStatusCode === 403) {
      errMsg = 'Невірний Access Key ID або Secret Access Key (помилка доступу 403).';
    }
    return { success: false, error: errMsg };
  }
});

// --- R2 Explorer Handlers ---
ipcMain.handle('r2:listObjects', async (event, prefix = '') => {
  try {
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Налаштування Cloudflare R2 відсутні.');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (!settings.accountId || !settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName) {
      throw new Error('Неповні налаштування R2.');
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey.trim()
      }
    });

    const normalizedPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : '';

    const command = new ListObjectsV2Command({
      Bucket: settings.bucketName.trim(),
      Prefix: normalizedPrefix,
      Delimiter: '/'
    });

    const response = await s3Client.send(command);

    let domain = (settings.publicDomain || '').trim().replace(/\/+$/, '');
    if (domain && !domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = `https://${domain}`;
    }

    const folders = (response.CommonPrefixes || []).map(cp => {
      const name = cp.Prefix.slice(normalizedPrefix.length).replace(/\/$/, '');
      return {
        name,
        prefix: cp.Prefix
      };
    });

    const files = (response.Contents || [])
      .filter(item => item.Key !== normalizedPrefix)
      .map(item => {
        const name = item.Key.slice(normalizedPrefix.length);
        const cdnUrl = domain ? `${domain}/${item.Key}` : '';
        return {
          key: item.Key,
          name,
          size: item.Size,
          lastModified: item.LastModified,
          isM3u8: item.Key.endsWith('.m3u8'),
          cdnUrl
        };
      });

    return {
      success: true,
      currentPrefix: normalizedPrefix,
      folders,
      files
    };
  } catch (err) {
    console.error('Error listing R2 objects:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('r2:deleteObject', async (event, { key, isFolder }) => {
  try {
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Налаштування Cloudflare R2 відсутні.');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey.trim()
      }
    });

    const bucket = settings.bucketName.trim();

    if (isFolder) {
      const folderPrefix = key.endsWith('/') ? key : `${key}/`;
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: folderPrefix
      });
      const listed = await s3Client.send(listCommand);

      if (listed.Contents && listed.Contents.length > 0) {
        const deleteParams = {
          Bucket: bucket,
          Delete: {
            Objects: listed.Contents.map(obj => ({ Key: obj.Key }))
          }
        };
        await s3Client.send(new DeleteObjectsCommand(deleteParams));
      }
    } else {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      }));
    }

    return { success: true };
  } catch (err) {
    console.error('Error deleting R2 object:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('r2:deleteBatch', async (event, items) => {
  try {
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Налаштування Cloudflare R2 відсутні.');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey.trim()
      }
    });

    const bucket = settings.bucketName.trim();

    for (const item of items) {
      if (item.isFolder) {
        const folderPrefix = item.key.endsWith('/') ? item.key : `${item.key}/`;
        const listCommand = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: folderPrefix
        });
        const listed = await s3Client.send(listCommand);

        if (listed.Contents && listed.Contents.length > 0) {
          const deleteParams = {
            Bucket: bucket,
            Delete: {
              Objects: listed.Contents.map(obj => ({ Key: obj.Key }))
            }
          };
          await s3Client.send(new DeleteObjectsCommand(deleteParams));
        }
      } else {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: item.key
        }));
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Error batch deleting R2 objects:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('r2:uploadAnyFile', async (event, prefix = '') => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Завантажити файл у Cloudflare R2'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const normalizedPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : '';
    const s3Key = `${normalizedPrefix}${fileName}`;

    if (!fs.existsSync(settingsPath)) {
      throw new Error('Налаштування Cloudflare R2 відсутні.');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey.trim()
      }
    });

    let contentType = mime.lookup(filePath) || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);

    await s3Client.send(new PutObjectCommand({
      Bucket: settings.bucketName.trim(),
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
    }));

    return { success: true, fileName };
  } catch (err) {
    console.error('Error uploading file to R2:', err);
    return { success: false, error: err.message };
  }
});


// --- Video Probing Handlers ---
ipcMain.handle('dialog:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'ts', 'm4v'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const stats = fs.statSync(filePath);
    let videoInfo = { duration: 0, width: 0, height: 0 };
    try {
      videoInfo = await getVideoMetadata(filePath);
    } catch (e) {
      console.warn('Could not probe video metadata:', e);
    }

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      width: videoInfo ? (videoInfo.width || 0) : 0,
      height: videoInfo ? (videoInfo.height || 0) : 0,
      duration: videoInfo ? (videoInfo.duration || 0) : 0
    };
  } catch (err) {
    console.error('Error selecting file in dialog:', err);
    return null;
  }
});

ipcMain.handle('video:getResolution', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return await getVideoMetadata(filePath);
  } catch (err) {
    console.error('Error getting video resolution:', err);
    return null;
  }
});

// --- Cancellation & Transcoding Process ---
ipcMain.on('process:stop', () => {
  activeCancelRef.isCancelled = true;
  if (currentFfmpegCommand) {
    try {
      currentFfmpegCommand.kill('SIGKILL');
    } catch (e) {
      console.warn('Error killing FFmpeg process:', e);
    }
    currentFfmpegCommand = null;
  }
});

let currentTranscodePct = 0;
let currentUploadPct = 0;

function updateDockProgressBar(transcodePct, uploadPct) {
  if (transcodePct !== undefined) currentTranscodePct = transcodePct;
  if (uploadPct !== undefined) currentUploadPct = uploadPct;

  const combined = (currentTranscodePct * 0.5 + currentUploadPct * 0.5) / 100;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(Math.max(0.01, Math.min(1.0, combined)));
  }
}

function clearDockProgressBar() {
  currentTranscodePct = 0;
  currentUploadPct = 0;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(-1);
  }
}

ipcMain.on('process:start', async (event, data) => {
  const { inputPath, durationSec: inputDurationSec, folderName, selectedQualities, r2Settings, keepLocal, addRandomSuffix, transcodeMode, cloudSettings } = data;
  const tempDir = path.join(os.tmpdir(), `transcoder-${Date.now()}`);
  activeCancelRef = { isCancelled: false };
  const cancelRef = activeCancelRef;
  clearDockProgressBar();
  updateDockProgressBar(0, 0);

  const sendStatus = (status, details = '') => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status:change', { status, details });
    }
  };

  const sendError = (errorMsg) => {
    clearDockProgressBar();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:error', { error: errorMsg });
    }
  };

  if (transcodeMode === 'cloud') {
    try {
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Вхідний файл не знайдено: ${inputPath}`);
      }

      if (!r2Settings.accountId || !r2Settings.accessKeyId || !r2Settings.secretAccessKey || !r2Settings.bucketName || !r2Settings.publicDomain) {
        throw new Error('Будь ласка, заповніть усі налаштування Cloudflare R2!');
      }

      if (!selectedQualities || selectedQualities.length === 0) {
        throw new Error('Виберіть хоча б один рівень якості!');
      }

      const s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2Settings.accountId.trim()}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2Settings.accessKeyId.trim(),
          secretAccessKey: r2Settings.secretAccessKey.trim()
        }
      });

      let targetFolder = (folderName && folderName.trim()) ? folderName.trim().replace(/^\/+|\/+$/g, '') : `video-${Date.now()}`;
      if (addRandomSuffix) {
        targetFolder = `${targetFolder}-${crypto.randomBytes(10).toString('hex')}`;
      }

      const tempR2Key = `temp-inputs/${Date.now()}_${path.basename(inputPath)}`;
      sendStatus('📤 Завантаження відео в R2 для обробки на GPU...');
      updateDockProgressBar(10, 0);

      const fileStream = fs.createReadStream(inputPath);
      const r2Upload = new Upload({
        client: s3Client,
        params: {
          Bucket: r2Settings.bucketName.trim(),
          Key: tempR2Key,
          Body: fileStream,
          ContentType: mime.lookup(inputPath) || 'video/mp4'
        },
        queueSize: 4,
        partSize: 8 * 1024 * 1024 // 8 MB multipart chunks
      });

      r2Upload.on('httpUploadProgress', (progress) => {
        if (progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 15) + 10;
          updateDockProgressBar(pct, 0);
        }
      });

      await r2Upload.done();

      sendStatus('🚀 Ініціалізація Хмарного GPU воркера...');
      updateDockProgressBar(25, 0);

      let durationSec = inputDurationSec;
      if (!durationSec) {
        const meta = await getVideoResolution(inputPath);
        durationSec = meta ? meta.duration : 60;
      }

      const provider = createCloudProvider(cloudSettings || {});
      const jobId = await provider.startJob({
        input_r2_key: tempR2Key,
        target_folder: targetFolder,
        selected_qualities: selectedQualities,
        duration_sec: durationSec || 60,
        r2_settings: r2Settings,
        add_random_suffix: false
      });

      let isFinished = false;
      let currentProgress = 25;
      let uploadProgress = 0;
      const totalEstimatedSec = Math.max(30, Math.ceil((durationSec || 60) * selectedQualities.length * 0.3));

      while (!isFinished) {
        if (cancelRef.isCancelled) {
          await provider.cancelJob(jobId);
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: r2Settings.bucketName.trim(), Key: tempR2Key })); } catch (e) {}
          clearDockProgressBar();
          mainWindow.webContents.send('process:cancelled');
          return;
        }

        const statusRes = await provider.getJobStatus(jobId);
        const state = statusRes.status || statusRes.state;

        if (state === 'IN_QUEUE') {
          sendStatus('⏳ В черзі Хмарного GPU сервера...');
          currentProgress = Math.min(35, currentProgress + 2);
          updateDockProgressBar(currentProgress, 10);
        } else if (state === 'IN_PROGRESS') {
          currentProgress = Math.min(92, currentProgress + Math.max(1, Math.round(60 / Math.max(5, totalEstimatedSec / 2.5))));
          uploadProgress = Math.min(85, Math.round((currentProgress / 92) * 85));

          sendStatus(`⚡ Хмарне GPU транскодування (${currentProgress}%)...`);
          updateDockProgressBar(currentProgress, uploadProgress);

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcode:progress', {
              percent: currentProgress,
              currentQuality: 'Cloud GPU',
              qualityIndex: 1,
              totalQualities: selectedQualities.length
            });

            mainWindow.webContents.send('upload:progress', {
              uploadedFiles: selectedQualities.length,
              percent: uploadProgress,
              stepDescription: 'Обробка та збереження HLS сегментів у CDN...'
            });
          }
        } else if (state === 'COMPLETED') {
          isFinished = true;
          currentProgress = 100;
          uploadProgress = 100;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcode:progress', {
              percent: 100,
              currentQuality: 'Cloud GPU',
              qualityIndex: selectedQualities.length,
              totalQualities: selectedQualities.length
            });

            mainWindow.webContents.send('upload:progress', {
              uploadedFiles: selectedQualities.length,
              percent: 100,
              stepDescription: 'Усі файли завантажено у CDN!'
            });
          }

          try { await s3Client.send(new DeleteObjectCommand({ Bucket: r2Settings.bucketName.trim(), Key: tempR2Key })); } catch (e) {}
        } else if (state === 'FAILED') {
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: r2Settings.bucketName.trim(), Key: tempR2Key })); } catch (e) {}
          throw new Error(`Хмарне транскодування завершилось помилкою: ${statusRes.error || 'Cloud Job Failed'}`);
        }

        await new Promise(res => setTimeout(res, 2000));
      }

      let domain = r2Settings.publicDomain.trim().replace(/\/+$/, '');
      if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
        domain = `https://${domain}`;
      }
      const masterUrl = `${domain}/${targetFolder}/master.m3u8`;

      sendStatus('Завершено!', 'Всі файли успішно транскодовано та завантажено на GPU.');
      clearDockProgressBar();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('process:complete', {
          masterUrl,
          folderName: targetFolder,
          totalFiles: selectedQualities.length * 10
        });
      }
      return;
    } catch (err) {
      sendError(err.message);
      return;
    }
  }

  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Вхідний файл не знайдено: ${inputPath}`);
    }

    if (!r2Settings.accountId || !r2Settings.accessKeyId || !r2Settings.secretAccessKey || !r2Settings.bucketName || !r2Settings.publicDomain) {
      throw new Error('Будь ласка, заповніть усі налаштування Cloudflare R2!');
    }

    if (!selectedQualities || selectedQualities.length === 0) {
      throw new Error('Виберіть хоча б один рівень якості!');
    }

    fs.mkdirSync(tempDir, { recursive: true });

    sendStatus('Аналіз вхідного відео...');
    const videoMeta = await getVideoMetadata(inputPath);
    const videoDuration = videoMeta.duration;

    if (cancelRef.isCancelled) {
      cleanUpTempDir(tempDir);
      mainWindow.webContents.send('process:cancelled');
      return;
    }

    const totalQualities = selectedQualities.length;
    const generatedVariants = [];
    let targetFolder = (folderName && folderName.trim()) ? folderName.trim().replace(/^\/+|\/+$/g, '') : `video-${Date.now()}`;
    if (addRandomSuffix) {
      const randomSuffix = crypto.randomBytes(10).toString('hex');
      targetFolder = `${targetFolder}-${randomSuffix}`;
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2Settings.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Settings.accessKeyId.trim(),
        secretAccessKey: r2Settings.secretAccessKey.trim()
      }
    });

    let uploadedCount = 0;
    let totalUploadedFilesCount = 0;
    const estSegments = Math.max(1, Math.ceil((videoDuration || 60) / 6)) + 1;
    const totalExpectedFiles = selectedQualities.length * estSegments + 1;
    const uploadTasks = [];

    const CONCURRENCY_LIMIT = 6;

    const uploadSingleFile = async (filePath, stepDescription) => {
      if (cancelRef.isCancelled) {
        throw new Error('PROCESS_CANCELLED');
      }

      const relativePath = path.relative(tempDir, filePath).replace(/\\/g, '/');
      const s3Key = `${targetFolder}/${relativePath}`;

      let contentType = mime.lookup(filePath) || 'application/octet-stream';
      if (filePath.endsWith('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl';
      } else if (filePath.endsWith('.ts')) {
        contentType = 'video/MP2T';
      }

      const cacheControl = filePath.endsWith('.m3u8')
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=31536000, immutable';

      const fileBuffer = fs.readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: r2Settings.bucketName.trim(),
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: cacheControl
      });

      // Upload with 15-second timeout and 3 retries per file
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        if (cancelRef.isCancelled) throw new Error('PROCESS_CANCELLED');
        attempts++;
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 15000)
          );
          await Promise.race([s3Client.send(command), timeoutPromise]);
          break; // Success
        } catch (err) {
          if (cancelRef.isCancelled || err.message === 'PROCESS_CANCELLED') throw err;
          if (attempts >= maxAttempts) {
            console.warn(`File upload skipped after ${maxAttempts} retries: ${s3Key}`, err);
          } else {
            await new Promise(res => setTimeout(res, 1000 * attempts));
          }
        }
      }

      uploadedCount++;
      totalUploadedFilesCount++;
      const uploadPct = totalExpectedFiles > 0 ? Math.min(99, Math.round((totalUploadedFilesCount / totalExpectedFiles) * 100)) : 0;
      updateDockProgressBar(undefined, uploadPct);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('upload:progress', {
          uploadedFiles: totalUploadedFilesCount,
          totalExpectedFiles,
          percent: uploadPct,
          stepDescription
        });
      }
    };

    const uploadFilesBatch = async (filesBatch, stepDescription) => {
      const queue = [...filesBatch];
      const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, queue.length) }, async () => {
        while (queue.length > 0) {
          if (cancelRef.isCancelled) throw new Error('PROCESS_CANCELLED');
          const filePath = queue.shift();
          if (filePath) {
            await uploadSingleFile(filePath, stepDescription);
          }
        }
      });
      await Promise.all(workers);
    };

    // Pipelined Transcode & Upload
    for (let i = 0; i < selectedQualities.length; i++) {
      if (cancelRef.isCancelled) {
        cleanUpTempDir(tempDir);
        clearDockProgressBar();
        mainWindow.webContents.send('process:cancelled');
        return;
      }

      const qKey = selectedQualities[i];
      const preset = QUALITY_PRESETS[qKey];
      if (!preset) continue;

      const qDir = path.join(tempDir, qKey);
      fs.mkdirSync(qDir, { recursive: true });
      const playlistPath = path.join(qDir, 'index.m3u8');

      sendStatus(`Транскодування [${i + 1}/${totalQualities}]: ${qKey}...`);

      await transcodeQuality(inputPath, playlistPath, preset, videoDuration, (progressPercent) => {
        const overallProgress = Math.round(((i + progressPercent / 100) / totalQualities) * 100);
        updateDockProgressBar(overallProgress, undefined);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('transcode:progress', {
            percent: overallProgress,
            currentQuality: qKey,
            qualityIndex: i + 1,
            totalQualities
          });
        }
      }, cancelRef);

      if (cancelRef.isCancelled) {
        cleanUpTempDir(tempDir);
        mainWindow.webContents.send('process:cancelled');
        return;
      }

      generatedVariants.push({
        name: qKey,
        preset,
        relativePath: `${qKey}/index.m3u8`
      });

      const qualityFiles = getAllFilesRecursive(qDir);
      sendStatus(`Завантаження в CDN: ${qKey} (${qualityFiles.length} файлів)...`);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('upload:qualityState', { quality: qKey, status: 'uploading' });
      }

      await uploadFilesBatch(qualityFiles, `Завантажено ${qKey}`);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('upload:qualityState', { quality: qKey, status: 'uploaded' });
      }
    }

    if (cancelRef.isCancelled) {
      cleanUpTempDir(tempDir);
      mainWindow.webContents.send('process:cancelled');
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transcode:progress', { percent: 100 });
    }

    sendStatus('Генерація master.m3u8 плейлиста...');
    const masterPlaylistContent = generateMasterPlaylist(generatedVariants);
    const masterPath = path.join(tempDir, 'master.m3u8');
    fs.writeFileSync(masterPath, masterPlaylistContent, 'utf-8');

    sendStatus('Фіналізація завантаження в Cloudflare R2...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('upload:qualityState', { quality: 'master', status: 'uploading' });
    }

    await Promise.all(uploadTasks);

    if (cancelRef.isCancelled) {
      cleanUpTempDir(tempDir);
      mainWindow.webContents.send('process:cancelled');
      return;
    }

    await uploadFilesBatch([masterPath], 'Master плейлист завантажено');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('upload:qualityState', { quality: 'master', status: 'uploaded' });
    }

    let domain = r2Settings.publicDomain.trim().replace(/\/+$/, '');
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = `https://${domain}`;
    }

    const masterUrl = `${domain}/${targetFolder}/master.m3u8`;

    if (!keepLocal) {
      cleanUpTempDir(tempDir);
    }

    sendStatus('Завершено!', 'Всі файли успішно транскодовано та завантажено.');
    clearDockProgressBar();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:complete', {
        masterUrl,
        folderName: targetFolder,
        totalFiles: totalUploadedFilesCount
      });
    }

  } catch (err) {
    cleanUpTempDir(tempDir);
    clearDockProgressBar();
    if (err.message === 'PROCESS_CANCELLED' || cancelRef.isCancelled) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('process:cancelled');
      }
    } else {
      console.error('Process error:', err);
      sendError(err.message || 'Сталася невідома помилка під час обробки.');
    }
  } finally {
    currentFfmpegCommand = null;
  }
});

// --- Helpers ---
function getVideoMetadata(inputPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err || !metadata) {
        resolve({ duration: 0, width: 0, height: 0 });
        return;
      }

      let duration = 0;
      let width = 0;
      let height = 0;

      if (metadata.format && metadata.format.duration) {
        duration = parseFloat(metadata.format.duration);
      }

      if (metadata.streams) {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          width = videoStream.width || 0;
          height = videoStream.height || 0;
        }
      }

      resolve({ duration, width, height });
    });
  });
}

function transcodeQuality(inputPath, outputPath, preset, durationSec, onProgress, cancelRef) {
  return new Promise((resolve, reject) => {
    const segmentFilename = path.join(path.dirname(outputPath), 'segment_%03d.ts');
    let lastStderr = '';

    const cmd = ffmpeg(inputPath)
      .outputOptions([
        `-vf scale='min(${preset.width},iw)':-2,format=yuv420p`,
        `-c:v libx264`,
        `-b:v ${preset.videoBitrate}`,
        `-maxrate ${parseInt(preset.videoBitrate) * 1.2}k`,
        `-bufsize ${parseInt(preset.videoBitrate) * 2}k`,
        `-preset medium`,
        `-g 48`,
        `-sc_threshold 0`,
        `-c:a aac`,
        `-b:a ${preset.audioBitrate}`,
        `-ac 2`,
        `-f hls`,
        `-hls_time 6`,
        `-hls_playlist_type vod`,
        `-hls_segment_filename ${segmentFilename}`
      ])
      .output(outputPath)
      .on('stderr', (stderrLine) => {
        lastStderr = stderrLine;
      })
      .on('progress', (progress) => {
        if (cancelRef && cancelRef.isCancelled) {
          try { cmd.kill('SIGKILL'); } catch (e) {}
          reject(new Error('PROCESS_CANCELLED'));
          return;
        }

        if (durationSec > 0 && progress.timemark) {
          const parts = progress.timemark.split(':');
          if (parts.length === 3) {
            const currentSec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            const pct = Math.min(99, Math.round((currentSec / durationSec) * 100));
            onProgress(pct);
          }
        }
      })
      .on('end', () => {
        currentFfmpegCommand = null;
        if (cancelRef && cancelRef.isCancelled) {
          reject(new Error('PROCESS_CANCELLED'));
        } else {
          onProgress(100);
          resolve();
        }
      })
      .on('error', (err) => {
        currentFfmpegCommand = null;
        if (cancelRef && cancelRef.isCancelled) {
          reject(new Error('PROCESS_CANCELLED'));
        } else {
          const detail = lastStderr ? ` (${lastStderr})` : '';
          reject(new Error(`FFmpeg error (${preset.name}): ${err.message}${detail}`));
        }
      });

    currentFfmpegCommand = cmd;
    cmd.run();
  });
}

function generateMasterPlaylist(variants) {
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
  for (const variant of variants) {
    const p = variant.preset;
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${p.width}x${p.height},NAME="${variant.name}"\n`;
    content += `${variant.relativePath}\n\n`;
  }
  return content;
}

function getAllFilesRecursive(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFilesRecursive(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function cleanUpTempDir(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Failed to cleanup temp dir:', e);
  }
}

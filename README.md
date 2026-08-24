# HLS Transcoder & Cloudflare R2 Uploader 🎬☁️

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-31.0.0-47848F?logo=electron)](https://www.electronjs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-HLS_Transcoding-007800?logo=ffmpeg)](https://ffmpeg.org/)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2_CDN-F38020?logo=cloudflare)](https://www.cloudflare.com/developer-platform/r2/)

Потужний настільний (GUI) додаток на **Electron + Node.js + FFmpeg**, який автоматизує процес підготовки відео для вебу: локальне транскодування в HLS (`master.m3u8` з різними рівнями якості) та його миттєве конвеєрне завантаження у **Cloudflare R2 CDN**.

---

## 🌟 Основні можливості

- 🎬 **Мультибітрейтне HLS-кодування**: автоматична генерація варіантних плейлистів та сегментів (`1080p Full HD`, `720p HD`, `480p SD`, `360p Low`) і підсумкового плейлиста `master.m3u8`.
- ⚡ **Конвеєрне (Pipelined) завантаження**: сегменти кожної завершеної якості **одразу починають завантажуватися в Cloudflare R2**, поки FFmpeg паралельно кодує наступну якість. Це суттєво скорочує час очікування.
- 🎯 **Розумне виявлення якості джерела**: додаток аналізує оригінальне відео через `ffprobe` і вимикає чекбокси якості, яка є вищою за джерело (наприклад, 1080p для відео 720p).
- 📁 **Cloudflare R2 Bucket Explorer**: вбудований оглядач файлів та папок бакета для швидкої навігації, перегляду вмісту, отримання прямих CDN-посилань та видалення застарілих файлів/папок.
- 🧪 **Тест підключення R2**: швидка діагностика правильності введених ключів R2 та доступності бакета.
- 🛑 **Можливість зупинки процесів**: одна кнопка для негайної зупинки транскодування (`SIGKILL`), завантаження та автоматичного видалення тимчасових файлів.
- 🔒 **Конфіденційність та безпека**: ключі доступу R2 зберігаються локально в зашифрованому/безпечному системному профілі вашого ПК.

---

## 🖥️ Скріншоти та Інтерфейс

Додаток має три основні вкладки:
1. **🎬 Транскодер**: Драг-енд-дроп вибір відео, чекбокси якості, прогрес кодування та завантаження, кнопка "Копіювати CDN URL".
2. **📁 Оглядач R2**: Переглядач структури бакета в стилі файлового менеджера.
3. **⚙️ Налаштування R2**: Збереження реквізитів Cloudflare R2 S3 API та кнопка перевірки з'єднання.

---

## 🛠️ Передумови (Requirements)

Для роботи транскодера у вашій системі має бути встановлено **FFmpeg**:

- **macOS**: `brew install ffmpeg`
- **Linux (Ubuntu/Debian)**: `sudo apt install ffmpeg`
- **Windows**: [Завантажити FFmpeg](https://ffmpeg.org/download.html) та додати шлях до `bin` у змінну оточення `PATH`.

---

## 🚀 Швидкий запуск для розробки

1. Клонувати репозиторій:
   ```bash
   git clone https://github.com/your-username/transcoder-uploader.git
   cd transcoder-uploader
   ```

2. Встановити залежності:
   ```bash
   npm install
   ```

3. Запустити додаток:
   ```bash
   npm start
   ```

---

## 📦 Збірка релізів (Build Executables)

Додаток налаштовано для авто-збірки готових інсталяторів та бінарних файлів під усі популярні ОС за допомогою `electron-builder`:

```bash
# Збірка під поточну платформу
npm run dist

# Збірка під macOS (.dmg та .zip)
npm run dist:mac

# Збірка під Windows (.exe NSIS інсталятор та portable)
npm run dist:win

# Збірка під Linux (.AppImage та .deb)
npm run dist:linux
```

Згенеровані інсталяційні файли будуть збережені у папці `dist/`.

---

## ⚙️ Налаштування Cloudflare R2

Для заповнення вкладки **⚙️ Налаштування R2** вам знадобляться:

1. **Account ID**: У консолі Cloudflare (праве бічне меню або URL розділу R2).
2. **Access Key ID & Secret Access Key**: 
   - Перейдіть у **R2** -> **Manage R2 API Tokens**.
   - Натисніть **Create API Token** (з правами `Admin Read & Write`).
3. **Bucket Name**: Назва створеного R2 бакета (наприклад `my-video-cdn`).
4. **Public CDN Domain**: Публічна URL-адреса бакета R2 (наприклад `https://pub-xxxx.r2.dev` або підключений власний домен `https://cdn.yourdomain.com`).

---

## 📄 Ліцензія

Цей проект розповсюджується під ліцензією **Apache License 2.0**. Детальніше дивіться у файлі [LICENSE](LICENSE).

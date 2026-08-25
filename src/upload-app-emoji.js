// Разовый скрипт: заливает файлы из assets/emoji/ как Application Emoji через API.
// Application Emoji работают у бота на ЛЮБОМ сервере сразу, без привязки к гильдии
// (см. официальную документацию: https://discord.com/developers/docs/resources/emoji).
// Запуск: npm run upload-app-emoji
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('./config');

const EMOJI_DIR = path.join(__dirname, '..', 'assets', 'emoji');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sanitizeName(rawName) {
  const cleaned = rawName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
  return cleaned.length >= 2 ? cleaned : null;
}

(async () => {
  if (!fs.existsSync(EMOJI_DIR)) {
    console.log(`Папка ${EMOJI_DIR} не найдена — нечего загружать.`);
    return;
  }

  const files = fs.readdirSync(EMOJI_DIR).filter((f) => MIME_BY_EXT[path.extname(f).toLowerCase()]);
  if (files.length === 0) {
    console.log('В assets/emoji/ нет подходящих файлов (png/gif/jpg/webp). См. assets/emoji/README.md.');
    return;
  }

  console.log(`Найдено файлов: ${files.length}. Загружаю как Application Emoji...\n`);

  const results = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const rawName = path.basename(file, ext);
    const name = sanitizeName(rawName);

    if (!name) {
      console.log(`[пропущен] ${file} — имя после очистки короче 2 символов, переименуй файл.`);
      continue;
    }

    const filePath = path.join(EMOJI_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.size > 256 * 1024) {
      console.log(`[пропущен] ${file} — больше 256 КБ (лимит Discord).`);
      continue;
    }

    const base64 = fs.readFileSync(filePath).toString('base64');
    const dataUri = `data:${MIME_BY_EXT[ext]};base64,${base64}`;

    try {
      const res = await fetch(`https://discord.com/api/v10/applications/${config.clientId}/emojis`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${config.discordToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, image: dataUri }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.log(`[ошибка] ${file} → ${res.status}: ${errBody}`);
        continue;
      }

      const emoji = await res.json();
      results.push({ file, name: emoji.name, id: emoji.id });
      console.log(`[готово] ${file} → <:${emoji.name}:${emoji.id}>`);
    } catch (err) {
      console.log(`[ошибка сети] ${file}:`, err.message);
    }
  }

  if (results.length > 0) {
    console.log('\n--- Готовые строки для вставки в код ---');
    for (const r of results) {
      console.log(`${r.name.toUpperCase()}_EMOJI=<:${r.name}:${r.id}>`);
    }
  }
})();

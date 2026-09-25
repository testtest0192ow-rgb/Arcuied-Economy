const fs = require('fs');
const path = require('path');

let cache = null;

function loadEmojiIds() {
  if (cache) return cache;
  const filePath = path.join(__dirname, '..', 'generated', 'emojiIds.json');
  try {
    cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * Возвращает "<:name:id> " (с пробелом после), если такой Application Emoji уже
 * залит через `npm run upload-app-emoji` и его ID появился в src/generated/emojiIds.json.
 * Если ID ещё нет — возвращает пустую строку, а НЕ битый тег вида <:name:undefined>,
 * который Discord показал бы как обычный текст. Так код можно писать заранее,
 * не дожидаясь заливки конкретного эмодзи — он просто появится сам после неё,
 * без повторного редактирования файлов команд.
 */
function appEmoji(name) {
  const ids = loadEmojiIds();
  return ids[name] ? `<:${name}:${ids[name]}> ` : '';
}

module.exports = { appEmoji };

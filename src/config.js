require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}. Проверь .env (см. .env.example).`);
  }
  return value;
}

// Парсит "url1,url2,url3" в массив, отбрасывая пустые элементы. Пусто/не задано -> [].
function parseGifList(name) {
  const raw = process.env[name] || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRandom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

const config = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  clientId: requireEnv('DISCORD_CLIENT_ID'),
  mongodbUri: requireEnv('MONGODB_URI'),
  // Не список конкретных серверов — просто максимум, сколько серверов одновременно
  // бот может обслуживать. Можно добавлять его куда угодно, лишь бы не больше лимита.
  maxGuilds: Number(process.env.MAX_GUILDS || 10),
  botOwnerId: process.env.BOT_OWNER_ID || null,
  timelyCooldownHours: Number(process.env.TIMELY_COOLDOWN_HOURS || 12),
  // Комиссия на /give в процентах — списывается сверх суммы перевода и просто
  // уходит из экономики (не начисляется никому), как у конкурентов.
  giveFeePercent: Number(process.env.GIVE_FEE_PERCENT || 2),
  assets: {
    // Гифки результата /coinflip — показываются в зависимости от того, что реально
    // выпало (не от того, что выбрал игрок). Можно указать несколько через запятую
    // в .env — тогда каждый раз выбирается случайная из списка.
    coinflipHeadsGifUrls: parseGifList('COINFLIP_HEADS_GIF_URL'),
    coinflipTailsGifUrls: parseGifList('COINFLIP_TAILS_GIF_URL'),
    // GIF для стадии "Дуэль началась". Слева всегда challenger (тот, кто вызвал),
    // справа всегда opponent (кого вызвали) — так и в embed, и в самой гифке.
    // Можно указать несколько через запятую — выбирается случайная.
    duelGifUrls: parseGifList('DUEL_GIF_URL'),
    // Гифки результата /dice — можно указать несколько через запятую, выбирается случайная.
    diceGifUrls: parseGifList('DICE_GIF_URL'),
    pickRandomGif: pickRandom,
  },
  // Белые кастомные иконки для select-меню (сортировка в /shop и т.п.). По умолчанию
  // используются обычные текстовые символы (★ ↓ ↑ ▦), которые Discord рендерит
  // плоским белым/серым цветом текста — НЕ цветными emoji-картинками, поэтому
  // никаких загрузок на сервер не требуется. Если позже захочешь именно свои
  // нарисованные иконки — залей их как custom emoji и впиши ID сюда в формате
  // <:name:ID>, тогда они заменят символы по умолчанию.
  sortIcons: {
    popular: process.env.SORT_ICON_POPULAR || '★',
    cheap: process.env.SORT_ICON_CHEAP || '↓',
    expensive: process.env.SORT_ICON_EXPENSIVE || '↑',
    new: process.env.SORT_ICON_NEW || '▦',
  },
  colors: {
    primary: 0x5c5f66,
    success: 0x57f287,
    danger: 0xed4245,
    warning: 0xfee75c,
  },
};

module.exports = config;

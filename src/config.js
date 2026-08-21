require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}. Проверь .env (см. .env.example).`);
  }
  return value;
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
  // Канал, куда падают уведомления о новых /report — если не задан, отчёт создаётся
  // в БД, но никто не получит уведомление, пока не настроишь.
  reportChannelId: process.env.REPORT_CHANNEL_ID || null,
  assets: {
    // Гифки результата /coinflip — показываются в зависимости от того, что реально
    // выпало (не от того, что выбрал игрок).
    coinflipHeadsGifUrl: process.env.COINFLIP_HEADS_GIF_URL || null,
    coinflipTailsGifUrl: process.env.COINFLIP_TAILS_GIF_URL || null,
    // GIF для стадии "Дуэль началась". Слева всегда challenger (тот, кто вызвал),
    // справа всегда opponent (кого вызвали) — так и в embed, и в самой гифке.
    duelGifUrl: process.env.DUEL_GIF_URL || null,
    // GIF для результата /dice — можно сделать 6 разных (по выпавшей грани) через
    // diceGifUrls[1..6], или одну общую через diceGifUrl.
    diceGifUrl: process.env.DICE_GIF_URL || null,
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
    primary: 0x2b2d31,
    success: 0x57f287,
    danger: 0xed4245,
    warning: 0xfee75c,
  },
};

module.exports = config;

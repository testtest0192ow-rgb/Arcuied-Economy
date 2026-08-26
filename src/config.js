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
  allowedGuildIds: (process.env.ALLOWED_GUILD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  botOwnerId: process.env.BOT_OWNER_ID || null,
  timelyCooldownHours: Number(process.env.TIMELY_COOLDOWN_HOURS || 12),
  colors: {
    primary: 0x2b2d31,
    success: 0x57f287,
    danger: 0xed4245,
    warning: 0xfee75c,
  },
};

module.exports = config;

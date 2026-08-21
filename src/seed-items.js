// Разовый скрипт: наполняет магазин тестовыми предметами для одного сервера.
// Запуск: node src/seed-items.js <guildId>  (или задай GUILD_ID в .env)
// Полноценное управление магазином через Dashboard появится позже — это только для теста.
require('dotenv').config();
const { connectDatabase } = require('./database/connection');
const Item = require('./models/Item');

const SAMPLE_ITEMS = [
  { key: 'title_veteran', name: 'Титул: Ветеран', description: 'Косметический титул для профиля.', price: 500, category: 'title', stackable: false, usable: true },
  { key: 'coin_booster_1h', name: 'Бустер монет (1ч)', description: 'Удваивает монеты с /timely на 1 час.', price: 300, category: 'booster', usable: true },
  { key: 'case_common', name: 'Обычный кейс', description: 'Содержит случайные предметы и монеты.', price: 200, category: 'case' },
];

const guildId = process.argv[2] || process.env.TEST_GUILD_ID;

(async () => {
  if (!guildId) {
    console.log('Нужен ID сервера: node src/seed-items.js <guildId>, либо задай TEST_GUILD_ID в .env');
    process.exit(1);
  }

  await connectDatabase(console);

  for (const item of SAMPLE_ITEMS) {
    await Item.findOneAndUpdate({ guildId, key: item.key }, { $set: { guildId, ...item } }, { upsert: true });
  }
  console.log(`[seed] Добавлены тестовые предметы для сервера ${guildId}`);

  process.exit(0);
})();

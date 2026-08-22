// Разовый скрипт: стирает глобальные команды приложения. Нужен, потому что если
// команды уже были задеплоены глобально, они не исчезнут сами — Discord продолжит
// их показывать (вместе с гильдийными — отсюда дубли в списке), пока их явно не
// перезаписать пустым списком.
// Запуск: node src/clear-global-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('./config');

const rest = new REST().setToken(config.discordToken);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log('[clear] Глобальные команды стёрты. Обновление на клиентах Discord может занять до ~1 часа.');
  } catch (err) {
    console.error('[clear] Ошибка:', err);
    process.exitCode = 1;
  }
})();

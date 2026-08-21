const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

const commands = commandFiles.map((file) => require(path.join(commandsPath, file)).data.toJSON());

const rest = new REST().setToken(config.discordToken);

(async () => {
  try {
    // Глобальная регистрация — работает на ЛЮБОМ сервере, куда добавишь бота, без
    // необходимости заранее знать ID серверов. Единственный минус: обновление
    // команд может занять до ~1 часа, чтобы разойтись по Discord (это ограничение
    // самого Discord API, не наше).
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`[deploy] Команды зарегистрированы глобально (${commands.length} шт.). Обновление может занять до ~1 часа.`);

    // Для тестирования прямо сейчас — если задан TEST_GUILD_ID в .env, команды туда
    // прилетают мгновенно (гильдийные команды обновляются без задержки Discord).
    if (process.env.TEST_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, process.env.TEST_GUILD_ID), { body: commands });
      console.log(`[deploy] Дополнительно — мгновенно обновлены на тестовом сервере ${process.env.TEST_GUILD_ID}.`);
    }
  } catch (err) {
    console.error('[deploy] Ошибка при деплое команд:', err);
    process.exitCode = 1;
  }
})();

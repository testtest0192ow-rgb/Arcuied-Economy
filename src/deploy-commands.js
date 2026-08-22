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
    if (process.env.TEST_GUILD_ID) {
      // Пока идёт тестирование на одном сервере — деплоим ТОЛЬКО туда (гильдийные
      // команды, мгновенно). Если параллельно задеплоить ещё и глобально, Discord
      // покажет каждую команду ДВАЖДЫ в списке — это не баг клиента, это реально
      // две разные регистрации одной и той же команды.
      await rest.put(Routes.applicationGuildCommands(config.clientId, process.env.TEST_GUILD_ID), { body: commands });
      console.log(`[deploy] Команды обновлены на тестовом сервере ${process.env.TEST_GUILD_ID} (${commands.length} шт.), мгновенно.`);
      console.log('[deploy] Глобальный деплой пропущен — TEST_GUILD_ID задан. Удали его из .env, когда будешь готов раскатывать на все сервера.');
      return;
    }

    // Глобальная регистрация — работает на ЛЮБОМ сервере, куда добавишь бота, без
    // необходимости заранее знать ID серверов. Может занять до ~1 часа, чтобы
    // разойтись по Discord (ограничение самого Discord API, не наше).
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`[deploy] Команды зарегистрированы глобально (${commands.length} шт.). Обновление может занять до ~1 часа.`);
  } catch (err) {
    console.error('[deploy] Ошибка при деплое команд:', err);
    process.exitCode = 1;
  }
})();

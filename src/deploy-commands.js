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
    if (config.allowedGuildIds.length === 0) {
      console.log('ALLOWED_GUILD_IDS пуст — нечего деплоить. Заполни .env.');
      return;
    }

    for (const guildId of config.allowedGuildIds) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands });
      console.log(`[deploy] Команды обновлены на сервере ${guildId} (${commands.length} шт.)`);
    }
  } catch (err) {
    console.error('[deploy] Ошибка при деплое команд:', err);
    process.exitCode = 1;
  }
})();

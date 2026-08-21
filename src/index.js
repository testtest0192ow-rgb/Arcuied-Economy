const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { connectDatabase } = require('./database/connection');

const logger = console;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
client.logger = logger;
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Мягкий лимит по количеству серверов, а не по конкретным ID — можно добавлять
// бота куда угодно, лишь бы одновременно их было не больше config.maxGuilds.
// Если уже на лимите и добавляют на ещё один сервер — бот сам с него выходит.
client.on('guildCreate', async (guild) => {
  if (client.guilds.cache.size > config.maxGuilds) {
    logger.warn(`[guard] Превышен лимит серверов (${config.maxGuilds}) — покидаю "${guild.name}" (${guild.id}).`);
    await guild.leave().catch(() => {});
  }
});

process.on('unhandledRejection', (err) => {
  logger.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', err);
});

(async () => {
  await connectDatabase(logger);
  await client.login(config.discordToken);
})();

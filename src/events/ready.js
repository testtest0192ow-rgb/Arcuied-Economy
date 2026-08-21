module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    client.logger.log(`[ready] Вошёл как ${client.user.tag}. Серверов: ${client.guilds.cache.size}.`);
  },
};

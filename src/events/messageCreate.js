const Wallet = require('../models/Wallet');
const { levelService } = require('../services/LevelService');
const { questService } = require('../services/QuestService');
const { baseEmbed } = require('../utils/embeds');

// Кулдаун на начисление XP — в памяти, не в БД: переживать рестарт бота ему не
// нужно, а нагружать Mongo проверкой на каждое сообщение — незачем.
const xpCooldown = new Map(); // `${guildId}:${userId}` -> timestamp мс
const XP_COOLDOWN_MS = 60_000;
const XP_MIN = 10;
const XP_MAX = 20;

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guildId) return;

    try {
      await Wallet.findOneAndUpdate(
        { guildId: message.guildId, userId: message.author.id },
        { $inc: { messageCount: 1 }, $setOnInsert: { guildId: message.guildId, userId: message.author.id } },
        { upsert: true }
      );
      await questService.increment(message.guild, message.author.id, 'messages', 1);
    } catch (err) {
      message.client.logger?.error?.('[messageCreate] Не удалось обновить messageCount', err);
    }

    const cooldownKey = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    if (xpCooldown.get(cooldownKey) > now) return;
    xpCooldown.set(cooldownKey, now + XP_COOLDOWN_MS);

    try {
      const amount = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
      const { leveledUp, newLevel } = await levelService.addXp({ guild: message.guild, userId: message.author.id, amount });

      if (leveledUp) {
        await message.channel
          .send({ embeds: [baseEmbed({ title: 'Новый уровень!', description: `${message.author} достиг уровня **${newLevel}**.` })] })
          .catch(() => {});
      }
    } catch (err) {
      message.client.logger?.error?.('[messageCreate] Не удалось начислить XP', err);
    }
  },
};

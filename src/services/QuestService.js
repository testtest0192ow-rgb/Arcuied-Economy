const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const WeeklyQuest = require('../models/WeeklyQuest');
const { transactionService } = require('./TransactionService');
const { baseEmbed } = require('../utils/embeds');
const config = require('../config');

const WEEKLY_TASKS = [
  { key: 'messages', label: 'Напиши 50 сообщений', target: 50 },
  { key: 'give', label: 'Передай монеты другу', target: 1 },
  { key: 'activity', label: 'Сыграй в дуэль или кости', target: 1 },
];

const REWARD_COINS = 500;

function getCurrentWeekKey() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

class QuestService {
  async getProgress(guildId, userId) {
    const weekKey = getCurrentWeekKey();
    return WeeklyQuest.findOneAndUpdate(
      { guildId, userId, weekKey },
      { $setOnInsert: { guildId, userId, weekKey } },
      { upsert: true, new: true }
    );
  }

  /** Увеличивает прогресс одного задания. Шлёт ЛС при закрытии этого задания,
   * а если этим закрыты сразу все три — отдельное ЛС на Components V2 с наградой. */
  async increment(guild, userId, taskKey, amount = 1) {
    const weekKey = getCurrentWeekKey();
    const guildId = guild.id;
    const task = WEEKLY_TASKS.find((t) => t.key === taskKey);
    if (!task) return null;

    const before = await WeeklyQuest.findOne({ guildId, userId, weekKey });
    const wasDone = before ? before[taskKey] >= task.target : false;

    const doc = await WeeklyQuest.findOneAndUpdate(
      { guildId, userId, weekKey },
      { $inc: { [taskKey]: amount }, $setOnInsert: { guildId, userId, weekKey } },
      { upsert: true, new: true }
    );

    const isDoneNow = doc[taskKey] >= task.target;
    if (!wasDone && isDoneNow && !doc.claimed) {
      await this._dmTaskCompleted(guild, userId, task, doc);
    }

    if (doc.claimed) return doc;

    const allDone = WEEKLY_TASKS.every((t) => doc[t.key] >= t.target);
    if (!allDone) return doc;

    doc.claimed = true;
    await doc.save();

    try {
      await transactionService.applyDelta({
        guildId,
        userId,
        currency: 'coins',
        amount: REWARD_COINS,
        type: 'quest_reward',
        idempotencyKey: `quest:${guildId}:${userId}:${weekKey}`,
      });
    } catch (err) {
      guild.client.logger?.error?.('[QuestService] Не удалось выдать награду за задания', err);
      return doc;
    }

    await this._dmAllCompleted(guild, userId, doc);
    return doc;
  }

  /** ЛС на одно выполненное задание — обычный embed, не перегружено. */
  async _dmTaskCompleted(guild, userId, task, doc) {
    try {
      const user = await guild.client.users.fetch(userId);
      const doneCount = WEEKLY_TASKS.filter((t) => doc[t.key] >= t.target).length;
      await user.send({
        embeds: [baseEmbed({
          title: 'Задание выполнено',
          description: `✅ ${task.label}\n\nПрогресс недели: **${doneCount}/${WEEKLY_TASKS.length}**`,
          color: config.colors.success,
        })],
      });
    } catch {
      // ЛС закрыты — молча пропускаем, это не критично
    }
  }

  /** ЛС при закрытии всех трёх заданий сразу — Components V2, список + награда. */
  async _dmAllCompleted(guild, userId) {
    try {
      const user = await guild.client.users.fetch(userId);
      const taskLines = WEEKLY_TASKS.map((t) => `✅ ${t.label}`).join('\n');

      const container = new ContainerBuilder()
        .setAccentColor(config.colors.success)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Все задания недели выполнены!**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(taskLines))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Награда: **${REWARD_COINS.toLocaleString('ru-RU')}** монет уже зачислена.\n\n-# Новая неделя — новые задания.`));

      await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch {
      // ЛС закрыты — молча пропускаем
    }
  }
}

module.exports = { questService: new QuestService(), WEEKLY_TASKS, REWARD_COINS, getCurrentWeekKey };

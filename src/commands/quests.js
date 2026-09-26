const { SlashCommandBuilder } = require('discord.js');
const qs = require('../services/QuestService');
const { container, v2 } = require('../utils/ui');
const { money } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('Ежедневные задания')
    .addSubcommand(s => s.setName('list').setDescription('Показать задания'))
    .addSubcommand(s => s.setName('claim').setDescription('Забрать выполненное задание').addStringOption(o => o.setName('id').setDescription('ID задания').setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'claim') {
      try {
        const q = await qs.claim(i.guildId, i.user.id, i.options.getString('id'));
        return i.reply({ flags: v2(), components: [container('Задание выполнено', `Награда: **${money(q.reward)}** монет`)] });
      } catch {
        return i.reply({ flags: v2(true), components: [container('Задание', 'Это задание ещё не выполнено или уже забрано.', 0xE47A7A)] });
      }
    }

    const rows = await qs.ensure(i.guildId, i.user.id);
    const body = rows.map((q, n) => {
      return `**${n + 1}. ${q.title}**\n${Math.min(q.progress, q.target)} / ${q.target} • награда **${money(q.reward)}** • ID \`${q._id}\``;
    }).join('\n\n');

    return i.reply({
      flags: v2(),
      components: [container('Ежедневные задания', body || 'На сегодня заданий нет.')]
    });
  }
};

const { SlashCommandBuilder } = require('discord.js');
const { mogBattleService } = require('../services/MogBattleService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder().setName('mogtop').setDescription('Топ по победам в Mog Battle'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const top = await mogBattleService.getTop(interaction.guildId, 10);
      if (top.length === 0) {
        await interaction.editReply({ embeds: [baseEmbed({ title: 'Топ Mog Battle', description: `Пока никто не побеждал.` })] });
        return;
      }

      const lines = await Promise.all(
        top.map(async (w, index) => {
          const user = await interaction.client.users.fetch(w.userId).catch(() => null);
          const place = MEDALS[index] || `**${index + 1}.**`;
          return `${place} ${user ? user.username : w.userId} — **${w.mogWins}** побед (${w.mogLosses} поражений)`;
        })
      );

      await interaction.editReply({ embeds: [baseEmbed({ title: 'Топ Mog Battle', description: `${lines.join('\n')}` })] });
    } catch (err) {
      interaction.client.logger?.error?.('[/mogtop]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

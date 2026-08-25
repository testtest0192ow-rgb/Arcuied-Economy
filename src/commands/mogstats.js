const { SlashCommandBuilder } = require('discord.js');
const { mogBattleService } = require('../services/MogBattleService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mogstats')
    .setDescription('Статистика Mog Battle')
    .addUserOption((opt) => opt.setName('user').setDescription('Чья статистика').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    await interaction.deferReply();

    try {
      const { wins, losses } = await mogBattleService.getStats(interaction.guildId, targetUser.id);
      const total = wins + losses;
      const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: `Mog Battle — ${targetUser.username}`,
            description: `${DIVIDER}\nПобед: **${wins}**\nПоражений: **${losses}**\nВинрейт: **${winrate}%**`,
          }),
        ],
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/mogstats]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

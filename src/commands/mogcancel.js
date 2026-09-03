const { SlashCommandBuilder } = require('discord.js');
const { mogBattleService, NoPendingBattleError } = require('../services/MogBattleService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('mogcancel').setDescription('Отменить свой ожидающий вызов на Mog Battle'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      await mogBattleService.cancelOwnPending({ guildId: interaction.guildId, challengerId: interaction.user.id });
      await interaction.editReply({ embeds: [baseEmbed({ title: 'Вызов отменён', description: `Ваш ожидающий вызов на Mog Battle отменён.` })] });
    } catch (err) {
      if (err instanceof NoPendingBattleError) {
        await interaction.editReply({ embeds: [errorEmbed('У вас нет ожидающих вызовов на Mog Battle.')] });
        return;
      }
      interaction.client.logger?.error?.('[/mogcancel]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

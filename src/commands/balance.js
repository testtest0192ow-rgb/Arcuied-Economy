const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { balanceEmbed, errorEmbed, attachDivider } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Посмотреть баланс')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей баланс посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);
      const embed = balanceEmbed(targetUser, wallet);
      const divider = attachDivider(embed);

      await interaction.editReply({ embeds: [embed], files: [divider] });
    } catch (err) {
      interaction.client.logger?.error?.('[/balance]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

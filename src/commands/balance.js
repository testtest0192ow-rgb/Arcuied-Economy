const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { balanceEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Посмотреть баланс')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей баланс посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);
      const embed = balanceEmbed(targetUser, wallet);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`balance:show:${targetUser.id}`)
          .setLabel('Показать всем')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      interaction.client.logger?.error?.('[/balance]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },

  // Handles the "Показать всем" button click.
  async handleButton(interaction) {
    const targetUserId = interaction.customId.split(':')[2];

    try {
      const targetUser = await interaction.client.users.fetch(targetUserId);
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUserId);
      const embed = balanceEmbed(targetUser, wallet);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: 'Готово, показал всем в чате.', ephemeral: true });
    } catch (err) {
      interaction.client.logger?.error?.('[/balance button]', err);
      await interaction.reply({ embeds: [errorEmbed()], ephemeral: true });
    }
  },
};

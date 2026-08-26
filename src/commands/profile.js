const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Посмотреть профиль')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей профиль посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);

      const embed = baseEmbed({
        title: targetUser.username,
        description:
          `${DIVIDER}\n` +
          `${COIN_ICON} Монеты: **${wallet.coins.toLocaleString('ru-RU')}**\n` +
          `${DONATE_ICON} Донат-монеты: **${wallet.donateCoins.toLocaleString('ru-RU')}**\n` +
          `Серия /timely: **${wallet.timelyStreak || 0}**`,
      }).setThumbnail(targetUser.displayAvatarURL());
      // TODO(Canvas patch): заменить на Canvas-карточку (premium dark, banner, avatar, титул).

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      interaction.client.logger?.error?.('[/profile]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

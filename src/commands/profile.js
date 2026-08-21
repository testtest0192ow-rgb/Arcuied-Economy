const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { relationshipService } = require('../services/RelationshipService');
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
      const marriage = await relationshipService.getActiveMarriage(interaction.guildId, targetUser.id);

      const embed = baseEmbed({
        title: targetUser.username,
        description:
          `${DIVIDER}\n` +
          `${COIN_ICON} Монеты: **${wallet.coins.toLocaleString('ru-RU')}**\n` +
          `${DONATE_ICON} Донат-монеты: **${wallet.donateCoins.toLocaleString('ru-RU')}**\n` +
          `Серия /timely: **${wallet.timelyStreak || 0}**`,
      }).setThumbnail(targetUser.displayAvatarURL());
      // TODO(Canvas patch): заменить на Canvas-карточку (premium dark, banner, avatar, титул).

      const buttons = [];
      if (marriage) {
        const partnerId = marriage.userAId === targetUser.id ? marriage.userBId : marriage.userAId;
        buttons.push(
          new ButtonBuilder().setCustomId(`profile:love:${targetUser.id}:${partnerId}`).setLabel('Любовный профиль').setStyle(ButtonStyle.Primary)
        );
      }

      const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
      const message = await interaction.editReply({ embeds: [embed], components });

      if (buttons.length) {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000, max: 1 });
        collector.on('collect', async (buttonInteraction) => {
          const [, , userAId, userBId] = buttonInteraction.customId.split(':');
          const loveEmbed = baseEmbed({
            title: 'Любовный профиль',
            description: `${DIVIDER}\n<@${userAId}> 💍 <@${userBId}>\nВместе с <t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:D> (<t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:R>).`,
          });
          await buttonInteraction.reply({ embeds: [loveEmbed], ephemeral: true });
        });
      }
    } catch (err) {
      interaction.client.logger?.error?.('[/profile]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

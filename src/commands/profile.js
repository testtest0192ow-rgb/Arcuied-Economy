const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { relationshipService } = require('../services/RelationshipService');
const { levelService } = require('../services/LevelService');
const { renderProfileCard } = require('../services/ProfileCardService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Посмотреть профиль')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей профиль посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);
      const { currentXp, neededXp } = levelService.progressWithinLevel(wallet.xp || 0);
      const marriage = await relationshipService.getActiveMarriage(interaction.guildId, targetUser.id);

      let partnerUsername = null;
      if (marriage) {
        const partnerId = marriage.userAId === targetUser.id ? marriage.userBId : marriage.userAId;
        const partnerUser = await interaction.client.users.fetch(partnerId).catch(() => null);
        partnerUsername = partnerUser?.username || null;
      }

      const buttons = [];
      if (marriage) {
        const partnerId = marriage.userAId === targetUser.id ? marriage.userBId : marriage.userAId;
        buttons.push(
          new ButtonBuilder().setCustomId(`profile:love:${targetUser.id}:${partnerId}`).setLabel('Любовный профиль').setStyle(ButtonStyle.Primary)
        );
      }
      const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];

      let message;
      try {
        const pngBuffer = await renderProfileCard(
          {
            username: targetUser.username,
            avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
            coins: wallet.coins,
            donateCoins: wallet.donateCoins,
            reputation: wallet.reputation || 0,
            duelWins: wallet.duelWins || 0,
            duelLosses: wallet.duelLosses || 0,
            timelyStreak: wallet.timelyStreak || 0,
            messageCount: wallet.messageCount || 0,
            level: wallet.level || 0,
            currentXp,
            neededXp,
            title: null, // TODO: подключить, когда появится система титулов
            partnerUsername,
          },
          interaction.client.logger
        );

        const attachment = new AttachmentBuilder(pngBuffer, { name: 'profile.png' });
        const embed = baseEmbed({ title: null, description: null }).setImage('attachment://profile.png');
        message = await interaction.editReply({ embeds: [embed], files: [attachment], components });
      } catch (canvasErr) {
        // Canvas — необязательный визуальный слой; если рендер по любой причине упал
        // (нет шрифта, проблема с загрузкой аватара и т.д.), профиль всё равно должен
        // ответить — просто обычным текстовым эмбедом вместо картинки.
        interaction.client.logger?.error?.('[/profile] Canvas render failed, falling back to plain embed:', canvasErr);
        const embed = baseEmbed({
          title: targetUser.username,
          description:
            `${DIVIDER}\n` +
            `${COIN_ICON} Монеты: **${wallet.coins.toLocaleString('ru-RU')}**\n` +
            `${DONATE_ICON} Донат-монеты: **${wallet.donateCoins.toLocaleString('ru-RU')}**\n` +
            `Серия /timely: **${wallet.timelyStreak || 0}**\n` +
            `Уровень: **${wallet.level || 0}**\n` +
            `Сообщений: **${(wallet.messageCount || 0).toLocaleString('ru-RU')}**`,
        }).setThumbnail(targetUser.displayAvatarURL());
        message = await interaction.editReply({ embeds: [embed], components });
      }

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

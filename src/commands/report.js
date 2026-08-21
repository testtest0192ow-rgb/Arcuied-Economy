const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const Report = require('../models/Report');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Сообщить о пользователе')
    .addUserOption((opt) => opt.setName('user').setDescription('На кого жалоба').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя пожаловаться на самого себя.')], ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`report:modal:${targetUser.id}`)
      .setTitle(`Жалоба на ${targetUser.username}`.slice(0, 45));

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Причина')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('Подробности')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(detailsInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const targetUserId = interaction.customId.split(':')[2];
    const reason = interaction.fields.getTextInputValue('reason');
    const details = interaction.fields.getTextInputValue('details') || '';

    await interaction.deferReply({ ephemeral: true });

    try {
      const report = await Report.create({
        guildId: interaction.guildId,
        authorId: interaction.user.id,
        targetUserId,
        reason,
        details,
      });

      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: 'Жалоба отправлена',
            description: `${DIVIDER}\nМодераторы получат уведомление и рассмотрят её.`,
            color: config.colors.success,
          }),
        ],
      });

      if (config.reportChannelId) {
        const channel = await interaction.client.channels.fetch(config.reportChannelId).catch(() => null);
        if (channel) {
          await channel
            .send({
              embeds: [
                baseEmbed({
                  title: 'Новая жалоба',
                  description:
                    `${DIVIDER}\n` +
                    `Автор: <@${interaction.user.id}>\n` +
                    `На кого: <@${targetUserId}>\n` +
                    `Причина: **${reason}**\n` +
                    `${details ? `Подробности: ${details}\n` : ''}` +
                    `\n-# ID жалобы: ${report._id}`,
                  color: config.colors.warning,
                }),
              ],
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      interaction.client.logger?.error?.('[/report modal]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

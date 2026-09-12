const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { mogBattleService, NoPendingBattleError } = require('../services/MogBattleService');
const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder().setName('mogcancel').setDescription('Отменить свой ожидающий вызов на Mog Battle'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      await mogBattleService.cancelOwnPending({ guildId: interaction.guildId, challengerId: interaction.user.id });
      const container = new ContainerBuilder().setAccentColor(config.colors.primary);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Mog Battle\n**Вызов отменён**'));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Ваш ожидающий вызов на Mog Battle отменён.'));
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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

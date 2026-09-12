const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { mogBattleService } = require('../services/MogBattleService');
const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

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

      const container = new ContainerBuilder().setAccentColor(config.colors.primary);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Mog Battle\n**${targetUser.username}**`));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Побед: **${wins}**\nПоражений: **${losses}**\nВинрейт: **${winrate}%**`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      interaction.client.logger?.error?.('[/mogstats]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

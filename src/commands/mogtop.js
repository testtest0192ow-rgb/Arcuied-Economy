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

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder().setName('mogtop').setDescription('Топ по победам в Mog Battle'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const top = await mogBattleService.getTop(interaction.guildId, 10);

      const container = new ContainerBuilder().setAccentColor(config.colors.primary);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Mog Battle\n**Топ по победам**'));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

      if (top.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Пока никто не побеждал.'));
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      const lines = await Promise.all(
        top.map(async (w, index) => {
          const user = await interaction.client.users.fetch(w.userId).catch(() => null);
          const place = MEDALS[index] || `**${index + 1}.**`;
          return `${place} ${user ? user.username : w.userId} — **${w.mogWins}** побед (${w.mogLosses} поражений)`;
        })
      );
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      interaction.client.logger?.error?.('[/mogtop]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

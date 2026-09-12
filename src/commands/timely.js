const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { transactionService, TimelyOnCooldownError } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

function formatTimeLeft(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function timelyContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Ежедневная награда\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder().setName('timely').setDescription('Забрать периодическую награду'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const { wallet, reward, streak } = await transactionService.claimTimely({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        cooldownHours: config.timelyCooldownHours,
      });

      const container = timelyContainer({
        heading: 'Награда получена',
        body:
          `Вы получили **${reward}** ${COIN_ICON}\n` +
          `Серия: **${streak}** ${streak === 1 ? 'день' : 'дней'} подряд\n\n` +
          `Текущий баланс: **${wallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `-# Возвращайтесь через ${config.timelyCooldownHours} ч, чтобы не потерять серию.`,
        color: config.colors.success,
      });

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      if (err instanceof TimelyOnCooldownError) {
        const msLeft = err.nextAvailableAt.getTime() - Date.now();
        const container = timelyContainer({
          heading: 'Награда ещё не готова',
          body: `Возвращайтесь через **${formatTimeLeft(msLeft)}**.`,
          color: config.colors.warning,
        });
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
      }
      interaction.client.logger?.error?.('[/timely]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

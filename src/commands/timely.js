const { SlashCommandBuilder } = require('discord.js');
const { transactionService, TimelyOnCooldownError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

function formatTimeLeft(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

module.exports = {
  data: new SlashCommandBuilder().setName('timely').setDescription('Забрать периодическую награду'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const { wallet, reward, streak } = await transactionService.claimTimely({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        cooldownHours: config.timelyCooldownHours,
      });

      const embed = baseEmbed({
        title: 'Награда получена',
        description:
          `${DIVIDER}\n` +
          `Вы получили **${reward}** ${COIN_ICON}\n` +
          `Серия: **${streak}** ${streak === 1 ? 'день' : 'дней'} подряд\n\n` +
          `Текущий баланс: **${wallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `-# Возвращайтесь через ${config.timelyCooldownHours} ч, чтобы не потерять серию.`,
        color: config.colors.success,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof TimelyOnCooldownError) {
        const msLeft = err.nextAvailableAt.getTime() - Date.now();
        const embed = baseEmbed({
          title: 'Награда ещё не готова',
          description: `${DIVIDER}\nВозвращайтесь через **${formatTimeLeft(msLeft)}**.`,
          color: config.colors.warning,
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      interaction.client.logger?.error?.('[/timely]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

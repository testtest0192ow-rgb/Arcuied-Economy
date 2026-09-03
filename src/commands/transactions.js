const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');

const TYPE_LABELS = {
  give_sent: 'Отправлено',
  give_received: 'Получено',
  timely: 'Награда /timely',
  shop_buy: 'Покупка',
  shop_sell: 'Продажа',
  admin_set: 'Изменение (админ)',
  admin_add: 'Начислено (админ)',
  admin_remove: 'Списано (админ)',
  game_win: 'Выигрыш',
  game_loss: 'Проигрыш',
  game_push: 'Ничья (возврат ставки)',
  gift_sent: 'Подарок отправлен',
  gift_received: 'Подарок получен',
};

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

module.exports = {
  data: new SlashCommandBuilder().setName('transactions').setDescription('История ваших операций'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const history = await transactionService.getTransactionHistory(interaction.guildId, interaction.user.id, 10);
      if (history.length === 0) {
        await interaction.editReply({ embeds: [baseEmbed({ title: 'История операций', description: `Пока пусто.` })] });
        return;
      }

      const lines = history.map((t) => {
        const sign = t.amount > 0 ? '+' : '';
        const label = TYPE_LABELS[t.type] || t.type;
        const when = `<t:${Math.floor(new Date(t.createdAt).getTime() / 1000)}:R>`;
        return `**${label}** · ${sign}${t.amount.toLocaleString('ru-RU')} ${icon(t.currency)} · ${when}`;
      });

      await interaction.editReply({
        embeds: [baseEmbed({ title: 'История операций', description: `${lines.join('\n')}\n\n-# Последние 10 операций` })],
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/transactions]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

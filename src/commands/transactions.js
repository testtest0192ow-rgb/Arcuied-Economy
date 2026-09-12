const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

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

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function transactionsContainer(body) {
  const container = new ContainerBuilder().setAccentColor(config.colors.primary);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Личное\n**История операций**'));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder().setName('transactions').setDescription('История ваших операций'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const history = await transactionService.getTransactionHistory(interaction.guildId, interaction.user.id, 10);
      if (history.length === 0) {
        await interaction.editReply({ components: [transactionsContainer('Пока пусто.')], flags: EPHEMERAL_V2 });
        return;
      }

      const lines = history.map((t) => {
        const sign = t.amount > 0 ? '+' : '';
        const label = TYPE_LABELS[t.type] || t.type;
        const when = `<t:${Math.floor(new Date(t.createdAt).getTime() / 1000)}:R>`;
        return `**${label}** · ${sign}${t.amount.toLocaleString('ru-RU')} ${icon(t.currency)} · ${when}`;
      });

      await interaction.editReply({
        components: [transactionsContainer(`${lines.join('\n')}\n\n-# Последние 10 операций`)],
        flags: EPHEMERAL_V2,
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/transactions]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

const { SlashCommandBuilder } = require('discord.js');
const { itemService, ItemNotFoundError } = require('../services/ItemService');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Купить предмет из магазина')
    .addStringOption((opt) => opt.setName('item').setDescription('Ключ предмета из /shop').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('Количество').setRequired(false).setMinValue(1)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const items = await itemService.listShop(interaction.guildId);
    const filtered = items
      .filter((i) => i.key.toLowerCase().includes(focused) || i.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(filtered.map((i) => ({ name: `${i.name} (${i.price} ${i.currency})`, value: i.key })));
  },

  async execute(interaction) {
    const itemKey = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity') || 1;

    await interaction.deferReply({ ephemeral: true });

    try {
      const idempotencyKey = `buy:${interaction.id}`;
      const { wallet, item, totalPrice } = await itemService.buyItem({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        itemKey,
        quantity,
        idempotencyKey,
      });

      const embed = baseEmbed({
        title: 'Покупка совершена',
        description:
          `${DIVIDER}\n` +
          `**${item.name}** × ${quantity}\n` +
          `Списано: **${totalPrice.toLocaleString('ru-RU')}** ${icon(item.currency)}\n\n` +
          `Баланс: **${wallet[item.currency].toLocaleString('ru-RU')}** ${icon(item.currency)}`,
        color: config.colors.success,
      });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ItemNotFoundError) {
        await interaction.editReply({ embeds: [errorEmbed('Такого предмета нет в магазине. Проверьте ключ через /shop.')] });
        return;
      }
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно средств для этой покупки.')] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Эта покупка уже была совершена.')] });
        return;
      }
      interaction.client.logger?.error?.('[/buy]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

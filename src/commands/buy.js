const { SlashCommandBuilder } = require('discord.js');
const { itemService, ItemNotFoundError } = require('../services/ItemService');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { roleAutomationService } = require('../services/RoleAutomationService');
const Item = require('../models/Item');
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
      const itemPreview = await itemService.getItem(interaction.guildId, itemKey);
      if (itemPreview.category === 'role' && quantity !== 1) {
        await interaction.editReply({ embeds: [errorEmbed('Роль можно купить только в одном экземпляре.')] });
        return;
      }
    } catch {
      // Провалимся дальше в общий catch ниже с тем же ItemNotFoundError — не дублируем обработку.
    }

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
          `` +
          `**${item.name}** × ${quantity}\n` +
          `Списано: **${totalPrice.toLocaleString('ru-RU')}** ${icon(item.currency)}\n\n` +
          `Баланс: **${wallet[item.currency].toLocaleString('ru-RU')}** ${icon(item.currency)}`,
        color: config.colors.success,
      });

      // Роль из магазина ролей — выдаём реальную Discord-роль после успешной оплаты.
      if (item.category === 'role') {
        try {
          const role = await roleAutomationService.ensureRole({
            guild: interaction.guild,
            roleId: item.roleId,
            name: item.discordRoleName || item.name,
            color: item.discordRoleColor,
          });
          if (!item.roleId || item.roleId !== role.id) {
            await Item.updateOne({ guildId: interaction.guildId, key: itemKey }, { $set: { roleId: role.id } });
          }
          await interaction.member.roles.add(role);
          embed.data.description += `\n\n✅ Роль ${role} выдана.`;
        } catch (roleErr) {
          interaction.client.logger?.error?.('[/buy role grant]', roleErr);
          embed.data.description += `\n\n⚠️ Монеты списаны, но роль выдать не удалось (не хватает прав у бота или роль выше в иерархии). Обратитесь к администратору сервера.`;
          embed.setColor(config.colors.warning);
        }
      }

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

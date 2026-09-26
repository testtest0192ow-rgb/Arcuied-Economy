const { SlashCommandBuilder } = require('discord.js');
const Shop = require('../models/ShopItem');
const Inventory = require('../models/Inventory');
const ts = require('../services/TransactionService');
const { container, v2 } = require('../utils/ui');
const { money } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Магазин')
    .addSubcommand(s => s.setName('list').setDescription('Показать магазин'))
    .addSubcommand(s => s.setName('buy').setDescription('Купить предмет').addStringOption(o => o.setName('item').setDescription('ID предмета').setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();

    if (sub === 'buy') {
      const id = i.options.getString('item');
      const item = await Shop.findOne({ guildId: i.guildId, itemId: id, active: true }).lean();
      if (!item) return i.reply({ flags: v2(true), components: [container('Магазин', 'Такого предмета нет.', 0xE47A7A)] });
      if (item.stock === 0) return i.reply({ flags: v2(true), components: [container('Магазин', 'Предмет закончился.', 0xE47A7A)] });

      try {
        await ts.applyDelta({
          guildId: i.guildId,
          userId: i.user.id,
          amount: -item.price,
          type: 'shop_purchase',
          idempotencyKey: `shop:${i.id}`,
          meta: { itemId: id }
        });
        await Inventory.findOneAndUpdate(
          { guildId: i.guildId, userId: i.user.id },
          { $setOnInsert: { guildId: i.guildId, userId: i.user.id }, $push: { items: { itemId: item.itemId, name: item.name, quantity: 1 } } },
          { upsert: true }
        );
        if (item.stock > 0) await Shop.updateOne({ _id: item._id, stock: { $gt: 0 } }, { $inc: { stock: -1 } });
        return i.reply({ flags: v2(), components: [container('Покупка выполнена', `**${item.name}**\nСтоимость: **${money(item.price)}** монет`)] });
      } catch (e) {
        return i.reply({ flags: v2(true), components: [container('Магазин', e.message === 'insufficient_funds' ? 'Недостаточно монет.' : 'Не удалось выполнить покупку.', 0xE47A7A)] });
      }
    }

    const items = await Shop.find({ guildId: i.guildId, active: true }).sort({ price: 1 }).limit(20).lean();
    const body = items.length
      ? items.map(x => `**${x.emoji || '•'} ${x.name}** — ${money(x.price)} монет\n-# ID: \`${x.itemId}\` • ${x.description || 'Без описания'}`).join('\n\n')
      : 'Магазин пока пуст. Запусти `npm run seed` для демо-предметов.';

    return i.reply({ flags: v2(), components: [container('Магазин', body)] });
  }
};

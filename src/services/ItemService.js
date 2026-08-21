const mongoose = require('mongoose');
const Item = require('../models/Item');
const InventoryItem = require('../models/InventoryItem');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { InsufficientFundsError, DuplicateActionError } = require('./TransactionService');

class ItemNotFoundError extends Error {
  constructor() {
    super('item_not_found');
    this.name = 'ItemNotFoundError';
  }
}
class NotEnoughItemsError extends Error {
  constructor() {
    super('not_enough_items');
    this.name = 'NotEnoughItemsError';
  }
}
class ItemNotSellableError extends Error {
  constructor() {
    super('item_not_sellable');
    this.name = 'ItemNotSellableError';
  }
}
class ItemNotUsableError extends Error {
  constructor() {
    super('item_not_usable');
    this.name = 'ItemNotUsableError';
  }
}

class ItemService {
  async listShop(guildId, category = null, sort = 'popular') {
    const filter = { guildId, active: true };
    if (category) filter.category = category;

    const sortMap = {
      popular: { timesPurchased: -1 },
      cheap: { price: 1 },
      expensive: { price: -1 },
      new: { createdAt: -1 },
    };

    return Item.find(filter).sort(sortMap[sort] || sortMap.popular).lean();
  }

  async getItem(guildId, key) {
    const item = await Item.findOne({ guildId, key }).lean();
    if (!item || !item.active) throw new ItemNotFoundError();
    return item;
  }

  async getInventory(guildId, userId) {
    return InventoryItem.find({ guildId, userId, quantity: { $gt: 0 } }).sort({ itemKey: 1 }).lean();
  }

  /**
   * Atomic buy: debits the wallet and credits the inventory in one Mongo transaction,
   * with an idempotencyKey so a retried/duplicated interaction never buys twice.
   */
  async buyItem({ guildId, userId, itemKey, quantity, idempotencyKey }) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity должен быть положительным целым');

    const item = await this.getItem(guildId, itemKey);
    const totalPrice = item.price * quantity;

    const session = await mongoose.startSession();
    try {
      let wallet;
      let inventory;

      await session.withTransaction(async () => {
        wallet = await Wallet.findOneAndUpdate(
          { guildId, userId, [item.currency]: { $gte: totalPrice } },
          { $inc: { [item.currency]: -totalPrice } },
          { new: true, session }
        );
        if (!wallet) throw new InsufficientFundsError();

        inventory = await InventoryItem.findOneAndUpdate(
          { guildId, userId, itemKey },
          { $inc: { quantity } },
          { upsert: true, new: true, session }
        );

        // Не влияет на деньги/инвентарь — можно не откатывать при ошибке ниже, это просто счётчик для "Сначала популярные".
        await Item.updateOne({ guildId, key: itemKey }, { $inc: { timesPurchased: quantity } }, { session });

        try {
          await Transaction.create(
            [
              {
                guildId,
                userId,
                type: 'shop_buy',
                currency: item.currency,
                amount: -totalPrice,
                balanceAfter: wallet[item.currency],
                idempotencyKey,
                meta: { itemKey, quantity },
              },
            ],
            { session, ordered: true }
          );
        } catch (err) {
          if (err.code === 11000) throw new DuplicateActionError();
          throw err;
        }
      });

      return { wallet, inventory, item, totalPrice };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Atomic sell: removes from inventory, credits wallet at item.sellRatio of price.
   */
  async sellItem({ guildId, userId, itemKey, quantity, idempotencyKey }) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity должен быть положительным целым');

    const item = await this.getItem(guildId, itemKey);
    if (!item.sellable) throw new ItemNotSellableError();
    const refund = Math.floor(item.price * item.sellRatio * quantity);

    const session = await mongoose.startSession();
    try {
      let wallet;
      let inventory;

      await session.withTransaction(async () => {
        inventory = await InventoryItem.findOneAndUpdate(
          { guildId, userId, itemKey, quantity: { $gte: quantity } },
          { $inc: { quantity: -quantity } },
          { new: true, session }
        );
        if (!inventory) throw new NotEnoughItemsError();

        wallet = await Wallet.findOneAndUpdate(
          { guildId, userId },
          { $inc: { [item.currency]: refund } },
          { new: true, upsert: true, session }
        );

        try {
          await Transaction.create(
            [
              {
                guildId,
                userId,
                type: 'shop_sell',
                currency: item.currency,
                amount: refund,
                balanceAfter: wallet[item.currency],
                idempotencyKey,
                meta: { itemKey, quantity },
              },
            ],
            { session, ordered: true }
          );
        } catch (err) {
          if (err.code === 11000) throw new DuplicateActionError();
          throw err;
        }
      });

      return { wallet, inventory, item, refund };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Atomically consumes one of an item. Actual gameplay effects are applied by the caller
   * (this only guarantees the item can't be used twice for the same click).
   */
  async useItem({ guildId, userId, itemKey }) {
    const item = await this.getItem(guildId, itemKey);
    if (!item.usable) throw new ItemNotUsableError();

    const inventory = await InventoryItem.findOneAndUpdate(
      { guildId, userId, itemKey, quantity: { $gte: 1 } },
      { $inc: { quantity: -1 } },
      { new: true }
    );
    if (!inventory) throw new NotEnoughItemsError();

    return { inventory, item };
  }
}

module.exports = {
  itemService: new ItemService(),
  ItemNotFoundError,
  NotEnoughItemsError,
  ItemNotSellableError,
  ItemNotUsableError,
};

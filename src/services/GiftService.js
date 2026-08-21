const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const Wallet = require('../models/Wallet');
const InventoryItem = require('../models/InventoryItem');
const Transaction = require('../models/Transaction');
const { InsufficientFundsError, DuplicateActionError } = require('./TransactionService');
const { itemService, NotEnoughItemsError } = require('./ItemService');

class GiftNotFoundError extends Error {
  constructor() {
    super('gift_not_found');
    this.name = 'GiftNotFoundError';
  }
}
class GiftAlreadyClaimedError extends Error {
  constructor() {
    super('gift_already_claimed');
    this.name = 'GiftAlreadyClaimedError';
  }
}

class GiftService {
  /**
   * Sends coins as a gift — debits the sender immediately (escrow), creates a pending
   * Gift the recipient must claim with /gifts open.
   */
  async sendCoinGift({ guildId, fromUserId, toUserId, currency, amount, idempotencyKey }) {
    if (fromUserId === toUserId) throw new Error('Нельзя отправить подарок самому себе');
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('amount должен быть положительным целым');

    const session = await mongoose.startSession();
    try {
      let gift;
      await session.withTransaction(async () => {
        const wallet = await Wallet.findOneAndUpdate(
          { guildId, userId: fromUserId, [currency]: { $gte: amount } },
          { $inc: { [currency]: -amount } },
          { new: true, session }
        );
        if (!wallet) throw new InsufficientFundsError();

        const created = await Gift.create(
          [{ guildId, fromUserId, toUserId, kind: 'coins', currency, amount, status: 'pending' }],
          { session }
        );
        gift = created[0];

        try {
          await Transaction.create(
            [
              {
                guildId,
                userId: fromUserId,
                type: 'gift_sent',
                currency,
                amount: -amount,
                balanceAfter: wallet[currency],
                relatedUserId: toUserId,
                idempotencyKey,
                meta: { giftId: String(gift._id) },
              },
            ],
            { session, ordered: true }
          );
        } catch (err) {
          if (err.code === 11000) throw new DuplicateActionError();
          throw err;
        }
      });
      return gift;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Sends an item as a gift — removes it from the sender's inventory immediately.
   */
  async sendItemGift({ guildId, fromUserId, toUserId, itemKey, quantity = 1 }) {
    if (fromUserId === toUserId) throw new Error('Нельзя отправить подарок самому себе');

    const removed = await InventoryItem.findOneAndUpdate(
      { guildId, userId: fromUserId, itemKey, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true }
    );
    if (!removed) throw new NotEnoughItemsError();

    return Gift.create({ guildId, fromUserId, toUserId, kind: 'item', itemKey, quantity, status: 'pending' });
  }

  async listPending(guildId, toUserId) {
    return Gift.find({ guildId, toUserId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  }

  /**
   * Claims a pending gift. Atomic: marks it claimed only if it was still pending,
   * so a duplicate button click can't credit the recipient twice.
   */
  async claimGift({ giftId, userId }) {
    const gift = await Gift.findOneAndUpdate(
      { _id: giftId, toUserId: userId, status: 'pending' },
      { status: 'claimed' },
      { new: true }
    );
    if (!gift) {
      const existing = await Gift.findById(giftId).lean();
      if (!existing) throw new GiftNotFoundError();
      throw new GiftAlreadyClaimedError();
    }

    if (gift.kind === 'coins') {
      const wallet = await Wallet.findOneAndUpdate(
        { guildId: gift.guildId, userId },
        { $inc: { [gift.currency]: gift.amount } },
        { new: true, upsert: true }
      );
      await Transaction.create({
        guildId: gift.guildId,
        userId,
        type: 'gift_received',
        currency: gift.currency,
        amount: gift.amount,
        balanceAfter: wallet[gift.currency],
        relatedUserId: gift.fromUserId,
        idempotencyKey: `gift:${gift._id}:claim`,
        meta: { giftId: String(gift._id) },
      });
      return { gift, wallet };
    }

    // kind === 'item'
    await InventoryItem.findOneAndUpdate(
      { guildId: gift.guildId, userId, itemKey: gift.itemKey },
      { $inc: { quantity: gift.quantity } },
      { upsert: true }
    );
    return { gift };
  }
}

module.exports = { giftService: new GiftService(), GiftNotFoundError, GiftAlreadyClaimedError };

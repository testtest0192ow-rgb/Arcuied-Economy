const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const config = require('../config');

class InsufficientFundsError extends Error {
  constructor() {
    super('insufficient_funds');
    this.name = 'InsufficientFundsError';
  }
}

class DuplicateActionError extends Error {
  constructor() {
    super('duplicate_action');
    this.name = 'DuplicateActionError';
  }
}

class TimelyOnCooldownError extends Error {
  constructor(nextAvailableAt) {
    super('timely_on_cooldown');
    this.name = 'TimelyOnCooldownError';
    this.nextAvailableAt = nextAvailableAt;
  }
}

/**
 * The single choke point for every balance change in the whole platform.
 * Nothing outside this file is allowed to touch wallet.coins / wallet.donateCoins directly.
 */
class TransactionService {
  async getOrCreateWallet(guildId, userId) {
    const wallet = await Wallet.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { guildId, userId, coins: 0, donateCoins: 0 } },
      { upsert: true, new: true }
    );
    return wallet;
  }

  /**
   * Applies a single atomic delta to one wallet's currency and writes the audit record.
   * amount can be positive (credit) or negative (debit).
   * idempotencyKey must be unique per logical action (e.g. `timely:${guildId}:${userId}:${dateKey}`,
   * or `give:${interactionId}`) so a double-click / retry never applies twice.
   */
  async applyDelta({ guildId, userId, currency, amount, type, idempotencyKey, relatedUserId = null, meta = {} }) {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new Error('amount должен быть ненулевым целым числом');
    }
    if (!['coins', 'donateCoins'].includes(currency)) {
      throw new Error('Неизвестная валюта');
    }

    await this.getOrCreateWallet(guildId, userId);

    const filter = { guildId, userId };
    if (amount < 0) {
      // Only allow the debit if the wallet currently has enough funds — avoids race conditions
      // where two concurrent debits could both pass a naive "read balance, then check" check.
      filter[currency] = { $gte: -amount };
    }

    const wallet = await Wallet.findOneAndUpdate(
      filter,
      { $inc: { [currency]: amount } },
      { new: true }
    );

    if (!wallet) {
      throw new InsufficientFundsError();
    }

    try {
      await Transaction.create({
        guildId,
        userId,
        type,
        currency,
        amount,
        balanceAfter: wallet[currency],
        relatedUserId,
        idempotencyKey,
        meta,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Idempotency key already used — this exact action was already applied once.
        // Roll back the delta we just made so we don't double-apply it, then report duplicate.
        await Wallet.updateOne({ guildId, userId }, { $inc: { [currency]: -amount } });
        throw new DuplicateActionError();
      }
      throw err;
    }

    return wallet;
  }

  /**
   * Atomically moves `amount` coins from one user's wallet to another's, or throws.
   * A percentage fee (config.giveFeePercent) is deducted from the transfer and simply
   * removed from the economy (not credited anywhere) — same behavior shown by XIVIVIDE's
   * /give. Sender pays the full `amount`; receiver gets `amount - fee`.
   * Uses a Mongo session transaction so it's all-or-nothing across both documents.
   */
  async transferCoins({ guildId, fromUserId, toUserId, amount, idempotencyKey, meta = {} }) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('amount должен быть положительным целым числом');
    }
    if (fromUserId === toUserId) {
      throw new Error('Нельзя перевести монеты самому себе');
    }

    const fee = Math.floor((amount * config.giveFeePercent) / 100);
    const amountAfterFee = amount - fee;

    await this.getOrCreateWallet(guildId, fromUserId);
    await this.getOrCreateWallet(guildId, toUserId);

    const session = await mongoose.startSession();
    try {
      let resultFrom;
      let resultTo;

      await session.withTransaction(async () => {
        resultFrom = await Wallet.findOneAndUpdate(
          { guildId, userId: fromUserId, coins: { $gte: amount } },
          { $inc: { coins: -amount } },
          { new: true, session }
        );
        if (!resultFrom) {
          throw new InsufficientFundsError();
        }

        resultTo = await Wallet.findOneAndUpdate(
          { guildId, userId: toUserId },
          { $inc: { coins: amountAfterFee } },
          { new: true, session }
        );

        try {
          await Transaction.create(
            [
              {
                guildId,
                userId: fromUserId,
                type: 'give_sent',
                currency: 'coins',
                amount: -amount,
                balanceAfter: resultFrom.coins,
                relatedUserId: toUserId,
                idempotencyKey: `${idempotencyKey}:sent`,
                meta: { ...meta, fee },
              },
              {
                guildId,
                userId: toUserId,
                type: 'give_received',
                currency: 'coins',
                amount: amountAfterFee,
                balanceAfter: resultTo.coins,
                relatedUserId: fromUserId,
                idempotencyKey: `${idempotencyKey}:received`,
                meta: { ...meta, fee },
              },
            ],
            { session, ordered: true }
          );
        } catch (err) {
          if (err.code === 11000) {
            throw new DuplicateActionError();
          }
          throw err;
        }
      });

      return { from: resultFrom, to: resultTo, fee, amountAfterFee };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Atomically claims the /timely reward if the cooldown has passed.
   * Streak logic: claiming again within 2x the cooldown window continues the streak,
   * claiming later than that resets it to 1. Reward = base + min(streak, 10) * bonusPerDay.
   * Returns { wallet, reward, streak } or throws TimelyOnCooldownError.
   */
  async claimTimely({ guildId, userId, cooldownHours, base = 50, bonusPerDay = 5 }) {
    await this.getOrCreateWallet(guildId, userId);

    const now = new Date();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - cooldownMs);

    const current = await Wallet.findOne({ guildId, userId }).lean();
    const withinStreakWindow =
      current.lastTimelyAt && now.getTime() - new Date(current.lastTimelyAt).getTime() <= cooldownMs * 2;
    const nextStreak = withinStreakWindow ? (current.timelyStreak || 0) + 1 : 1;
    const reward = base + Math.min(nextStreak, 10) * bonusPerDay;

    const wallet = await Wallet.findOneAndUpdate(
      {
        guildId,
        userId,
        $or: [{ lastTimelyAt: null }, { lastTimelyAt: { $lte: cutoff } }],
      },
      {
        $inc: { coins: reward },
        $set: { lastTimelyAt: now, timelyStreak: nextStreak },
      },
      { new: true }
    );

    if (!wallet) {
      const doc = await Wallet.findOne({ guildId, userId }).lean();
      const nextAvailableAt = new Date(new Date(doc.lastTimelyAt).getTime() + cooldownMs);
      throw new TimelyOnCooldownError(nextAvailableAt);
    }

    await Transaction.create({
      guildId,
      userId,
      type: 'timely',
      currency: 'coins',
      amount: reward,
      balanceAfter: wallet.coins,
      idempotencyKey: `timely:${guildId}:${userId}:${now.getTime()}`,
      meta: { streak: nextStreak },
    });

    return { wallet, reward, streak: nextStreak };
  }

  async getTransactionHistory(guildId, userId, limit = 10) {
    return Transaction.find({ guildId, userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }
}

module.exports = {
  transactionService: new TransactionService(),
  InsufficientFundsError,
  DuplicateActionError,
  TimelyOnCooldownError,
};

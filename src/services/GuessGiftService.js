const GuessGift = require('../models/GuessGift');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { InsufficientFundsError } = require('./TransactionService');

class RoundNotOpenError extends Error {
  constructor() {
    super('round_not_open');
    this.name = 'RoundNotOpenError';
  }
}
class AlreadyGuessedError extends Error {
  constructor() {
    super('already_guessed');
    this.name = 'AlreadyGuessedError';
  }
}
class CannotGuessOwnGiftError extends Error {
  constructor() {
    super('cannot_guess_own_gift');
    this.name = 'CannotGuessOwnGiftError';
  }
}

class GuessGiftService {
  /** Escrows the amount and creates an open round with a randomly picked winning box (1-3). */
  async hide({ guildId, hiderId, amount }) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('amount должен быть положительным целым');

    const wallet = await Wallet.findOneAndUpdate(
      { guildId, userId: hiderId, coins: { $gte: amount } },
      { $inc: { coins: -amount } },
      { new: true }
    );
    if (!wallet) throw new InsufficientFundsError();

    const winningBox = 1 + Math.floor(Math.random() * 3);

    return GuessGift.create({ guildId, hiderId, amount, winningBox, status: 'open', guessedBy: [] });
  }

  /**
   * Atomic guess: a user can try exactly once per round. Returns { won, gift }.
   * Uses a single conditional findOneAndUpdate so two simultaneous guesses from
   * different users can't both "win" the same round.
   */
  async guess({ guildId, roundId, userId, box }) {
    const round = await GuessGift.findOne({ _id: roundId, guildId }).lean();
    if (!round) throw new RoundNotOpenError();
    if (round.hiderId === userId) throw new CannotGuessOwnGiftError();
    if (round.status !== 'open') throw new RoundNotOpenError();
    if (round.guessedBy.includes(userId)) throw new AlreadyGuessedError();

    if (box === round.winningBox) {
      const updated = await GuessGift.findOneAndUpdate(
        { _id: roundId, guildId, status: 'open' },
        { status: 'won', winnerId: userId, $addToSet: { guessedBy: userId } },
        { new: true }
      );
      if (!updated) throw new RoundNotOpenError();

      const wallet = await Wallet.findOneAndUpdate(
        { guildId, userId },
        { $inc: { coins: updated.amount } },
        { new: true, upsert: true }
      );
      await Transaction.create({
        guildId,
        userId,
        type: 'gift_received',
        currency: 'coins',
        amount: updated.amount,
        balanceAfter: wallet.coins,
        relatedUserId: updated.hiderId,
        idempotencyKey: `guessgift:${updated._id}:win`,
        meta: { roundId: String(updated._id) },
      });

      return { won: true, gift: updated, wallet };
    }

    const updated = await GuessGift.findOneAndUpdate(
      { _id: roundId, guildId, status: 'open', guessedBy: { $ne: userId } },
      { $addToSet: { guessedBy: userId } },
      { new: true }
    );
    if (!updated) throw round.guessedBy.includes(userId) ? new AlreadyGuessedError() : new RoundNotOpenError();

    return { won: false, gift: updated };
  }

  /** Refunds the hider if nobody won before the round expired. Safe to call even if already resolved. */
  async expire({ guildId, roundId }) {
    const round = await GuessGift.findOneAndUpdate(
      { _id: roundId, guildId, status: 'open' },
      { status: 'expired' },
      { new: true }
    );
    if (!round) return null;

    const wallet = await Wallet.findOneAndUpdate(
      { guildId, userId: round.hiderId },
      { $inc: { coins: round.amount } },
      { new: true, upsert: true }
    );
    await Transaction.create({
      guildId,
      userId: round.hiderId,
      type: 'gift_received',
      currency: 'coins',
      amount: round.amount,
      balanceAfter: wallet.coins,
      idempotencyKey: `guessgift:${round._id}:refund`,
      meta: { roundId: String(round._id), reason: 'expired' },
    });

    return { round, wallet };
  }
}

module.exports = {
  guessGiftService: new GuessGiftService(),
  RoundNotOpenError,
  AlreadyGuessedError,
  CannotGuessOwnGiftError,
};

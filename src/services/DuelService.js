const mongoose = require('mongoose');
const Duel = require('../models/Duel');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { gameFairnessService } = require('./GameFairnessService');
const { InsufficientFundsError } = require('./TransactionService');

class DuelNotFoundError extends Error {
  constructor() {
    super('duel_not_found');
    this.name = 'DuelNotFoundError';
  }
}
class DuelNotPendingError extends Error {
  constructor() {
    super('duel_not_pending');
    this.name = 'DuelNotPendingError';
  }
}

class DuelService {
  async createDuel({ guildId, challengerId, opponentId, amount }) {
    if (challengerId === opponentId) throw new Error('Нельзя вызвать на дуэль самого себя');
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('amount должен быть положительным целым');
    return Duel.create({ guildId, challengerId, opponentId, amount, status: 'pending' });
  }

  async declineDuel(duelId) {
    const duel = await Duel.findOneAndUpdate({ _id: duelId, status: 'pending' }, { status: 'declined' }, { new: true });
    if (!duel) throw new DuelNotPendingError();
    return duel;
  }

  async cancelDuel(duelId) {
    const duel = await Duel.findOneAndUpdate({ _id: duelId, status: 'pending' }, { status: 'cancelled' }, { new: true });
    if (!duel) throw new DuelNotPendingError();
    return duel;
  }

  async expireDuel(duelId) {
    return Duel.findOneAndUpdate({ _id: duelId, status: 'pending' }, { status: 'expired' }, { new: true });
  }

  /**
   * Escrows both bets and resolves the duel atomically in one Mongo transaction.
   * If either side can't cover the bet at accept-time, the whole thing rolls back —
   * no coins are lost, the duel is marked cancelled instead.
   */
  async acceptDuel(duelId) {
    const duel = await Duel.findById(duelId);
    if (!duel) throw new DuelNotFoundError();
    if (duel.status !== 'pending') throw new DuelNotPendingError();

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const challengerWallet = await Wallet.findOneAndUpdate(
          { guildId: duel.guildId, userId: duel.challengerId, coins: { $gte: duel.amount } },
          { $inc: { coins: -duel.amount } },
          { new: true, session }
        );
        if (!challengerWallet) throw new InsufficientFundsError();

        const opponentWallet = await Wallet.findOneAndUpdate(
          { guildId: duel.guildId, userId: duel.opponentId, coins: { $gte: duel.amount } },
          { $inc: { coins: -duel.amount } },
          { new: true, session }
        );
        if (!opponentWallet) throw new InsufficientFundsError();

        const { result: coinResult, proofHash } = gameFairnessService.coinflip({
          serverSeed: gameFairnessService.generateServerSeed(),
          clientSeed: `${duel.challengerId}:${duel.opponentId}`,
          nonce: String(duel._id),
        });
        const winnerId = coinResult === 'heads' ? duel.challengerId : duel.opponentId;
        const loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
        const pot = duel.amount * 2;

        const winnerWallet = await Wallet.findOneAndUpdate(
          { guildId: duel.guildId, userId: winnerId },
          { $inc: { coins: pot } },
          { new: true, session }
        );

        await Transaction.create(
          [
            {
              guildId: duel.guildId,
              userId: winnerId,
              type: 'game_win',
              currency: 'coins',
              amount: pot,
              balanceAfter: winnerWallet.coins,
              relatedUserId: loserId,
              idempotencyKey: `duel:${duel._id}:win`,
              meta: { duelId: String(duel._id) },
            },
            {
              guildId: duel.guildId,
              userId: loserId,
              type: 'game_loss',
              currency: 'coins',
              amount: -duel.amount,
              balanceAfter: loserId === duel.challengerId ? challengerWallet.coins : opponentWallet.coins,
              relatedUserId: winnerId,
              idempotencyKey: `duel:${duel._id}:loss`,
              meta: { duelId: String(duel._id) },
            },
          ],
          { session, ordered: true }
        );

        duel.status = 'completed';
        duel.winnerId = winnerId;
        duel.proofHash = proofHash;
        await duel.save({ session });

        result = { duel, winnerId, loserId, pot };
      });
      return result;
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await Duel.updateOne({ _id: duelId }, { status: 'cancelled' });
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async getStats(guildId, userId) {
    const [wins, total] = await Promise.all([
      Duel.countDocuments({ guildId, status: 'completed', winnerId: userId }),
      Duel.countDocuments({ guildId, status: 'completed', $or: [{ challengerId: userId }, { opponentId: userId }] }),
    ]);
    return { wins, losses: total - wins, total };
  }

  async getHistory(guildId, userId, limit = 10) {
    return Duel.find({
      guildId,
      status: 'completed',
      $or: [{ challengerId: userId }, { opponentId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

module.exports = { duelService: new DuelService(), DuelNotFoundError, DuelNotPendingError };

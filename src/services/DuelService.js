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

class DuelAlreadyTakenError extends Error {
  constructor() {
    super('duel_already_taken');
    this.name = 'DuelAlreadyTakenError';
  }
}

class DuelService {
  /** opponentId теперь необязателен — открытый вызов, любой участник может принять первым. */
  async createDuel({ guildId, challengerId, amount, mode = 'coinflip' }) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('amount должен быть положительным целым');
    return Duel.create({ guildId, challengerId, opponentId: null, amount, mode, status: 'pending' });
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
   * Атомарно "занимает" открытую дуэль — первый, кто нажал "Принять", становится
   * opponentId. findOneAndUpdate с условием opponentId:null гарантирует, что при
   * одновременном клике двух людей слот достанется только одному.
   */
  async claimDuel(duelId, accepterId) {
    const duel = await Duel.findOneAndUpdate(
      { _id: duelId, status: 'pending', opponentId: null, challengerId: { $ne: accepterId } },
      { opponentId: accepterId },
      { new: true }
    );
    if (!duel) throw new DuelAlreadyTakenError();
    return duel;
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

        let winnerId, loserId, proofHash, rolls = null;

        if (duel.mode === 'dice') {
          const serverSeed = gameFairnessService.generateServerSeed();
          const rollPair = (side) => {
            const a = gameFairnessService.dice({ serverSeed, clientSeed: `${duel._id}:${side}`, nonce: '1' });
            const b = gameFairnessService.dice({ serverSeed, clientSeed: `${duel._id}:${side}`, nonce: '2' });
            return { values: [a.result, b.result], sum: a.result + b.result, proofHash: a.proofHash };
          };

          let challengerRoll = rollPair('challenger');
          let opponentRoll = rollPair('opponent');
          let attempt = 0;
          // Ничья — честный переброс до победителя (nonce меняется, чтобы не повторить тот же результат).
          while (challengerRoll.sum === opponentRoll.sum && attempt < 5) {
            attempt++;
            challengerRoll = rollPair(`challenger:tie${attempt}`);
            opponentRoll = rollPair(`opponent:tie${attempt}`);
          }

          winnerId = challengerRoll.sum >= opponentRoll.sum ? duel.challengerId : duel.opponentId;
          loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
          proofHash = challengerRoll.proofHash;
          rolls = {
            challenger: challengerRoll.values,
            opponent: opponentRoll.values,
            challengerSum: challengerRoll.sum,
            opponentSum: opponentRoll.sum,
          };
        } else {
          const { result: coinResult, proofHash: coinProof } = gameFairnessService.coinflip({
            serverSeed: gameFairnessService.generateServerSeed(),
            clientSeed: `${duel.challengerId}:${duel.opponentId}`,
            nonce: String(duel._id),
          });
          winnerId = coinResult === 'heads' ? duel.challengerId : duel.opponentId;
          loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
          proofHash = coinProof;
        }

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
        duel.rolls = rolls;
        await duel.save({ session });

        result = { duel, winnerId, loserId, pot, rolls };
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

module.exports = { duelService: new DuelService(), DuelNotFoundError, DuelNotPendingError, DuelAlreadyTakenError };

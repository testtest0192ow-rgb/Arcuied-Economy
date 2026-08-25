const MogBattle = require('../models/MogBattle');
const Wallet = require('../models/Wallet');

class NoPendingBattleError extends Error {
  constructor() {
    super('no_pending_battle');
    this.name = 'NoPendingBattleError';
  }
}

class MogBattleService {
  /**
   * Оценка на реальных, читаемых с Discord-аккаунта метриках — не "магическое
   * число из 10". Каждая строка объясняет, за что именно начислены баллы.
   */
  scoreMember(member, user) {
    const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
    const joinedAgeDays = member ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000) : 0;
    const roleCount = member ? member.roles.cache.size - 1 : 0; // минус @everyone
    const isBoosting = member?.premiumSince ? 1 : 0;
    const hasAvatar = user.avatar ? 1 : 0;

    const breakdown = [
      { label: 'Возраст аккаунта', value: accountAgeDays, unit: 'дней', points: Math.min(accountAgeDays / 30, 10) },
      { label: 'На сервере', value: joinedAgeDays, unit: 'дней', points: Math.min(joinedAgeDays / 15, 10) },
      { label: 'Роли', value: roleCount, unit: 'шт', points: Math.min(roleCount * 1.5, 10) },
      { label: 'Буст сервера', value: isBoosting ? 'да' : 'нет', unit: '', points: isBoosting * 10 },
      { label: 'Свой аватар', value: hasAvatar ? 'да' : 'нет', unit: '', points: hasAvatar * 5 },
    ];

    const total = breakdown.reduce((sum, b) => sum + b.points, 0);
    return { total, breakdown };
  }

  async createChallenge({ guildId, challengerId, opponentId }) {
    return MogBattle.create({ guildId, challengerId, opponentId, status: 'pending' });
  }

  async attachMessage(battleId, { messageId, channelId }) {
    await MogBattle.updateOne({ _id: battleId }, { $set: { messageId, channelId } });
  }

  /** Резолвит батл после принятия — считает очки, обновляет статистику победителя/проигравшего. */
  async resolve({ battleId, challengerScore, opponentScore, winnerId, loserId }) {
    const battle = await MogBattle.findOneAndUpdate(
      { _id: battleId, status: 'pending' },
      { status: 'completed', challengerScore, opponentScore, winnerId },
      { new: true }
    );
    if (!battle) throw new NoPendingBattleError();

    await Wallet.findOneAndUpdate(
      { guildId: battle.guildId, userId: winnerId },
      { $inc: { mogWins: 1 } },
      { upsert: true }
    );
    await Wallet.findOneAndUpdate(
      { guildId: battle.guildId, userId: loserId },
      { $inc: { mogLosses: 1 } },
      { upsert: true }
    );

    return battle;
  }

  async decline(battleId) {
    return MogBattle.findOneAndUpdate({ _id: battleId, status: 'pending' }, { status: 'declined' }, { new: true });
  }

  async expire(battleId) {
    return MogBattle.findOneAndUpdate({ _id: battleId, status: 'pending' }, { status: 'expired' }, { new: true });
  }

  /** /mogcancel — отменяет собственный ожидающий вызов пользователя. */
  async cancelOwnPending({ guildId, challengerId }) {
    const battle = await MogBattle.findOneAndUpdate(
      { guildId, challengerId, status: 'pending' },
      { status: 'cancelled' },
      { new: true, sort: { createdAt: -1 } }
    );
    if (!battle) throw new NoPendingBattleError();
    return battle;
  }

  async getStats(guildId, userId) {
    const wallet = await Wallet.findOne({ guildId, userId }).lean();
    return { wins: wallet?.mogWins || 0, losses: wallet?.mogLosses || 0 };
  }

  async getTop(guildId, limit = 10) {
    return Wallet.find({ guildId, mogWins: { $gt: 0 } }).sort({ mogWins: -1 }).limit(limit).lean();
  }
}

module.exports = { mogBattleService: new MogBattleService(), NoPendingBattleError };

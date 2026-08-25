const BlackjackGame = require('../models/BlackjackGame');
const { transactionService, InsufficientFundsError } = require('./TransactionService');
const { gameFairnessService } = require('./GameFairnessService');

class GameNotActiveError extends Error {
  constructor() {
    super('game_not_active');
    this.name = 'GameNotActiveError';
  }
}

function cardValue(card) {
  const rank = card.slice(0, -1);
  if (rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(rank)) return 10;
  return Number(rank);
}

function handValue(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter((c) => c.startsWith('A')).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

class BlackjackService {
  async startGame({ guildId, userId, bet, channelId }) {
    if (!Number.isInteger(bet) || bet <= 0) throw new Error('bet должен быть положительным целым');

    // Escrow the bet up front — same pattern as /coinflip and /duel.
    await transactionService.applyDelta({
      guildId,
      userId,
      currency: 'coins',
      amount: -bet,
      type: 'game_loss',
      idempotencyKey: `blackjack:start:${guildId}:${userId}:${Date.now()}:${Math.random()}`,
    });

    const serverSeed = gameFairnessService.generateServerSeed();
    const deck = gameFairnessService.shuffledDeck({ serverSeed, clientSeed: userId, nonce: Date.now() });

    const playerHand = [deck[0], deck[1]];
    const dealerHand = [deck[2], deck[3]];
    let cursor = 4;

    const game = await BlackjackGame.create({
      guildId,
      userId,
      bet,
      deck,
      cursor,
      playerHand,
      dealerHand,
      channelId,
      status: 'active',
    });

    if (isBlackjack(playerHand)) {
      return this._resolve(game, 'blackjack');
    }
    return game;
  }

  async hit(gameId) {
    const game = await BlackjackGame.findOne({ _id: gameId, status: 'active' });
    if (!game) throw new GameNotActiveError();

    const card = game.deck[game.cursor];
    // Filtering on the cursor value we just read prevents two concurrent hits (e.g. a
    // double-click) from both succeeding — only the first one still matches this filter.
    const updated = await BlackjackGame.findOneAndUpdate(
      { _id: gameId, status: 'active', cursor: game.cursor },
      { $push: { playerHand: card }, $inc: { cursor: 1 } },
      { new: true }
    );
    if (!updated) throw new GameNotActiveError();

    const value = handValue(updated.playerHand);
    if (value > 21) {
      return this._resolve(updated, 'player_bust');
    }
    return updated;
  }

  async double(gameId) {
    const game = await BlackjackGame.findOne({ _id: gameId, status: 'active' });
    if (!game) throw new GameNotActiveError();
    if (game.playerHand.length !== 2) throw new Error('Удвоить можно только сразу после раздачи');

    await transactionService.applyDelta({
      guildId: game.guildId,
      userId: game.userId,
      currency: 'coins',
      amount: -game.bet,
      type: 'game_loss',
      idempotencyKey: `blackjack:double:${gameId}`,
    });

    const card = game.deck[game.cursor];
    const updated = await BlackjackGame.findOneAndUpdate(
      { _id: gameId, status: 'active', cursor: game.cursor },
      { $push: { playerHand: card }, $inc: { cursor: 1, bet: game.bet }, $set: { doubled: true } },
      { new: true }
    );
    if (!updated) throw new GameNotActiveError();

    const value = handValue(updated.playerHand);
    if (value > 21) {
      return this._resolve(updated, 'player_bust');
    }
    return this._dealerPlay(updated);
  }

  async stand(gameId) {
    const game = await BlackjackGame.findOne({ _id: gameId, status: 'active' });
    if (!game) throw new GameNotActiveError();
    return this._dealerPlay(game);
  }

  async _dealerPlay(game) {
    let dealerHand = [...game.dealerHand];
    let cursor = game.cursor;
    while (handValue(dealerHand) < 17) {
      dealerHand.push(game.deck[cursor]);
      cursor += 1;
    }

    const updated = await BlackjackGame.findOneAndUpdate(
      { _id: game._id, status: 'active' },
      { $set: { dealerHand, cursor } },
      { new: true }
    );
    if (!updated) throw new GameNotActiveError();

    const playerValue = handValue(updated.playerHand);
    const dealerValue = handValue(dealerHand);

    let outcome;
    if (dealerValue > 21) outcome = 'dealer_bust';
    else if (dealerValue > playerValue) outcome = 'dealer_win';
    else if (dealerValue < playerValue) outcome = 'player_win';
    else outcome = 'push';

    return this._resolve(updated, outcome);
  }

  async _resolve(game, outcome) {
    let payout = 0;
    if (outcome === 'blackjack') payout = Math.floor(game.bet * 2.5);
    else if (outcome === 'player_win' || outcome === 'dealer_bust') payout = game.bet * 2;
    else if (outcome === 'push') payout = game.bet;
    // player_bust / dealer_win => payout stays 0, bet already escrowed away

    if (payout > 0) {
      const type = outcome === 'push' ? 'game_push' : payout > game.bet ? 'game_win' : 'game_loss';
      await transactionService.applyDelta({
        guildId: game.guildId,
        userId: game.userId,
        currency: 'coins',
        amount: payout,
        type,
        idempotencyKey: `blackjack:payout:${game._id}`,
      });
    }

    const resolved = await BlackjackGame.findOneAndUpdate({ _id: game._id }, { status: outcome }, { new: true });
    return { game: resolved, outcome, payout };
  }
}

module.exports = { blackjackService: new BlackjackService(), GameNotActiveError, handValue, isBlackjack };

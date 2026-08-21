const crypto = require('crypto');

/**
 * Provably-fair outcome generator. Every game with real money must go through this,
 * not Math.random(). The server commits to a seed via HMAC before the result is used,
 * and reveals serverSeed afterward so the result can be independently recomputed/verified.
 */
class GameFairnessService {
  generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Deterministically derives a float in [0, 1) from serverSeed + clientSeed + nonce.
   * Same inputs always produce the same output — that's what makes it verifiable.
   */
  roll({ serverSeed, clientSeed, nonce }) {
    const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
    // Use the first 13 hex chars (52 bits) as the source of randomness — plenty of precision.
    const int = parseInt(hmac.slice(0, 13), 16);
    const max = Math.pow(16, 13);
    return { value: int / max, proofHash: hmac };
  }

  coinflip({ serverSeed, clientSeed, nonce }) {
    const { value, proofHash } = this.roll({ serverSeed, clientSeed, nonce });
    return { result: value < 0.5 ? 'heads' : 'tails', value, proofHash };
  }

  /** Returns an integer 1-6, provably fair. */
  dice({ serverSeed, clientSeed, nonce }) {
    const { value, proofHash } = this.roll({ serverSeed, clientSeed, nonce });
    return { result: Math.floor(value * 6) + 1, proofHash };
  }

  /**
   * Deterministic Fisher-Yates shuffle of a standard 52-card deck, seeded so the
   * whole deal can be recomputed/verified from serverSeed+clientSeed+nonce.
   */
  shuffledDeck({ serverSeed, clientSeed, nonce }) {
    const suits = ['S', 'H', 'D', 'C'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const s of suits) for (const r of ranks) deck.push(`${r}${s}`);

    for (let i = deck.length - 1; i > 0; i--) {
      const { value } = this.roll({ serverSeed, clientSeed, nonce: `${nonce}:${i}` });
      const j = Math.floor(value * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
}

module.exports = { gameFairnessService: new GameFairnessService() };

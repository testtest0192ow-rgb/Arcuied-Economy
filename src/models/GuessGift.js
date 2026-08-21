const { Schema, model } = require('mongoose');

const guessGiftSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    hiderId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    // Which of the 3 boxes actually holds the coins — never sent to the client until resolved.
    winningBox: { type: Number, required: true, min: 1, max: 3 },
    status: { type: String, enum: ['open', 'won', 'cancelled', 'expired'], default: 'open', index: true },
    winnerId: { type: String, default: null },
    guessedBy: { type: [String], default: [] }, // users who already tried once — one attempt per user
  },
  { timestamps: true }
);

module.exports = model('GuessGift', guessGiftSchema);

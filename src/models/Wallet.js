const { Schema, model } = require('mongoose');

const walletSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    coins: { type: Number, required: true, default: 0, min: 0 },
    donateCoins: { type: Number, required: true, default: 0, min: 0 },
    lastTimelyAt: { type: Date, default: null },
    timelyStreak: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// A user has exactly one wallet per guild.
walletSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Wallet', walletSchema);

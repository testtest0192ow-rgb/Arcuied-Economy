const { Schema, model } = require('mongoose');

const duelSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    challengerId: { type: String, required: true },
    opponentId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled', 'expired', 'completed'],
      default: 'pending',
      index: true,
    },
    winnerId: { type: String, default: null },
    proofHash: { type: String, default: null },
  },
  { timestamps: true }
);

duelSchema.index({ guildId: 1, challengerId: 1, createdAt: -1 });
duelSchema.index({ guildId: 1, opponentId: 1, createdAt: -1 });

module.exports = model('Duel', duelSchema);

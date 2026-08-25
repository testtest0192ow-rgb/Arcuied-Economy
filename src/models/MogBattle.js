const { Schema, model } = require('mongoose');

const mogBattleSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    challengerId: { type: String, required: true },
    opponentId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'declined', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    challengerScore: { type: Number, default: null },
    opponentScore: { type: Number, default: null },
    winnerId: { type: String, default: null },
    // Нужны, чтобы /mogcancel мог найти и отредактировать исходное сообщение с приглашением.
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
  },
  { timestamps: true }
);

mogBattleSchema.index({ guildId: 1, challengerId: 1, status: 1 });

module.exports = model('MogBattle', mogBattleSchema);

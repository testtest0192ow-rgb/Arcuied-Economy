const { Schema, model } = require('mongoose');

const blackjackGameSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    bet: { type: Number, required: true },
    deck: { type: [String], required: true },
    cursor: { type: Number, required: true, default: 0 }, // next undealt card index
    playerHand: { type: [String], required: true },
    dealerHand: { type: [String], required: true },
    doubled: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'player_bust', 'dealer_bust', 'player_win', 'dealer_win', 'push', 'blackjack'],
      default: 'active',
      index: true,
    },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = model('BlackjackGame', blackjackGameSchema);

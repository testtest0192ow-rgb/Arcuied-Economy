const { Schema, model } = require('mongoose');

const transactionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    // give_sent, give_received, timely, admin_set, admin_add, admin_remove, game_win, game_loss ...
    type: { type: String, required: true },
    currency: { type: String, enum: ['coins', 'donateCoins'], required: true },
    amount: { type: Number, required: true }, // positive or negative delta
    balanceAfter: { type: Number, required: true },
    relatedUserId: { type: String, default: null },
    // Prevents the same logical action (e.g. one button click) from being applied twice.
    idempotencyKey: { type: String, required: true, unique: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

transactionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = model('Transaction', transactionSchema);

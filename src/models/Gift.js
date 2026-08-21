const { Schema, model } = require('mongoose');

const giftSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    fromUserId: { type: String, required: true },
    toUserId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['coins', 'item'], required: true },
    currency: { type: String, enum: ['coins', 'donateCoins'], default: 'coins' },
    amount: { type: Number, default: 0 },
    itemKey: { type: String, default: null },
    quantity: { type: Number, default: 1 },
    status: { type: String, enum: ['pending', 'claimed'], default: 'pending', index: true },
  },
  { timestamps: true }
);

module.exports = model('Gift', giftSchema);

const { Schema, model } = require('mongoose');

const itemSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    key: { type: String, required: true }, // stable slug, e.g. "vip_role_ticket"
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['coins', 'donateCoins'], default: 'coins' },
    // косметика, титулы, кейсы, предметы, бустеры, специальные предметы, серверные товары
    category: { type: String, required: true },
    stackable: { type: Boolean, default: true },
    usable: { type: Boolean, default: false },
    sellable: { type: Boolean, default: true },
    sellRatio: { type: Number, default: 0.5 }, // fraction of price returned on /sell
    active: { type: Boolean, default: true },
    timesPurchased: { type: Number, default: 0 }, // used for "Сначала популярные" sort in /shop
  },
  { timestamps: true }
);

itemSchema.index({ guildId: 1, key: 1 }, { unique: true });

module.exports = model('Item', itemSchema);

const { Schema, model } = require('mongoose');

const inventoryItemSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    itemKey: { type: String, required: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ guildId: 1, userId: 1, itemKey: 1 }, { unique: true });

module.exports = model('InventoryItem', inventoryItemSchema);

const { Schema, model } = require('mongoose');

const relationshipSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userAId: { type: String, required: true },
    userBId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'married', 'divorced'], default: 'pending', index: true },
    marriedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

relationshipSchema.index({ guildId: 1, userAId: 1, status: 1 });
relationshipSchema.index({ guildId: 1, userBId: 1, status: 1 });

module.exports = model('Relationship', relationshipSchema);

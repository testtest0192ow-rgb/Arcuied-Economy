const { Schema, model } = require('mongoose');

const reportSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    targetUserId: { type: String, required: true },
    reason: { type: String, required: true },
    details: { type: String, default: '' },
    status: { type: String, enum: ['open', 'claimed', 'closed'], default: 'open', index: true },
    claimedById: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = model('Report', reportSchema);

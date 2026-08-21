const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    actorId: { type: String, required: true }, // who performed the action
    action: { type: String, required: true }, // e.g. "eco.give", "eco.set"
    targetUserId: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ guildId: 1, createdAt: -1 });

module.exports = model('AuditLog', auditLogSchema);

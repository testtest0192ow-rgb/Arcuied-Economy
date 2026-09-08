const { Schema, model } = require('mongoose');

const personalRoleSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true },
    roleId: { type: String, required: true },
    name: { type: String, required: true },
    hidden: { type: Boolean, default: false }, // роль остаётся у владельца, просто снята с него на сервере
  },
  { timestamps: true }
);

personalRoleSchema.index({ guildId: 1, ownerId: 1 }, { unique: true });

module.exports = model('PersonalRole', personalRoleSchema);

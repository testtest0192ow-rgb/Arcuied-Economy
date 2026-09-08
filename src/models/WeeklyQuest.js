const { Schema, model } = require('mongoose');

const weeklyQuestSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    weekKey: { type: String, required: true }, // например "2026-W37" — при смене недели просто заводится новый документ
    messages: { type: Number, default: 0 },
    give: { type: Number, default: 0 },
    activity: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

weeklyQuestSchema.index({ guildId: 1, userId: 1, weekKey: 1 }, { unique: true });

module.exports = model('WeeklyQuest', weeklyQuestSchema);

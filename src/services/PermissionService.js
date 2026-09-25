const { PermissionsBitField } = require('discord.js');
const config = require('../config');

/**
 * MVP permission check: bot owner or a Discord Administrator on the guild.
 * A full Member/Moderator/Admin/Owner/BotOwner tier system (per the master spec)
 * belongs to the shared PermissionService once Core/Moderation bots exist —
 * this is enough to gate the dangerous /eco commands for now.
 */
function isEconomyAdmin(interaction) {
  if (config.botOwnerId && interaction.user.id === config.botOwnerId) return true;
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
}

/**
 * Strict check — TRUE only for config.botOwnerId, unlike isEconomyAdmin which also
 * lets any server Administrator through. Use this for commands that must stay
 * invisible/unusable even to server admins (e.g. manually granting levels).
 */
function isBotOwner(interaction) {
  return Boolean(config.botOwnerId) && interaction.user.id === config.botOwnerId;
}

module.exports = { isEconomyAdmin, isBotOwner };

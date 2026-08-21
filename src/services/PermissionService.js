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

module.exports = { isEconomyAdmin };

/**
 * Shared "role automation" pattern used across the platform (role shop now,
 * mute roles and level-milestone roles later, per the master spec): reuse an
 * existing role if we already have its ID, otherwise create it once and let
 * the caller persist the new ID so it's never created twice.
 */
class RoleAutomationService {
  /**
   * @param {import('discord.js').Guild} guild
   * @param {string|null} roleId - known role ID, if any
   * @param {string} name - used only when creating a new role
   * @param {string|null} color - hex color, used only when creating a new role
   * @returns {Promise<import('discord.js').Role>}
   */
  async ensureRole({ guild, roleId, name, color }) {
    if (roleId) {
      const existing = await guild.roles.fetch(roleId).catch(() => null);
      if (existing) return existing;
      // roleId сохранён, но роль реально удалили с сервера — создаём заново ниже.
    }

    if (!guild.members.me.permissions.has('ManageRoles')) {
      throw new Error('У бота нет права "Управление ролями" — выдай его в настройках сервера.');
    }

    return guild.roles.create({
      name,
      color: color || undefined,
      reason: 'ARCUEID: автосоздание роли (role shop)',
    });
  }
}

module.exports = { roleAutomationService: new RoleAutomationService() };

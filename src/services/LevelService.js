const Wallet = require('../models/Wallet');
const { roleAutomationService } = require('./RoleAutomationService');

// Прогрессивные пороги — не "каждые 10 уровней" плоско, а нарастающий разрыв,
// как договаривались. Меняешь тут — не трогая остальной код.
const LEVEL_ROLE_THRESHOLDS = [
  { level: 10, name: 'Уровень 10+', color: '#22c55e' },
  { level: 30, name: 'Уровень 30+', color: '#3b82f6' },
  { level: 60, name: 'Уровень 60+', color: '#a855f7' },
  { level: 100, name: 'Уровень 100+', color: '#f59e0b' },
];

/** XP, нужный, чтобы дойти С НУЛЯ до конца level'а (т.е. порог для level+1). Растёт нелинейно. */
function xpForLevel(level) {
  return 100 + level * 60 + level * level * 5;
}

/** level, соответствующий текущему totalXp. */
function levelForXp(totalXp) {
  let level = 0;
  while (totalXp >= xpForLevel(level)) {
    totalXp -= xpForLevel(level);
    level++;
  }
  return level;
}

/** Суммарный XP, нужный, чтобы ДОЙТИ ровно до начала указанного level'а (с нуля). */
function xpAtLevelStart(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

class LevelService {
  /**
   * Начисляет XP и, если это подняло уровень, выдаёт/меняет роль по прогрессивным
   * порогам (только САМАЯ старшая полагающаяся роль остаётся — предыдущие тиры
   * снимаются, чтобы не копился список из всех пройденных уровней разом).
   * Возвращает { wallet, leveledUp, oldLevel, newLevel } — caller решает, слать ли
   * уведомление о новом уровне.
   */
  async addXp({ guild, userId, amount }) {
    const guildId = guild.id;
    const before = await Wallet.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { guildId, userId } },
      { upsert: true, new: true }
    );
    const oldLevel = before.level || 0;

    const after = await Wallet.findOneAndUpdate(
      { guildId, userId },
      { $inc: { xp: amount } },
      { new: true }
    );

    const newLevel = levelForXp(after.xp);
    if (newLevel === oldLevel) {
      return { wallet: after, leveledUp: false, oldLevel, newLevel };
    }

    after.level = newLevel;
    await after.save();

    await this._syncLevelRole(guild, userId, newLevel).catch((err) => {
      guild.client.logger?.error?.('[LevelService] Не удалось синхронизировать роль по уровню', err);
    });

    return { wallet: after, leveledUp: true, oldLevel, newLevel };
  }

  /**
   * Владельческая команда: жёстко выставляет уровень пользователю (XP переносится
   * к началу этого уровня — прогресс внутри уровня сбрасывается в 0, чтобы прогресс-бар
   * на /profile не показывал нечестные значения). Синхронизирует роль-порог, как addXp.
   * Возвращает { wallet, oldLevel, newLevel }.
   */
  async setLevel({ guild, userId, level }) {
    if (!Number.isInteger(level) || level < 0) {
      throw new RangeError('level должен быть целым числом >= 0');
    }
    const guildId = guild.id;
    const before = await Wallet.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { guildId, userId } },
      { upsert: true, new: true }
    );
    const oldLevel = before.level || 0;

    const targetXp = xpAtLevelStart(level);
    const after = await Wallet.findOneAndUpdate(
      { guildId, userId },
      { $set: { xp: targetXp, level } },
      { new: true }
    );

    await this._syncLevelRole(guild, userId, level).catch((err) => {
      guild.client.logger?.error?.('[LevelService] Не удалось синхронизировать роль по уровню', err);
    });

    return { wallet: after, oldLevel, newLevel: level };
  }

  /** Держит только одну (самую старшую положенную) роль-порог на участнике. */
  async _syncLevelRole(guild, userId, level) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const eligible = [...LEVEL_ROLE_THRESHOLDS].reverse().find((t) => level >= t.level);
    const allTierRoles = [];
    for (const tier of LEVEL_ROLE_THRESHOLDS) {
      const role = await roleAutomationService.ensureRole({ guild, roleId: null, name: tier.name, color: tier.color });
      allTierRoles.push({ tier, role });
    }

    for (const { tier, role } of allTierRoles) {
      const shouldHave = eligible && tier.level === eligible.level;
      const has = member.roles.cache.has(role.id);
      if (shouldHave && !has) await member.roles.add(role);
      if (!shouldHave && has) await member.roles.remove(role);
    }
  }

  xpForLevel(level) {
    return xpForLevel(level);
  }

  /** XP, накопленный ВНУТРИ текущего уровня (для прогресс-бара), и сколько нужно всего на этом уровне. */
  progressWithinLevel(totalXp) {
    let level = 0;
    let remaining = totalXp;
    while (remaining >= xpForLevel(level)) {
      remaining -= xpForLevel(level);
      level++;
    }
    return { level, currentXp: remaining, neededXp: xpForLevel(level) };
  }
}

module.exports = { levelService: new LevelService(), LEVEL_ROLE_THRESHOLDS };

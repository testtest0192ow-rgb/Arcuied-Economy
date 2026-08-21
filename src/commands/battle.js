const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');
const config = require('../config');

// Каждый пункт — реально читаемая с Discord-аккаунта метрика, с понятной единицей.
// Не "магическое число из 10" — каждая строка объясняет, за что именно баллы.
function scoreMember(member, user) {
  const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const joinedAgeDays = member ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000) : 0;
  const roleCount = member ? member.roles.cache.size - 1 : 0; // минус @everyone
  const isBoosting = member?.premiumSince ? 1 : 0;
  const hasAvatar = user.avatar ? 1 : 0;

  const breakdown = [
    { label: 'Возраст аккаунта', value: accountAgeDays, unit: 'дней', points: Math.min(accountAgeDays / 30, 10) },
    { label: 'На сервере', value: joinedAgeDays, unit: 'дней', points: Math.min(joinedAgeDays / 15, 10) },
    { label: 'Роли', value: roleCount, unit: 'шт', points: Math.min(roleCount * 1.5, 10) },
    { label: 'Буст сервера', value: isBoosting ? 'да' : 'нет', unit: '', points: isBoosting * 10 },
    { label: 'Свой аватар', value: hasAvatar ? 'да' : 'нет', unit: '', points: hasAvatar * 5 },
  ];

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { total, breakdown };
}

function fmtLine(b) {
  return `${b.label}: **${b.value}${b.unit ? ' ' + b.unit : ''}** (+${b.points.toFixed(1)})`;
}

const COMMENTS_CLOSE = ['Разница минимальная — это была настоящая борьба.', 'Победа буквально на волоске.'];
const COMMENTS_CLEAR = ['Уверенная победа по всем статьям.', 'Явное превосходство — тут и спорить не о чем.'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Сравнить профиль с другим участником')
    .addUserOption((opt) => opt.setName('user').setDescription('С кем сравнить').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя сравнить профиль с самим собой.')], ephemeral: true });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Ботов сравнивать нечестно.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const [memberA, memberB] = await Promise.all([
        interaction.guild.members.fetch(interaction.user.id).catch(() => null),
        interaction.guild.members.fetch(targetUser.id).catch(() => null),
      ]);

      const scoreA = scoreMember(memberA, interaction.user);
      const scoreB = scoreMember(memberB, targetUser);

      const winner = scoreA.total >= scoreB.total ? interaction.user : targetUser;
      const winnerScore = Math.max(scoreA.total, scoreB.total);
      const loserScore = Math.min(scoreA.total, scoreB.total);
      const diff = winnerScore - loserScore;

      // Небольшая вариативность комментария — не один и тот же текст у всех.
      const pool = diff < winnerScore * 0.15 ? COMMENTS_CLOSE : COMMENTS_CLEAR;
      const comment = pool[crypto.randomInt(pool.length)];

      const embed = baseEmbed({
        title: 'Сравнение профилей',
        description:
          `${DIVIDER}\n` +
          `**${interaction.user.username}** — ${scoreA.total.toFixed(1)} очков\n` +
          scoreA.breakdown.map(fmtLine).join('\n') +
          `\n\n**${targetUser.username}** — ${scoreB.total.toFixed(1)} очков\n` +
          scoreB.breakdown.map(fmtLine).join('\n') +
          `\n\n🏆 Побеждает ${winner} — ${winnerScore.toFixed(1)} : ${loserScore.toFixed(1)}\n-# ${comment}`,
        color: config.colors.success,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      interaction.client.logger?.error?.('[/battle]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

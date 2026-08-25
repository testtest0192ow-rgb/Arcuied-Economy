const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const crypto = require('crypto');
const { mogBattleService } = require('../services/MogBattleService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');
const config = require('../config');

function fmtLine(b) {
  return `${b.label}: **${b.value}${b.unit ? ' ' + b.unit : ''}** (+${b.points.toFixed(1)})`;
}

const COMMENTS_CLOSE = ['Разница минимальная — это была настоящая борьба.', 'Победа буквально на волоске.'];
const COMMENTS_CLEAR = ['Уверенная победа по всем статьям.', 'Явное превосходство — тут и спорить не о чем.'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Вызвать на сравнение профиля (Mog Battle)')
    .addUserOption((opt) => opt.setName('user').setDescription('С кем сравнить').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя вызвать самого себя.')], ephemeral: true });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Ботов вызывать нечестно.')], ephemeral: true });
      return;
    }

    const battle = await mogBattleService.createChallenge({
      guildId: interaction.guildId,
      challengerId: interaction.user.id,
      opponentId: targetUser.id,
    });

    const inviteEmbed = baseEmbed({
      title: 'Вызов на сравнение профилей',
      description: `${DIVIDER}\n${interaction.user} вызывает ${targetUser} на Mog Battle!`,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`battle:accept:${battle._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`battle:decline:${battle._id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`battle:cancel:${battle._id}`).setLabel('Отменить').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({ content: `${targetUser}`, embeds: [inviteEmbed], components: [row], fetchReply: true });
    await mogBattleService.attachMessage(battle._id, { messageId: message.id, channelId: message.channelId });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: (i) => i.user.id === targetUser.id || (i.user.id === interaction.user.id && i.customId.includes(':cancel:')),
      });
    } catch {
      await mogBattleService.expire(battle._id);
      await interaction.editReply({ content: null, embeds: [baseEmbed({ title: 'Время истекло', description: `${DIVIDER}\nВызов не был принят вовремя.` })], components: [] });
      return;
    }

    if (choice.customId.includes(':cancel:')) {
      await mogBattleService.cancelOwnPending({ guildId: interaction.guildId, challengerId: interaction.user.id });
      await choice.update({ content: null, embeds: [baseEmbed({ title: 'Отменено', description: `${DIVIDER}\nВызов отменён.` })], components: [] });
      return;
    }

    if (choice.customId.includes(':decline:')) {
      await mogBattleService.decline(battle._id);
      await choice.update({ content: null, embeds: [baseEmbed({ title: 'Отклонено', description: `${DIVIDER}\n${targetUser} отклонил(а) вызов.` })], components: [] });
      return;
    }

    // action === accept
    await choice.update({ content: null, components: [] });

    try {
      const [memberA, memberB] = await Promise.all([
        interaction.guild.members.fetch(interaction.user.id).catch(() => null),
        interaction.guild.members.fetch(targetUser.id).catch(() => null),
      ]);

      const scoreA = mogBattleService.scoreMember(memberA, interaction.user);
      const scoreB = mogBattleService.scoreMember(memberB, targetUser);

      const winnerUser = scoreA.total >= scoreB.total ? interaction.user : targetUser;
      const loserUser = winnerUser.id === interaction.user.id ? targetUser : interaction.user;
      const winnerScore = Math.max(scoreA.total, scoreB.total);
      const loserScore = Math.min(scoreA.total, scoreB.total);
      const diff = winnerScore - loserScore;

      const pool = diff < winnerScore * 0.15 ? COMMENTS_CLOSE : COMMENTS_CLEAR;
      const comment = pool[crypto.randomInt(pool.length)];

      await mogBattleService.resolve({
        battleId: battle._id,
        challengerScore: scoreA.total,
        opponentScore: scoreB.total,
        winnerId: winnerUser.id,
        loserId: loserUser.id,
      });

      const resultEmbed = baseEmbed({
        title: 'Результат Mog Battle',
        description:
          `${DIVIDER}\n` +
          `**${interaction.user.username}** — ${scoreA.total.toFixed(1)} очков\n` +
          scoreA.breakdown.map(fmtLine).join('\n') +
          `\n\n**${targetUser.username}** — ${scoreB.total.toFixed(1)} очков\n` +
          scoreB.breakdown.map(fmtLine).join('\n') +
          `\n\n🏆 Побеждает ${winnerUser} — ${winnerScore.toFixed(1)} : ${loserScore.toFixed(1)}\n-# ${comment}`,
        color: config.colors.success,
      });

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
    } catch (err) {
      interaction.client.logger?.error?.('[/battle]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

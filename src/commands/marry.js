const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const {
  relationshipService,
  AlreadyMarriedError,
  ProposalNotFoundError,
  NotMarriedError,
} = require('../services/RelationshipService');
const { baseEmbed, errorEmbed, attachDivider } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marry')
    .setDescription('Предложить брак или посмотреть отношения')
    .addUserOption((opt) => opt.setName('user').setDescription('Кому сделать предложение').setRequired(false))
    .addBooleanOption((opt) => opt.setName('divorce').setDescription('Развестись').setRequired(false)),

  async execute(interaction) {
    const divorce = interaction.options.getBoolean('divorce');
    const targetUser = interaction.options.getUser('user');

    if (divorce) {
      await interaction.deferReply();
      try {
        await relationshipService.divorce({ guildId: interaction.guildId, userId: interaction.user.id });
        const embed = baseEmbed({ title: 'Развод оформлен', description: 'Вы больше не в браке.' });
        const divider = attachDivider(embed);
        await interaction.editReply({ embeds: [embed], files: [divider] });
      } catch (err) {
        if (err instanceof NotMarriedError) {
          await interaction.editReply({ embeds: [errorEmbed('Вы не состоите в браке.')] });
          return;
        }
        interaction.client.logger?.error?.('[/marry divorce]', err);
        await interaction.editReply({ embeds: [errorEmbed()] });
      }
      return;
    }

    if (!targetUser) {
      await interaction.deferReply();
      const marriage = await relationshipService.getActiveMarriage(interaction.guildId, interaction.user.id);
      if (!marriage) {
        const embed = baseEmbed({ title: 'Отношения', description: 'Вы не состоите в браке. Сделайте предложение через `/marry user:@кто-то`.' });
        const divider = attachDivider(embed);
        await interaction.editReply({ embeds: [embed], files: [divider] });
        return;
      }
      const partnerId = marriage.userAId === interaction.user.id ? marriage.userBId : marriage.userAId;
      const embed = baseEmbed({ title: 'Отношения', description: `В браке с <@${partnerId}> с <t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:D>.` });
      const divider = attachDivider(embed);
      await interaction.editReply({ embeds: [embed], files: [divider] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя сделать предложение самому себе.')], ephemeral: true });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя сделать предложение боту.')], ephemeral: true });
      return;
    }
    try {
      const proposal = await relationshipService.propose({
        guildId: interaction.guildId,
        userAId: interaction.user.id,
        userBId: targetUser.id,
      });
      const embed = baseEmbed({
        title: 'Предложение руки и сердца',
        description: `${interaction.user} делает предложение ${targetUser}!`,
      });
      const divider = attachDivider(embed);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`marry:accept:${proposal._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`marry:decline:${proposal._id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
      );

      const message = await interaction.reply({ content: `${targetUser}`, embeds: [embed], components: [row], files: [divider], fetchReply: true });
      let choice;
      try {
        choice = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 60_000,
          filter: (i) => i.user.id === targetUser.id,
        });
      } catch {
        await interaction.editReply({ content: null, embeds: [baseEmbed({ title: 'Время истекло', description: 'Предложение не было принято вовремя.' })], components: [] });
        return;
      }

      if (choice.customId.startsWith('marry:decline')) {
        await choice.update({ content: null, embeds: [baseEmbed({ title: 'Отклонено', description: `${targetUser} отклонил(а) предложение.` })], components: [] });
        return;
      }

      try {
        await relationshipService.accept({ relationshipId: proposal._id, userId: targetUser.id });
        await choice.update({
          content: null,
          embeds: [baseEmbed({ title: 'Поздравляем!', description: `${interaction.user} и ${targetUser} теперь в браке. 💍`, color: config.colors.success })],
          components: [],
        });
      } catch (err) {
        if (err instanceof AlreadyMarriedError) {
          await choice.update({ embeds: [errorEmbed('Один из вас уже успел вступить в брак с кем-то другим.')], components: [] });
          return;
        }
        throw err;
      }
    } catch (err) {
      if (err instanceof AlreadyMarriedError) {
        await interaction.reply({ embeds: [errorEmbed('Один из вас уже состоит в браке.')], ephemeral: true });
        return;
      }
      interaction.client.logger?.error?.('[/marry]', err);
      await interaction.reply({ embeds: [errorEmbed()], ephemeral: true });
    }
  },
};

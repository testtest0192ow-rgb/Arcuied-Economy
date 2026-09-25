const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { appEmoji } = require('../utils/appEmoji');
const {
  relationshipService,
  AlreadyMarriedError,
  NotMarriedError,
} = require('../services/RelationshipService');
const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

function marryContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${appEmoji('ring')}Отношения\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

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
        await interaction.editReply({
          components: [marryContainer({ heading: 'Развод оформлен', body: 'Вы больше не в браке.' })],
          flags: MessageFlags.IsComponentsV2,
        });
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
        await interaction.editReply({
          components: [marryContainer({ heading: 'Отношения', body: 'Вы не состоите в браке. Сделайте предложение через `/marry user:@кто-то`.' })],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }
      const partnerId = marriage.userAId === interaction.user.id ? marriage.userBId : marriage.userAId;
      await interaction.editReply({
        components: [marryContainer({ heading: 'Отношения', body: `В браке с <@${partnerId}> с <t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:D>.` })],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя сделать предложение самому себе.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя сделать предложение боту.')], flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      const proposal = await relationshipService.propose({
        guildId: interaction.guildId,
        userAId: interaction.user.id,
        userBId: targetUser.id,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`marry:accept:${proposal._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`marry:decline:${proposal._id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
      );

      const inviteContainer = marryContainer({
        heading: 'Предложение руки и сердца',
        body: `${targetUser}\n${interaction.user} делает предложение ${targetUser}!`,
      });

      await interaction.reply({ components: [inviteContainer, row], flags: MessageFlags.IsComponentsV2 });
      const message = await interaction.fetchReply();
      let choice;
      try {
        choice = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 60_000,
          filter: (i) => i.user.id === targetUser.id,
        });
      } catch {
        await interaction.editReply({
          components: [marryContainer({ heading: 'Время истекло', body: 'Предложение не было принято вовремя.', color: config.colors.danger })],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (choice.customId.startsWith('marry:decline')) {
        await choice.update({
          components: [marryContainer({ heading: 'Отклонено', body: `${targetUser} отклонил(а) предложение.`, color: config.colors.danger })],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      try {
        await relationshipService.accept({ relationshipId: proposal._id, userId: targetUser.id });
        await choice.update({
          components: [marryContainer({ heading: 'Поздравляем!', body: `${interaction.user} и ${targetUser} теперь в браке. 💍`, color: config.colors.success })],
          flags: MessageFlags.IsComponentsV2,
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
        await interaction.reply({ embeds: [errorEmbed('Один из вас уже состоит в браке.')], flags: MessageFlags.Ephemeral });
        return;
      }
      interaction.client.logger?.error?.('[/marry]', err);
      await interaction.reply({ embeds: [errorEmbed()], flags: MessageFlags.Ephemeral });
    }
  },
};

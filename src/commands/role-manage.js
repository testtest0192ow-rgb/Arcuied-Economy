const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const PersonalRole = require('../models/PersonalRole');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const RENAME_PRICE = 1500;

function roleContainer({ heading, body, color = config.colors.success }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Личная роль\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-manage')
    .setDescription('Управление своей личной ролью')
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription(`Переименовать свою роль за ${RENAME_PRICE} монет`)
        .addStringOption((opt) => opt.setName('название').setDescription('Новое название').setRequired(true).setMaxLength(100))
    )
    .addSubcommand((sub) => sub.setName('hide').setDescription('Скрыть/показать свою личную роль (бесплатно)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    const personalRole = await PersonalRole.findOne({ guildId: interaction.guildId, ownerId: interaction.user.id });
    if (!personalRole) {
      await interaction.editReply({ embeds: [errorEmbed('У вас ещё нет личной роли. Создайте её через /role-create.')] });
      return;
    }

    const role = await interaction.guild.roles.fetch(personalRole.roleId).catch(() => null);
    if (!role) {
      await interaction.editReply({ embeds: [errorEmbed('Ваша роль была удалена с сервера напрямую — создайте новую через /role-create.')] });
      return;
    }

    if (sub === 'rename') {
      const newName = interaction.options.getString('название');
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
      if (wallet.coins < RENAME_PRICE) {
        await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет. Нужно **${RENAME_PRICE.toLocaleString('ru-RU')}** ${COIN_ICON}, у вас **${wallet.coins.toLocaleString('ru-RU')}**.`)] });
        return;
      }

      try {
        await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          currency: 'coins',
          amount: -RENAME_PRICE,
          type: 'role_rename',
          idempotencyKey: `role-rename:${interaction.id}`,
        });

        await role.setName(newName, 'ARCUEID: переименование личной роли владельцем');
        personalRole.name = newName;
        await personalRole.save();

        await interaction.editReply({
          components: [roleContainer({ heading: 'Роль переименована', body: `Теперь ваша роль называется ${role}.\nСписано: **${RENAME_PRICE.toLocaleString('ru-RU')}** ${COIN_ICON}` })],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет на момент списания.')] });
          return;
        }
        if (err instanceof DuplicateActionError) {
          await interaction.editReply({ embeds: [errorEmbed('Это переименование уже было обработано.')] });
          return;
        }
        interaction.client.logger?.error?.('[/role-manage rename]', err);
        await interaction.editReply({ embeds: [errorEmbed()] });
      }
    }

    if (sub === 'hide') {
      try {
        if (personalRole.hidden) {
          await interaction.member.roles.add(role);
          personalRole.hidden = false;
          await personalRole.save();
          await interaction.editReply({
            components: [roleContainer({ heading: 'Роль снова видна', body: `${role} возвращена вам.` })],
            flags: MessageFlags.IsComponentsV2,
          });
        } else {
          await interaction.member.roles.remove(role);
          personalRole.hidden = true;
          await personalRole.save();
          await interaction.editReply({
            components: [roleContainer({ heading: 'Роль скрыта', body: `${role} снята с вас, но остаётся вашей. Верните её через /role-manage hide ещё раз.`, color: config.colors.warning })],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch (err) {
        interaction.client.logger?.error?.('[/role-manage hide]', err);
        await interaction.editReply({ embeds: [errorEmbed()] });
      }
    }
  },
};

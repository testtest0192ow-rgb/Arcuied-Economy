const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const PersonalRole = require('../models/PersonalRole');
const { roleAutomationService } = require('../services/RoleAutomationService');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const PRICE = 3000;
const REQUIRED_LEVEL = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-create')
    .setDescription(`Создать свою личную роль за ${PRICE} монет`)
    .addStringOption((opt) => opt.setName('название').setDescription('Название роли').setRequired(true).setMaxLength(100)),

  async execute(interaction) {
    const name = interaction.options.getString('название');
    await interaction.deferReply();

    const existing = await PersonalRole.findOne({ guildId: interaction.guildId, ownerId: interaction.user.id });
    if (existing) {
      await interaction.editReply({ embeds: [errorEmbed(`У вас уже есть личная роль — <@&${existing.roleId}>. Используйте /role-manage, чтобы её изменить.`)] });
      return;
    }

    const wallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if ((wallet.level || 0) < REQUIRED_LEVEL) {
      await interaction.editReply({ embeds: [errorEmbed(`Личная роль доступна с **${REQUIRED_LEVEL}** уровня. Ваш текущий уровень: **${wallet.level || 0}**.`)] });
      return;
    }
    if (wallet.coins < PRICE) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет. Нужно **${PRICE.toLocaleString('ru-RU')}** ${COIN_ICON}, у вас **${wallet.coins.toLocaleString('ru-RU')}**.`)] });
      return;
    }

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.editReply({ embeds: [errorEmbed('У бота нет права "Управление ролями" на этом сервере — выдайте его в настройках.')] });
      return;
    }

    try {
      await transactionService.applyDelta({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        currency: 'coins',
        amount: -PRICE,
        type: 'role_create',
        idempotencyKey: `role-create:${interaction.id}`,
      });

      const role = await roleAutomationService.ensureRole({ guild: interaction.guild, roleId: null, name, color: null });
      await interaction.member.roles.add(role);
      await PersonalRole.create({ guildId: interaction.guildId, ownerId: interaction.user.id, roleId: role.id, name });

      await interaction.editReply({
        components: [(() => {
          const container = new ContainerBuilder().setAccentColor(config.colors.success);
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Личная роль\n**Роль создана**'));
          container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Ваша личная роль ${role} готова.\nСписано: **${PRICE.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n-# Изменить название можно через /role-manage за отдельную плату.`
          ));
          return container;
        })()],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет на момент списания.')] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Эта покупка уже была обработана.')] });
        return;
      }
      interaction.client.logger?.error?.('[/role-create]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

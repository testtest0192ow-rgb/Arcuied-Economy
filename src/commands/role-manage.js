const { SlashCommandBuilder } = require('discord.js');
const PersonalRole = require('../models/PersonalRole');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');

const RENAME_PRICE = 1500;

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
          embeds: [baseEmbed({
            title: 'Роль переименована',
            description: `${DIVIDER}\nТеперь ваша роль называется ${role}.\nСписано: **${RENAME_PRICE.toLocaleString('ru-RU')}** ${COIN_ICON}`,
          })],
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
          // Была скрыта — возвращаем роль на участника.
          await interaction.member.roles.add(role);
          personalRole.hidden = false;
          await personalRole.save();
          await interaction.editReply({
            embeds: [baseEmbed({ title: 'Роль снова видна', description: `${DIVIDER}\n${role} возвращена вам.` })],
          });
        } else {
          // Снимаем роль с участника, но запись владения сохраняется — можно вернуть в любой момент.
          await interaction.member.roles.remove(role);
          personalRole.hidden = true;
          await personalRole.save();
          await interaction.editReply({
            embeds: [baseEmbed({ title: 'Роль скрыта', description: `${DIVIDER}\n${role} снята с вас, но остаётся вашей. Верните её через /role-manage hide ещё раз.` })],
          });
        }
      } catch (err) {
        interaction.client.logger?.error?.('[/role-manage hide]', err);
        await interaction.editReply({ embeds: [errorEmbed()] });
      }
    }
  },
};

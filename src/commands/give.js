const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { questService } = require('../services/QuestService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Передать монеты другому участнику')
    .addUserOption((opt) => opt.setName('user').setDescription('Кому передать').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Сколько монет').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя передать монеты самому себе.')], ephemeral: true });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя передать монеты боту.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const senderWallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (senderWallet.coins < amount) {
      await interaction.editReply({
        embeds: [errorEmbed(`Недостаточно монет. Ваш баланс: **${senderWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)],
      });
      return;
    }

    const fee = Math.floor((amount * config.giveFeePercent) / 100);
    const willArrive = amount - fee;
    const confirmEmbed = baseEmbed({
      title: 'Подтвердите передачу',
      description:
        `${DIVIDER}\n` +
        `Отправить **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} пользователю ${targetUser}?\n` +
        `-# Комиссия ${config.giveFeePercent}%: **${fee.toLocaleString('ru-RU')}** ${COIN_ICON} · получит **${willArrive.toLocaleString('ru-RU')}** ${COIN_ICON}`,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('give:confirm').setLabel('Подтвердить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('give:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.user.id === interaction.user.id,
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Время подтверждения истекло.')], components: [] });
      return;
    }

    if (choice.customId === 'give:cancel') {
      await choice.update({ embeds: [baseEmbed({ title: 'Отменено', description: `${DIVIDER}\nПередача не выполнена.` })], components: [] });
      return;
    }

    // Disable buttons immediately so a second click on "Подтвердить" can't fire a second transfer.
    await choice.update({ components: [] });

    try {
      const idempotencyKey = `give:${interaction.id}`;
      const { from, fee: appliedFee, amountAfterFee } = await transactionService.transferCoins({
        guildId: interaction.guildId,
        fromUserId: interaction.user.id,
        toUserId: targetUser.id,
        amount,
        idempotencyKey,
      });

      await questService.increment(interaction.guild, interaction.user.id, 'give', 1).catch(() => {});

      const successEmbed = baseEmbed({
        title: 'Монеты переданы',
        description:
          `${DIVIDER}\n` +
          `Получатель: ${targetUser}\n` +
          `Сумма: **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `Комиссия: **${appliedFee.toLocaleString('ru-RU')}** ${COIN_ICON} · получено: **${amountAfterFee.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n` +
          `Ваш баланс: **${from.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`,
        color: config.colors.success,
      });
      await interaction.editReply({ embeds: [successEmbed], components: [] });

      targetUser
        .send({
          embeds: [
            baseEmbed({
              title: 'Вам передали монеты',
              description: `${DIVIDER}\nОт: ${interaction.user}\nСумма: **${amountAfterFee.toLocaleString('ru-RU')}** ${COIN_ICON} (после комиссии ${config.giveFeePercent}%)`,
              color: config.colors.success,
            }),
          ],
        })
        .catch(() => {}); // Recipient may have DMs closed — not a failure of the transfer itself.
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет на момент подтверждения.')], components: [] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Эта передача уже была выполнена.')], components: [] });
        return;
      }
      interaction.client.logger?.error?.('[/give]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

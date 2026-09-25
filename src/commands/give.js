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
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { questService } = require('../services/QuestService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

function giveContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Передача монет\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

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
      await interaction.reply({ embeds: [errorEmbed('Нельзя передать монеты самому себе.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя передать монеты боту.')], flags: MessageFlags.Ephemeral });
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
    const confirmContainer = giveContainer({
      heading: 'Подтвердите передачу',
      body:
        `Отправить **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} пользователю ${targetUser}?\n` +
        `-# Комиссия ${config.giveFeePercent}%: **${fee.toLocaleString('ru-RU')}** ${COIN_ICON} · получит **${willArrive.toLocaleString('ru-RU')}** ${COIN_ICON}`,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('give:confirm').setLabel('Подтвердить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('give:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ components: [confirmContainer, row], flags: MessageFlags.IsComponentsV2 });

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
      const cancelledContainer = giveContainer({ heading: 'Отменено', body: 'Передача не выполнена.', color: config.colors.danger });
      await choice.update({ components: [cancelledContainer], flags: MessageFlags.IsComponentsV2 });
      return;
    }

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

      const successContainer = giveContainer({
        heading: 'Монеты переданы',
        body:
          `Получатель: ${targetUser}\n` +
          `Сумма: **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `Комиссия: **${appliedFee.toLocaleString('ru-RU')}** ${COIN_ICON} · получено: **${amountAfterFee.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n` +
          `Ваш баланс: **${from.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`,
        color: config.colors.success,
      });
      await choice.update({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });

      const dmContainer = giveContainer({
        heading: 'Вам передали монеты',
        body: `От: ${interaction.user}\nСумма: **${amountAfterFee.toLocaleString('ru-RU')}** ${COIN_ICON} (после комиссии ${config.giveFeePercent}%)`,
        color: config.colors.success,
      });
      targetUser.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); // ЛС могут быть закрыты — не ошибка самого перевода.
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await choice.update({ embeds: [errorEmbed('Недостаточно монет на момент подтверждения.')], components: [] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await choice.update({ embeds: [errorEmbed('Эта передача уже была выполнена.')], components: [] });
        return;
      }
      interaction.client.logger?.error?.('[/give]', err);
      await choice.update({ embeds: [errorEmbed()], components: [] });
    }
  },
};

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
const { transactionService } = require('../services/TransactionService');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const { isEconomyAdmin } = require('../services/PermissionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

// Ephemeral + Components V2 — оба флага живут в одном битовом поле, комбинируем через |.
const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function ecoContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Экономика (админ)\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

async function requireAdmin(interaction) {
  if (isEconomyAdmin(interaction)) return true;
  await interaction.reply({ embeds: [errorEmbed('Недостаточно прав для этой команды.')], ephemeral: true });
  return false;
}

function describeAction(sub, targetUser, amount, currency) {
  const cur = currency === 'donateCoins' ? 'донат-монет' : 'монет';
  switch (sub) {
    case 'give':
      return `Начислить **${amount.toLocaleString('ru-RU')}** ${cur} пользователю ${targetUser}.`;
    case 'remove':
      return `Списать **${amount.toLocaleString('ru-RU')}** ${cur} у ${targetUser}.`;
    case 'set':
      return `Установить баланс (${cur}) пользователя ${targetUser} на **${amount.toLocaleString('ru-RU')}**.`;
    case 'reset':
      return `Сбросить весь баланс пользователя ${targetUser} до **0**.`;
    default:
      return '';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Административное управление экономикой')
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('Начислить монеты')
        .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Сколько').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('currency').setDescription('Валюта').addChoices({ name: 'Монеты', value: 'coins' }, { name: 'Донат-монеты', value: 'donateCoins' }))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Списать монеты')
        .addUserOption((o) => o.setName('user').setDescription('У кого').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Сколько').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('currency').setDescription('Валюта').addChoices({ name: 'Монеты', value: 'coins' }, { name: 'Донат-монеты', value: 'donateCoins' }))
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Установить точный баланс')
        .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Новый баланс').setRequired(true).setMinValue(0))
        .addStringOption((o) => o.setName('currency').setDescription('Валюта').addChoices({ name: 'Монеты', value: 'coins' }, { name: 'Донат-монеты', value: 'donateCoins' }))
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Сбросить баланс до 0').addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('balance').setDescription('Посмотреть баланс любого участника').addUserOption((o) => o.setName('user').setDescription('Чей').setRequired(true))
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const currency = interaction.options.getString('currency') || 'coins';

    if (sub === 'balance') {
      await interaction.deferReply({ ephemeral: true });
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);
      await interaction.editReply({
        components: [ecoContainer({
          heading: `Баланс — ${targetUser.username}`,
          body: `${COIN_ICON} Монеты: **${wallet.coins.toLocaleString('ru-RU')}**\n${DONATE_ICON} Донат-монеты: **${wallet.donateCoins.toLocaleString('ru-RU')}**`,
        })],
        flags: EPHEMERAL_V2,
      });
      return;
    }

    const amount = sub === 'reset' ? 0 : interaction.options.getInteger('amount');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('eco:confirm').setLabel('Подтвердить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('eco:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );
    const confirmContainer = ecoContainer({
      heading: 'Подтвердите действие',
      body: describeAction(sub, targetUser, amount, currency),
      color: config.colors.warning,
    });
    await interaction.reply({ components: [confirmContainer, row], flags: EPHEMERAL_V2 });
    const message = await interaction.fetchReply();

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

    if (choice.customId === 'eco:cancel') {
      await choice.update({ components: [ecoContainer({ heading: 'Отменено', body: 'Действие не выполнено.', color: config.colors.danger })], flags: EPHEMERAL_V2 });
      return;
    }
    await choice.update({ components: [] });

    try {
      let wallet;
      if (sub === 'give') {
        wallet = await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: targetUser.id,
          currency,
          amount,
          type: 'admin_add',
          idempotencyKey: `eco:give:${interaction.id}`,
        });
      } else if (sub === 'remove') {
        wallet = await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: targetUser.id,
          currency,
          amount: -amount,
          type: 'admin_remove',
          idempotencyKey: `eco:remove:${interaction.id}`,
        });
      } else if (sub === 'set' || sub === 'reset') {
        const targetAmount = sub === 'reset' ? 0 : amount;
        wallet = await Wallet.findOneAndUpdate(
          { guildId: interaction.guildId, userId: targetUser.id },
          { $set: { [sub === 'reset' ? 'coins' : currency]: targetAmount, ...(sub === 'reset' ? { donateCoins: 0 } : {}) } },
          { new: true, upsert: true }
        );
      }

      await AuditLog.create({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        action: `eco.${sub}`,
        targetUserId: targetUser.id,
        meta: { amount, currency },
      });

      const resultCurrency = sub === 'reset' ? 'coins' : currency;
      const successContainer = ecoContainer({
        heading: 'Выполнено',
        body: `${describeAction(sub, targetUser, amount, currency)}\n\nНовый баланс: **${wallet[resultCurrency].toLocaleString('ru-RU')}** ${icon(resultCurrency)}`,
        color: config.colors.success,
      });
      await interaction.editReply({ components: [successContainer], flags: EPHEMERAL_V2 });
    } catch (err) {
      interaction.client.logger?.error?.('[/eco]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

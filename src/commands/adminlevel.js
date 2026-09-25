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
const { levelService } = require('../services/LevelService');
const { transactionService } = require('../services/TransactionService');
const AuditLog = require('../models/AuditLog');
const { isBotOwner } = require('../services/PermissionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

// Ephemeral + Components V2 — оба флага живут в одном битовом поле, комбинируем через |.
const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function adminContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${appEmoji('crown')}Владелец бота\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

// Только config.botOwnerId — сознательно строже, чем isEconomyAdmin в /eco (тот
// пускает ещё и любого server Administrator). Эта команда не должна быть доступна
// даже админам сервера, поэтому .setDefaultMemberPermissions(0) на уровне Discord
// (никто, кроме владельца сервера, не увидит её в списке по умолчанию) ДОПОЛНИТЕЛЬНО
// проверяется в коде — так она остаётся недоступна, даже если кто-то вручную выдаст
// себе право на неё через настройки интеграций сервера.
async function requireOwner(interaction) {
  if (isBotOwner(interaction)) return true;
  await interaction.reply({ embeds: [errorEmbed('Эта команда доступна только владельцу бота.')], flags: MessageFlags.Ephemeral });
  return false;
}

function describeAction(sub, targetUser, amount, currency) {
  switch (sub) {
    case 'give-level':
      return `Установить уровень пользователя ${targetUser} на **${amount}**.`;
    case 'give-coins':
      return `Начислить **${amount.toLocaleString('ru-RU')}** ${currency === 'donateCoins' ? 'донат-монет' : 'монет'} пользователю ${targetUser}.`;
    default:
      return '';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminlevel')
    .setDescription('Владельческое управление уровнем и монетами (скрыто от админов сервера)')
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub
        .setName('give-level')
        .setDescription('Установить точный уровень пользователю')
        .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
        .addIntegerOption((o) => o.setName('level').setDescription('Новый уровень').setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub
        .setName('give-coins')
        .setDescription('Начислить монеты в обход обычных лимитов')
        .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Сколько').setRequired(true).setMinValue(1))
        .addStringOption((o) =>
          o.setName('currency').setDescription('Валюта').addChoices({ name: 'Монеты', value: 'coins' }, { name: 'Донат-монеты', value: 'donateCoins' })
        )
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const amount = sub === 'give-level' ? interaction.options.getInteger('level') : interaction.options.getInteger('amount');
    const currency = interaction.options.getString('currency') || 'coins';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adminlevel:confirm').setLabel('Подтвердить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('adminlevel:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );
    const confirmContainer = adminContainer({
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

    if (choice.customId === 'adminlevel:cancel') {
      await choice.update({ components: [adminContainer({ heading: 'Отменено', body: 'Действие не выполнено.', color: config.colors.danger })], flags: EPHEMERAL_V2 });
      return;
    }
    await choice.update({ components: [] });

    try {
      let resultBody;

      if (sub === 'give-level') {
        const { oldLevel, newLevel } = await levelService.setLevel({ guild: interaction.guild, userId: targetUser.id, level: amount });
        resultBody = `Уровень ${targetUser} изменён: **${oldLevel}** → **${newLevel}**.`;
      } else {
        const wallet = await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: targetUser.id,
          currency,
          amount,
          type: 'owner_add',
          idempotencyKey: `adminlevel:give-coins:${interaction.id}`,
        });
        resultBody = `Начислено **${amount.toLocaleString('ru-RU')}** ${currency === 'donateCoins' ? 'донат-монет' : 'монет'} пользователю ${targetUser}.\n\nНовый баланс: **${wallet[currency].toLocaleString('ru-RU')}** ${icon(currency)}`;
      }

      await AuditLog.create({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        action: `adminlevel.${sub}`,
        targetUserId: targetUser.id,
        meta: { amount, currency: sub === 'give-coins' ? currency : undefined },
      });

      await interaction.editReply({
        components: [adminContainer({ heading: 'Выполнено', body: resultBody, color: config.colors.success })],
        flags: EPHEMERAL_V2,
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/adminlevel]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

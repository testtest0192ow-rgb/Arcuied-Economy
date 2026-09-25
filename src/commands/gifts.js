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
const { giftService, GiftNotFoundError, GiftAlreadyClaimedError } = require('../services/GiftService');
const { guessGiftService, RoundNotOpenError, AlreadyGuessedError, CannotGuessOwnGiftError } = require('../services/GuessGiftService');
const { InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

const emojiIds = require('../generated/emojiIds.json');

const BOX_LABELS = { 1: '1', 2: '2', 3: '3' }; // фоллбэк, пока кастомные emoji не загружены
const BOX_EMOJI_IDS = { 1: emojiIds.giftbox1, 2: emojiIds.giftbox2, 3: emojiIds.giftbox3 };
const GUESS_ROUND_MINUTES = 10;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

// Общий паттерн Components V2 для всех сообщений этой команды.
function giftsContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${appEmoji('gift')}Подарки\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

async function handleSend(interaction) {
  const targetUser = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  if (targetUser.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed('Нельзя отправить подарок самому себе.')] });
    return;
  }

  try {
    await giftService.sendCoinGift({
      guildId: interaction.guildId,
      fromUserId: interaction.user.id,
      toUserId: targetUser.id,
      currency: 'coins',
      amount,
      idempotencyKey: `gift:${interaction.id}`,
    });

    await interaction.editReply({
      components: [giftsContainer({
        heading: 'Подарок отправлен',
        body: `${targetUser} получит **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} после того, как откроет подарок (\`/gifts list\`).`,
        color: config.colors.success,
      })],
      flags: MessageFlags.IsComponentsV2,
    });

    targetUser
      .send({
        components: [giftsContainer({ heading: 'Вам подарок', body: `От: ${interaction.user}\nОткройте его командой \`/gifts list\`.` })],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch(() => {});
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет.')] });
      return;
    }
    if (err instanceof DuplicateActionError) {
      await interaction.editReply({ embeds: [errorEmbed('Этот подарок уже был отправлен.')] });
      return;
    }
    interaction.client.logger?.error?.('[/gifts send]', err);
    await interaction.editReply({ embeds: [errorEmbed()] });
  }
}

async function handleList(interaction) {
  try {
    const pending = await giftService.listPending(interaction.guildId, interaction.user.id);
    if (pending.length === 0) {
      await interaction.editReply({
        components: [giftsContainer({ heading: 'Подарки', body: 'Непринятых подарков нет.' })],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const lines = pending.map((g) =>
      g.kind === 'coins'
        ? `**${g.amount.toLocaleString('ru-RU')}** ${icon(g.currency)} от <@${g.fromUserId}>`
        : `**${g.itemKey}** × ${g.quantity} от <@${g.fromUserId}>`
    );
    const rows = pending
      .slice(0, 5)
      .map((g) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gifts:open:${g._id}`).setLabel(`Открыть подарок от ${g.fromUserId}`.slice(0, 80)).setStyle(ButtonStyle.Success)
        )
      );

    await interaction.editReply({
      components: [giftsContainer({ heading: 'Непринятые подарки', body: lines.join('\n') }), ...rows],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    interaction.client.logger?.error?.('[/gifts list]', err);
    await interaction.editReply({ embeds: [errorEmbed()] });
  }
}

function guessGiftRoundContainer(hiderUser, amount, statusText, color = config.colors.primary) {
  return giftsContainer({
    heading: 'Угадай подарок',
    body: `${hiderUser} спрятал **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} в одном из подарков!\n\n${statusText}`,
    color,
  });
}

function guessGiftButtons(roundId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3].map((box) => {
      const btn = new ButtonBuilder()
        .setCustomId(`giftguess:pick:${roundId}:${box}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);
      // Кастомная эмодзи-коробка вместо цифры, если npm run upload-app-emoji уже запускался.
      if (BOX_EMOJI_IDS[box]) {
        btn.setEmoji({ id: BOX_EMOJI_IDS[box], name: `giftbox${box}` });
      } else {
        btn.setLabel(BOX_LABELS[box]);
      }
      return btn;
    })
  );
}

async function handleHide(interaction) {
  const amount = interaction.options.getInteger('amount');

  try {
    const round = await guessGiftService.hide({ guildId: interaction.guildId, hiderId: interaction.user.id, amount });

    await interaction.editReply({
      components: [giftsContainer({
        heading: 'Спрятано',
        body: `Вы спрятали **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} в одном из 3 подарков. Публикую в чат — первый, кто угадает, заберёт их.`,
        color: config.colors.success,
      })],
      flags: MessageFlags.IsComponentsV2,
    });

    const publicMessage = await interaction.channel.send({
      components: [guessGiftRoundContainer(interaction.user, amount, '-# У каждого — только одна попытка.'), guessGiftButtons(round._id)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = publicMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: GUESS_ROUND_MINUTES * 60_000,
    });

    collector.on('collect', async (buttonInteraction) => {
      const [, , roundId, boxStr] = buttonInteraction.customId.split(':');
      const box = Number(boxStr);

      try {
        const { won } = await guessGiftService.guess({
          guildId: interaction.guildId,
          roundId,
          userId: buttonInteraction.user.id,
          box,
        });

        if (won) {
          collector.stop('won');
          await buttonInteraction.update({
            components: [
              guessGiftRoundContainer(interaction.user, amount, `🏆 ${buttonInteraction.user} угадал и забрал подарок!`, config.colors.success),
              guessGiftButtons(roundId, true),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }

        await buttonInteraction.reply({ embeds: [errorEmbed('Мимо! В этом подарке ничего не было (попытка потрачена).')], flags: MessageFlags.Ephemeral });
      } catch (err) {
        if (err instanceof CannotGuessOwnGiftError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Нельзя угадывать свой же подарок.')], flags: MessageFlags.Ephemeral });
          return;
        }
        if (err instanceof AlreadyGuessedError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Вы уже пробовали в этом раунде.')], flags: MessageFlags.Ephemeral });
          return;
        }
        if (err instanceof RoundNotOpenError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Этот раунд уже завершён.')], flags: MessageFlags.Ephemeral });
          return;
        }
        interaction.client.logger?.error?.('[/gifts hide guess]', err);
        await buttonInteraction.reply({ embeds: [errorEmbed()], flags: MessageFlags.Ephemeral });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'won') return;
      try {
        await guessGiftService.expire({ guildId: interaction.guildId, roundId: round._id });
        await publicMessage.edit({
          components: [
            guessGiftRoundContainer(interaction.user, amount, 'Никто не угадал — подарок вернулся отправителю.', config.colors.warning),
            guessGiftButtons(round._id, true),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (err) {
        interaction.client.logger?.error?.('[/gifts hide expire]', err);
      }
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет.')] });
      return;
    }
    interaction.client.logger?.error?.('[/gifts hide]', err);
    await interaction.editReply({ embeds: [errorEmbed()] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gifts')
    .setDescription('Подарки')
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Отправить подарок')
        .addUserOption((opt) => opt.setName('user').setDescription('Кому').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Сколько монет').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Посмотреть непринятые подарки'))
    .addSubcommand((sub) =>
      sub
        .setName('hide')
        .setDescription('Спрятать монеты в одном из 3 подарков — кто угадает, тот заберёт')
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Сколько спрятать').setRequired(true).setMinValue(1))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'send') return handleSend(interaction);
    if (sub === 'hide') return handleHide(interaction);
    return handleList(interaction);
  },

  // Только для кнопок "Открыть подарок" из /gifts list (customId "gifts:open:<id>").
  // Кнопки угадай-игры живут в своём неймспейсе "giftguess:" и обрабатываются
  // отдельным коллектором внутри handleHide(), сюда они не попадают.
  async handleButton(interaction) {
    const giftId = interaction.customId.split(':')[2];
    await interaction.deferUpdate();

    try {
      const { gift } = await giftService.claimGift({ giftId, userId: interaction.user.id });
      const body =
        gift.kind === 'coins'
          ? `Вы получили **${gift.amount.toLocaleString('ru-RU')}** ${icon(gift.currency)}.`
          : `Вы получили **${gift.itemKey}** × ${gift.quantity}.`;

      await interaction.followUp({
        components: [giftsContainer({ heading: 'Подарок открыт', body, color: config.colors.success })],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (err) {
      if (err instanceof GiftAlreadyClaimedError) {
        await interaction.followUp({ embeds: [errorEmbed('Этот подарок уже открыт.')], flags: MessageFlags.Ephemeral });
        return;
      }
      if (err instanceof GiftNotFoundError) {
        await interaction.followUp({ embeds: [errorEmbed('Подарок не найден.')], flags: MessageFlags.Ephemeral });
        return;
      }
      interaction.client.logger?.error?.('[/gifts open]', err);
      await interaction.followUp({ embeds: [errorEmbed()], flags: MessageFlags.Ephemeral });
    }
  },
};

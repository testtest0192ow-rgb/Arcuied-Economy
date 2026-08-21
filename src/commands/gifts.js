const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { giftService, GiftNotFoundError, GiftAlreadyClaimedError } = require('../services/GiftService');
const { guessGiftService, RoundNotOpenError, AlreadyGuessedError, CannotGuessOwnGiftError } = require('../services/GuessGiftService');
const { InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

const BOX_LABELS = { 1: 'Первый', 2: 'Второй', 3: 'Третий' };
const GUESS_ROUND_MINUTES = 10;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
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
      embeds: [
        baseEmbed({
          title: 'Подарок отправлен',
          description: `${DIVIDER}\n${targetUser} получит **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} после того, как откроет подарок (\`/gifts list\`).`,
          color: config.colors.success,
        }),
      ],
    });

    targetUser
      .send({ embeds: [baseEmbed({ title: 'Вам подарок', description: `${DIVIDER}\nОт: ${interaction.user}\nОткройте его командой \`/gifts list\`.` })] })
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
      await interaction.editReply({ embeds: [baseEmbed({ title: 'Подарки', description: `${DIVIDER}\nНепринятых подарков нет.` })] });
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
      embeds: [baseEmbed({ title: 'Непринятые подарки', description: `${DIVIDER}\n${lines.join('\n')}` })],
      components: rows,
    });
  } catch (err) {
    interaction.client.logger?.error?.('[/gifts list]', err);
    await interaction.editReply({ embeds: [errorEmbed()] });
  }
}

function guessGiftRoundEmbed(hiderUser, amount, statusText) {
  return baseEmbed({
    title: 'Угадай подарок',
    description: `${DIVIDER}\n${hiderUser} спрятал **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} в одном из подарков!\n\n${statusText}`,
  });
}

function guessGiftButtons(roundId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3].map((box) =>
      new ButtonBuilder()
        .setCustomId(`giftguess:pick:${roundId}:${box}`)
        .setLabel(BOX_LABELS[box])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  );
}

async function handleHide(interaction) {
  const amount = interaction.options.getInteger('amount');

  try {
    const round = await guessGiftService.hide({ guildId: interaction.guildId, hiderId: interaction.user.id, amount });

    await interaction.editReply({
      embeds: [baseEmbed({ title: 'Спрятано', description: `${DIVIDER}\nВы спрятали **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} в одном из 3 подарков. Публикую в чат — первый, кто угадает, заберёт их.`, color: config.colors.success })],
    });

    const publicMessage = await interaction.channel.send({
      embeds: [guessGiftRoundEmbed(interaction.user, amount, '-# У каждого — только одна попытка.')],
      components: [guessGiftButtons(round._id)],
    });

    const collector = publicMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: GUESS_ROUND_MINUTES * 60_000,
    });

    collector.on('collect', async (buttonInteraction) => {
      const [, , roundId, boxStr] = buttonInteraction.customId.split(':');
      const box = Number(boxStr);

      try {
        const { won, gift } = await guessGiftService.guess({
          guildId: interaction.guildId,
          roundId,
          userId: buttonInteraction.user.id,
          box,
        });

        if (won) {
          collector.stop('won');
          await buttonInteraction.update({
            embeds: [guessGiftRoundEmbed(interaction.user, amount, `🏆 ${buttonInteraction.user} угадал и забрал подарок!`)],
            components: [guessGiftButtons(roundId, true)],
          });
          return;
        }

        await buttonInteraction.reply({ embeds: [errorEmbed(`Мимо! В этом подарке ничего не было (попытка потрачена).`)], ephemeral: true });
      } catch (err) {
        if (err instanceof CannotGuessOwnGiftError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Нельзя угадывать свой же подарок.')], ephemeral: true });
          return;
        }
        if (err instanceof AlreadyGuessedError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Вы уже пробовали в этом раунде.')], ephemeral: true });
          return;
        }
        if (err instanceof RoundNotOpenError) {
          await buttonInteraction.reply({ embeds: [errorEmbed('Этот раунд уже завершён.')], ephemeral: true });
          return;
        }
        interaction.client.logger?.error?.('[/gifts hide guess]', err);
        await buttonInteraction.reply({ embeds: [errorEmbed()], ephemeral: true });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'won') return;
      try {
        await guessGiftService.expire({ guildId: interaction.guildId, roundId: round._id });
        await publicMessage.edit({
          embeds: [guessGiftRoundEmbed(interaction.user, amount, 'Никто не угадал — подарок вернулся отправителю.')],
          components: [guessGiftButtons(round._id, true)],
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
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'send') return handleSend(interaction);
    if (sub === 'hide') return handleHide(interaction);
    return handleList(interaction);
  },

  // Only for /gifts list -> "Открыть подарок" buttons (customId "gifts:open:<id>").
  // The guess-game buttons use a separate "giftguess:" namespace handled by their own
  // message collector in handleHide(), so they never reach this router.
  async handleButton(interaction) {
    const giftId = interaction.customId.split(':')[2];
    await interaction.deferUpdate();

    try {
      const { gift } = await giftService.claimGift({ giftId, userId: interaction.user.id });
      const description =
        gift.kind === 'coins'
          ? `Вы получили **${gift.amount.toLocaleString('ru-RU')}** ${icon(gift.currency)}.`
          : `Вы получили **${gift.itemKey}** × ${gift.quantity}.`;

      await interaction.followUp({
        embeds: [baseEmbed({ title: 'Подарок открыт', description: `${DIVIDER}\n${description}`, color: config.colors.success })],
        ephemeral: true,
      });
    } catch (err) {
      if (err instanceof GiftAlreadyClaimedError) {
        await interaction.followUp({ embeds: [errorEmbed('Этот подарок уже открыт.')], ephemeral: true });
        return;
      }
      if (err instanceof GiftNotFoundError) {
        await interaction.followUp({ embeds: [errorEmbed('Подарок не найден.')], ephemeral: true });
        return;
      }
      interaction.client.logger?.error?.('[/gifts open]', err);
      await interaction.followUp({ embeds: [errorEmbed()], ephemeral: true });
    }
  },
};

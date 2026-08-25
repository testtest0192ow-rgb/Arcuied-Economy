const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { blackjackService, GameNotActiveError, handValue } = require('../services/BlackjackService');
const { InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };

function renderHand(hand) {
  return hand.map((c) => `${c.slice(0, -1)}${SUIT_SYMBOL[c.slice(-1)]}`).join(' ');
}

const OUTCOME_TITLE = {
  blackjack: 'Блэкджек! Вы выиграли',
  player_win: 'Вы выиграли',
  dealer_bust: 'Дилер перебрал — вы выиграли',
  player_bust: 'Перебор — вы проиграли',
  dealer_win: 'Вы проиграли',
  push: 'Ничья — ставка возвращена',
};

function buildEmbed(game, { revealDealer = false, outcome = null, payout = 0 } = {}) {
  const dealerCards = revealDealer ? renderHand(game.dealerHand) : `${renderHand([game.dealerHand[0]])} 🂠`;
  const dealerValueLine = revealDealer ? `Сумма: **${handValue(game.dealerHand)}**` : '';

  let description =
    `${DIVIDER}\n` +
    `Ставка: **${game.bet.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n` +
    `Дилер\n${dealerCards}\n${dealerValueLine}\n\n` +
    `Ваши карты\n${renderHand(game.playerHand)}\nСумма: **${handValue(game.playerHand)}**`;

  if (outcome) {
    description += `\n\n${payout > 0 ? `Выплата: **${payout.toLocaleString('ru-RU')}**` : 'Выплата: **0**'} ${COIN_ICON}`;
  }

  return baseEmbed({
    title: outcome ? OUTCOME_TITLE[outcome] : 'Blackjack',
    description,
    color: outcome ? (payout > game.bet ? config.colors.success : payout === game.bet ? config.colors.warning : config.colors.danger) : config.colors.primary,
  });
}

function buildRow(gameId, { canDouble }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackjack:hit:${gameId}`).setLabel('Взять').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`blackjack:stand:${gameId}`).setLabel('Остановиться').setStyle(ButtonStyle.Secondary)
  );
  if (canDouble) {
    row.addComponents(new ButtonBuilder().setCustomId(`blackjack:double:${gameId}`).setLabel('Удвоить').setStyle(ButtonStyle.Success));
  }
  return row;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Сыграть в блэкджек на ставку')
    .addIntegerOption((opt) => opt.setName('bet').setDescription('Размер ставки').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await blackjackService.startGame({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        bet,
        channelId: interaction.channelId,
      });

      // startGame returns either the raw game (still active) or { game, outcome, payout } if it was a natural blackjack.
      if (result.outcome) {
        await interaction.editReply({ embeds: [buildEmbed(result.game, { revealDealer: true, outcome: result.outcome, payout: result.payout })] });
        return;
      }

      const canDouble = result.playerHand.length === 2;
      const message = await interaction.editReply({ embeds: [buildEmbed(result)], components: [buildRow(result._id, { canDouble })] });
      await require('../models/BlackjackGame').updateOne({ _id: result._id }, { messageId: message.id });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно монет для такой ставки.')] });
        return;
      }
      interaction.client.logger?.error?.('[/blackjack]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },

  async handleButton(interaction) {
    const [, action, gameId] = interaction.customId.split(':');
    await interaction.deferUpdate();

    try {
      let response;
      if (action === 'hit') response = await blackjackService.hit(gameId);
      else if (action === 'stand') response = await blackjackService.stand(gameId);
      else if (action === 'double') response = await blackjackService.double(gameId);
      else return;

      const isResolved = Boolean(response.outcome);
      const game = isResolved ? response.game : response;

      const embed = isResolved
        ? buildEmbed(game, { revealDealer: true, outcome: response.outcome, payout: response.payout })
        : buildEmbed(game);
      const components = isResolved ? [] : [buildRow(gameId, { canDouble: game.playerHand.length === 2 })];

      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      if (err instanceof GameNotActiveError) {
        // Already resolved (e.g. double-click) — message already shows the final state, nothing to do.
        return;
      }
      if (err instanceof InsufficientFundsError) {
        await interaction.followUp({ embeds: [errorEmbed('Недостаточно монет, чтобы удвоить ставку.')], ephemeral: true });
        return;
      }
      if (err instanceof DuplicateActionError) {
        return; // The double was already applied by a concurrent click — ignore silently.
      }
      interaction.client.logger?.error?.('[blackjack button]', err);
      await interaction.followUp({ embeds: [errorEmbed()], ephemeral: true });
    }
  },
};

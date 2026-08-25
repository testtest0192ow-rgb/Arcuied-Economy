const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { gameFairnessService } = require('../services/GameFairnessService');
const { generateDiceGif } = require('../services/AnimatedGifService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const PAYOUT_MULTIPLIER = 5; // угадать грань 1/6 — честная выплата была бы x6, x5 задаёт небольшой запас казино

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Угадать грань кубика на ставку')
    .addIntegerOption((opt) => opt.setName('bet').setDescription('Размер ставки').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) =>
      opt.setName('number').setDescription('Какая грань выпадет (1-6)').setRequired(true).setMinValue(1).setMaxValue(6)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const guess = interaction.options.getInteger('number');
    await interaction.deferReply({ ephemeral: true });

    const wallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (wallet.coins < bet) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет. Баланс: **${wallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    try {
      const idBase = interaction.id;

      const afterDebit = await transactionService.applyDelta({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        currency: 'coins',
        amount: -bet,
        type: 'game_loss',
        idempotencyKey: `dice:${idBase}:bet`,
      });

      const serverSeed = gameFairnessService.generateServerSeed();
      const { result, proofHash } = gameFairnessService.dice({
        serverSeed,
        clientSeed: interaction.user.id,
        nonce: idBase,
      });

      const won = result === guess;
      let finalWallet = afterDebit;
      const payout = bet * PAYOUT_MULTIPLIER;

      if (won) {
        finalWallet = await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          currency: 'coins',
          amount: payout,
          type: 'game_win',
          idempotencyKey: `dice:${idBase}:payout`,
        });
      }

      const resultEmbed = baseEmbed({
        title: won ? 'Вы выиграли' : 'Вы проиграли',
        description:
          `${DIVIDER}\n` +
          `Выпало: **${result}** · Вы поставили на: **${guess}**\n` +
          `${won ? `Выигрыш: **+${payout.toLocaleString('ru-RU')}** (×${PAYOUT_MULTIPLIER})` : `Проигрыш: **-${bet.toLocaleString('ru-RU')}**`} ${COIN_ICON}\n\n` +
          `Баланс: **${finalWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `-# proof: ${proofHash.slice(0, 16)}...`,
        color: won ? config.colors.success : config.colors.danger,
      });
      const customDiceGifUrl = config.assets.pickRandomGif(config.assets.diceGifUrls);
      let files = [];
      if (customDiceGifUrl) {
        resultEmbed.setImage(customDiceGifUrl);
      } else {
        const gifBuffer = generateDiceGif();
        const attachment = new AttachmentBuilder(gifBuffer, { name: 'dice.gif' });
        resultEmbed.setImage('attachment://dice.gif');
        files = [attachment];
      }

      await interaction.editReply({ embeds: [resultEmbed], files });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно средств на момент броска.')] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Этот бросок уже был выполнен.')] });
        return;
      }
      interaction.client.logger?.error?.('[/dice]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

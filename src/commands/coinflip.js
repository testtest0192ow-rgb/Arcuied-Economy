const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { gameFairnessService } = require('../services/GameFairnessService');
const { generateCoinflipGif } = require('../services/AnimatedGifService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const SIDE_LABEL = { heads: 'Орёл', tails: 'Решка' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Подбросить монету на ставку')
    .addIntegerOption((opt) => opt.setName('bet').setDescription('Размер ставки').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    await interaction.deferReply();

    const wallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (wallet.coins < bet) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет. Баланс: **${wallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    const embed = baseEmbed({
      title: 'Coinflip',
      description: `${DIVIDER}\nСтавка\n**${bet.toLocaleString('ru-RU')}** ${COIN_ICON}\n\nВыберите сторону\n\n-# Результат определяется сервером.`,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinflip:heads').setLabel('Орёл').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('coinflip:tails').setLabel('Решка').setStyle(ButtonStyle.Primary)
    );
    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.user.id === interaction.user.id,
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Время на выбор истекло.')], components: [] });
      return;
    }

    const pickedSide = choice.customId.split(':')[1];

    await choice.update({
      embeds: [baseEmbed({ title: 'Подбрасываем...', description: `${DIVIDER}\nВы выбрали: **${SIDE_LABEL[pickedSide]}**` })],
      components: [],
    });

    try {
      const idBase = interaction.id;

      const afterDebit = await transactionService.applyDelta({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        currency: 'coins',
        amount: -bet,
        type: 'game_loss',
        idempotencyKey: `coinflip:${idBase}:bet`,
      });

      const serverSeed = gameFairnessService.generateServerSeed();
      const { result } = gameFairnessService.coinflip({
        serverSeed,
        clientSeed: interaction.user.id,
        nonce: idBase,
      });

      const won = result === pickedSide;
      let finalWallet = afterDebit;

      if (won) {
        finalWallet = await transactionService.applyDelta({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          currency: 'coins',
          amount: bet * 2,
          type: 'game_win',
          idempotencyKey: `coinflip:${idBase}:payout`,
        });
      }

      const resultEmbed = baseEmbed({
        title: won ? 'Вы выиграли' : 'Вы проиграли',
        description:
          `${DIVIDER}\n` +
          `Выпало: **${SIDE_LABEL[result]}** · Вы выбрали: **${SIDE_LABEL[pickedSide]}**\n` +
          `${won ? `Выигрыш: **+${bet.toLocaleString('ru-RU')}**` : `Проигрыш: **-${bet.toLocaleString('ru-RU')}**`} ${COIN_ICON}\n\n` +
          `Баланс: **${finalWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`,
        color: won ? config.colors.success : config.colors.danger,
      });

      // Свой URL из .env имеет приоритет; иначе — сгенерированная анимация с подписью результата.
      const customGifUrl = config.assets.pickRandomGif(
        result === 'heads' ? config.assets.coinflipHeadsGifUrls : config.assets.coinflipTailsGifUrls
      );
      let files = [];
      if (customGifUrl) {
        resultEmbed.setImage(customGifUrl);
      } else {
        const gifBuffer = generateCoinflipGif(result);
        const attachment = new AttachmentBuilder(gifBuffer, { name: 'coinflip.gif' });
        resultEmbed.setImage('attachment://coinflip.gif');
        files = [attachment];
      }

      await interaction.editReply({ embeds: [resultEmbed], components: [], files });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.editReply({ embeds: [errorEmbed('Недостаточно средств на момент броска.')], components: [] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Этот бросок уже был выполнен.')], components: [] });
        return;
      }
      interaction.client.logger?.error?.('[/coinflip]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { gameFairnessService } = require('../services/GameFairnessService');
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
    await interaction.deferReply({ ephemeral: true });

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

    // Короткая "подбрасываем" стадия без гифки — какая именно гифка (орёл/решка)
    // нужна, мы узнаём только после резолва результата.
    await choice.update({
      embeds: [baseEmbed({ title: 'Подбрасываем...', description: `${DIVIDER}\nВы выбрали: **${SIDE_LABEL[pickedSide]}**` })],
      components: [],
    });

    try {
      const idBase = interaction.id;

      // Escrow the bet first — atomic debit, rejects if funds insufficient at this exact moment.
      const afterDebit = await transactionService.applyDelta({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        currency: 'coins',
        amount: -bet,
        type: 'game_loss',
        idempotencyKey: `coinflip:${idBase}:bet`,
      });

      const serverSeed = gameFairnessService.generateServerSeed();
      const { result, proofHash } = gameFairnessService.coinflip({
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

      // Гифка соответствует тому, что реально выпало (result), а не тому, что выбрал игрок.
      const resultGifUrl = result === 'heads' ? config.assets.coinflipHeadsGifUrl : config.assets.coinflipTailsGifUrl;

      const resultEmbed = baseEmbed({
        title: won ? 'Вы выиграли' : 'Вы проиграли',
        description:
          `${DIVIDER}\n` +
          `Выпало: **${SIDE_LABEL[result]}** · Вы выбрали: **${SIDE_LABEL[pickedSide]}**\n` +
          `${won ? `Выигрыш: **+${bet.toLocaleString('ru-RU')}**` : `Проигрыш: **-${bet.toLocaleString('ru-RU')}**`} ${COIN_ICON}\n\n` +
          `Баланс: **${finalWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}\n` +
          `-# proof: ${proofHash.slice(0, 16)}...`,
        color: won ? config.colors.success : config.colors.danger,
      });
      if (resultGifUrl) {
        resultEmbed.setImage(resultGifUrl);
      }

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
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

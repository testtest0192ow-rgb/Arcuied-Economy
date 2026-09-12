const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { gameFairnessService } = require('../services/GameFairnessService');
const { generateCoinflipGif } = require('../services/AnimatedGifService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const SIDE_LABEL = { heads: 'Орёл', tails: 'Решка' };

// Тот же паттерн Components V2, что и в /dice и /duel.
function coinflipContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Coinflip\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Подбросить монету на ставку')
    .addIntegerOption((opt) => opt.setName('ставка').setDescription('Размер ставки').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const bet = interaction.options.getInteger('ставка');
    await interaction.deferReply();

    const wallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (wallet.coins < bet) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет. Баланс: **${wallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinflip:heads').setLabel('Орёл').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('coinflip:tails').setLabel('Решка').setStyle(ButtonStyle.Primary)
    );

    const inviteContainer = coinflipContainer({
      heading: 'Выберите сторону',
      body: `Ставка: **${bet.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n-# Результат определяется сервером.`,
    });

    const message = await interaction.editReply({ components: [inviteContainer, row], flags: MessageFlags.IsComponentsV2 });

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

    const flippingContainer = coinflipContainer({ heading: 'Подбрасываем...', body: `Вы выбрали: **${SIDE_LABEL[pickedSide]}**` });
    await choice.update({ components: [flippingContainer], flags: MessageFlags.IsComponentsV2 });

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

      const resultContainer = coinflipContainer({
        heading: won ? 'Вы выиграли' : 'Вы проиграли',
        body:
          `Выпало: **${SIDE_LABEL[result]}** · Вы выбрали: **${SIDE_LABEL[pickedSide]}**\n` +
          `${won ? `Выигрыш: **+${bet.toLocaleString('ru-RU')}**` : `Проигрыш: **-${bet.toLocaleString('ru-RU')}**`} ${COIN_ICON}\n\n` +
          `Баланс: **${finalWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`,
        color: won ? config.colors.success : config.colors.danger,
      });

      // Приоритет: локальный файл в assets/gifs/ (не истекает) → ссылка из .env
      // (Discord CDN-ссылки с подписью ex=/is=/hm= ИСТЕКАЮТ примерно через сутки —
      // не хранить их как постоянный источник) → сгенерированная анимация.
      const localGifPath = path.join(__dirname, '..', '..', 'assets', 'gifs', result === 'heads' ? 'coinflip-heads.gif' : 'coinflip-tails.gif');
      const customGifUrl = config.assets.pickRandomGif(
        result === 'heads' ? config.assets.coinflipHeadsGifUrls : config.assets.coinflipTailsGifUrls
      );
      let files = [];
      let imageUrl;
      if (fs.existsSync(localGifPath)) {
        files = [new AttachmentBuilder(localGifPath, { name: 'coinflip.gif' })];
        imageUrl = 'attachment://coinflip.gif';
      } else if (customGifUrl) {
        imageUrl = customGifUrl;
      } else {
        const gifBuffer = generateCoinflipGif(result);
        files = [new AttachmentBuilder(gifBuffer, { name: 'coinflip.gif' })];
        imageUrl = 'attachment://coinflip.gif';
      }
      resultContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
      );

      await interaction.editReply({ components: [resultContainer], files, flags: MessageFlags.IsComponentsV2 });
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

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
const { duelService, DuelNotPendingError, DuelAlreadyTakenError } = require('../services/DuelService');
const { transactionService, InsufficientFundsError } = require('../services/TransactionService');
const { questService } = require('../services/QuestService');
const { generateDuelGif } = require('../services/AnimatedGifService');
const { buildDuelSceneCard } = require('../services/DuelSceneCardService');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

// Тот же паттерн, что и в /dice: "-# категория" + жирный заголовок + Separator + текст.
// Серый акцент по умолчанию, зелёный/красный только на реальном исходе (победа/отмена).
function duelContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Дуэль\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Открыть дуэль на ставку — первый, кто примет, сыграет')
    .addIntegerOption((opt) => opt.setName('ставка').setDescription('Ставка').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const amount = interaction.options.getInteger('ставка');
    await interaction.deferReply();

    const challengerWallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (challengerWallet.coins < amount) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет для такой ставки. Баланс: **${challengerWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    // opponentId не задаётся здесь — дуэль открыта всем, занимается первым, кто нажмёт "Принять".
    const duel = await duelService.createDuel({
      guildId: interaction.guildId,
      challengerId: interaction.user.id,
      amount,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel:accept:${duel._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`duel:cancel:${duel._id}`).setLabel('Отменить').setStyle(ButtonStyle.Secondary)
    );

    const inviteContainer = duelContainer({
      heading: 'Вызов открыт',
      body: `${interaction.user} ищет соперника для дуэли, ставка **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}`,
    });

    const message = await interaction.editReply({ components: [inviteContainer, row], flags: MessageFlags.IsComponentsV2 });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 120_000,
      });
    } catch {
      await duelService.expireDuel(duel._id);
      await interaction.editReply({ embeds: [errorEmbed('Никто не принял вызов вовремя. Дуэль отменена.')], components: [] });
      return;
    }

    const action = choice.customId.split(':')[1];

    if (action === 'cancel') {
      if (choice.user.id !== interaction.user.id) {
        await choice.reply({ content: 'Только тот, кто открыл дуэль, может её отменить.', ephemeral: true });
        return;
      }
      await duelService.cancelDuel(duel._id);
      const cancelledContainer = duelContainer({ heading: 'Дуэль отменена', body: `${interaction.user} отменил вызов.`, color: config.colors.danger });
      await choice.update({ components: [cancelledContainer], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    // action === 'accept' — первый, кто нажал, атомарно занимает слот соперника.
    let claimedDuel;
    try {
      claimedDuel = await duelService.claimDuel(duel._id, choice.user.id);
    } catch (err) {
      if (err instanceof DuelAlreadyTakenError) {
        const reason = choice.user.id === interaction.user.id
          ? 'Нельзя принять свой же вызов.'
          : 'Кто-то уже принял эту дуэль раньше вас.';
        await choice.reply({ embeds: [errorEmbed(reason)], ephemeral: true });
        return;
      }
      throw err;
    }

    const opponent = choice.user;

    const startedContainer = duelContainer({
      heading: 'Дуэль началась',
      body: `Ставка: **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}\n\n${interaction.user} ⚔️ ${opponent}`,
    });

    const customDuelGifUrl = config.assets.pickRandomGif(config.assets.duelGifUrls);
    let files = [];
    if (customDuelGifUrl) {
      startedContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(customDuelGifUrl))
      );
    } else {
      const gifBuffer = generateDuelGif();
      const attachment = new AttachmentBuilder(gifBuffer, { name: 'duel.gif' });
      startedContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://duel.gif'))
      );
      files = [attachment];
    }
    await choice.update({ components: [startedContainer], files, flags: MessageFlags.IsComponentsV2 });

    try {
      const { winnerId, loserId, pot } = await duelService.acceptDuel(claimedDuel._id);
      await questService.increment(interaction.guild, interaction.user.id, 'activity', 1).catch(() => {});
      await questService.increment(interaction.guild, opponent.id, 'activity', 1).catch(() => {});
      const winnerUser = winnerId === interaction.user.id ? interaction.user : opponent;
      const loserUser = loserId === interaction.user.id ? interaction.user : opponent;

      const leftUser = winnerId === interaction.user.id
        ? { username: interaction.user.username, avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) }
        : { username: opponent.username, avatarURL: opponent.displayAvatarURL({ extension: 'png', size: 128 }) };
      const rightUser = winnerId === interaction.user.id
        ? { username: opponent.username, avatarURL: opponent.displayAvatarURL({ extension: 'png', size: 128 }) }
        : { username: interaction.user.username, avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) };
      const resultAttachment = await buildDuelSceneCard({ leftUser, rightUser });

      const resultContainer = duelContainer({
        heading: 'Дуэль завершена',
        body: `🏆 ${winnerUser} побеждает и забирает **${pot.toLocaleString('ru-RU')}** ${COIN_ICON}\n${loserUser} проигрывает ставку.`,
        color: config.colors.success,
      });
      resultContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://duel-scene.png'))
      );

      await interaction.followUp({ components: [resultContainer], files: [resultAttachment], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.followUp({ embeds: [errorEmbed('У одного из участников не хватило монет на момент принятия. Дуэль отменена, ставки не списаны.')] });
        return;
      }
      if (err instanceof DuelNotPendingError) {
        await interaction.followUp({ embeds: [errorEmbed('Эта дуэль уже была обработана.')] });
        return;
      }
      interaction.client.logger?.error?.('[/duel accept]', err);
      await interaction.followUp({ embeds: [errorEmbed()] });
    }
  },
};

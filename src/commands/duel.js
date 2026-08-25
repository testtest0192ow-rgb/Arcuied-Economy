const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const { duelService, DuelNotPendingError } = require('../services/DuelService');
const { transactionService, InsufficientFundsError } = require('../services/TransactionService');
const { generateDuelGif } = require('../services/AnimatedGifService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Вызвать другого участника на дуэль')
    .addUserOption((opt) => opt.setName('user').setDescription('Кого вызвать').setRequired(true))
    .addIntegerOption((opt) => opt.setName('amount').setDescription('Ставка').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const opponent = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (opponent.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя вызвать на дуэль самого себя.')], ephemeral: true });
      return;
    }
    if (opponent.bot) {
      await interaction.reply({ embeds: [errorEmbed('Нельзя вызвать бота на дуэль.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const challengerWallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (challengerWallet.coins < amount) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет для такой ставки. Баланс: **${challengerWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    const duel = await duelService.createDuel({
      guildId: interaction.guildId,
      challengerId: interaction.user.id,
      opponentId: opponent.id,
      amount,
    });

    const embed = baseEmbed({
      title: 'Дуэль',
      description: `${DIVIDER}\nСтавка: **${amount.toLocaleString('ru-RU')}** ${COIN_ICON} с каждой стороны`,
    }).addFields(
      { name: 'Слева', value: `${interaction.user}`, inline: true },
      { name: 'VS', value: '⚔️', inline: true },
      { name: 'Справа', value: `${opponent}`, inline: true }
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel:accept:${duel._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`duel:decline:${duel._id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`duel:cancel:${duel._id}`).setLabel('Отменить').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ content: `${opponent}`, embeds: [embed], components: [row] });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: (i) => [opponent.id, interaction.user.id].includes(i.user.id),
      });
    } catch {
      await duelService.expireDuel(duel._id);
      await interaction.editReply({ content: null, embeds: [errorEmbed('Время на ответ истекло. Дуэль отменена.')], components: [] });
      return;
    }

    const action = choice.customId.split(':')[1];

    if (action === 'cancel') {
      if (choice.user.id !== interaction.user.id) {
        await choice.reply({ content: 'Только тот, кто вызвал на дуэль, может её отменить.', ephemeral: true });
        return;
      }
      await duelService.cancelDuel(duel._id);
      await choice.update({ content: null, embeds: [baseEmbed({ title: 'Дуэль отменена', description: `${DIVIDER}\n${interaction.user} отменил вызов.` })], components: [] });
      return;
    }

    if (choice.user.id !== opponent.id) {
      await choice.reply({ content: 'Только вызванный участник может принять или отклонить дуэль.', ephemeral: true });
      return;
    }

    if (action === 'decline') {
      await duelService.declineDuel(duel._id);
      await choice.update({ content: null, embeds: [baseEmbed({ title: 'Дуэль отклонена', description: `${DIVIDER}\n${opponent} отклонил вызов.` })], components: [] });
      return;
    }

    // action === 'accept'
    // Порядок фиксирован везде: слева — challenger (тот, кто вызвал), справа — opponent
    // (кого вызвали). Гифка дуэли ожидает именно такой порядок сторон.
    const startedEmbed = baseEmbed({
      title: 'Дуэль началась',
      description: `${DIVIDER}\nСтавка: **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}`,
    }).addFields(
      { name: 'Слева', value: `${interaction.user}`, inline: true },
      { name: 'VS', value: '⚔️', inline: true },
      { name: 'Справа', value: `${opponent}`, inline: true }
    );

    // Если в .env задана своя гифка — используем её (приоритет над сгенерированной).
    // Иначе рисуем свою собственную анимацию сами — оригинальную, без чужих ассетов.
    const customDuelGifUrl = config.assets.pickRandomGif(config.assets.duelGifUrls);
    let files = [];
    if (customDuelGifUrl) {
      startedEmbed.setImage(customDuelGifUrl);
    } else {
      const gifBuffer = generateDuelGif();
      const attachment = new AttachmentBuilder(gifBuffer, { name: 'duel.gif' });
      startedEmbed.setImage('attachment://duel.gif');
      files = [attachment];
    }
    await choice.update({ content: null, embeds: [startedEmbed], components: [], files });

    try {
      const { winnerId, loserId, pot } = await duelService.acceptDuel(duel._id);
      const winnerUser = winnerId === interaction.user.id ? interaction.user : opponent;
      const loserUser = loserId === interaction.user.id ? interaction.user : opponent;

      const resultEmbed = baseEmbed({
        title: 'Дуэль завершена',
        description: `${DIVIDER}\n🏆 ${winnerUser} побеждает и забирает **${pot.toLocaleString('ru-RU')}** ${COIN_ICON}\n${loserUser} проигрывает ставку.`,
        color: config.colors.success,
      });
      await interaction.followUp({ embeds: [resultEmbed] });
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

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { duelService, DuelNotPendingError, DuelAlreadyTakenError } = require('../services/DuelService');
const { transactionService, InsufficientFundsError } = require('../services/TransactionService');
const { questService } = require('../services/QuestService');
const { buildDiceDuelCard } = require('../services/DiceDuelCardService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const DICE_FACES = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
const formatRoll = (values) => values.map((v) => DICE_FACES[v] || v).join(' ');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Открыть кости на ставку — первый, кто примет, сыграет 2 кубика против 2 кубиков')
    .addIntegerOption((opt) => opt.setName('ставка').setDescription('Ставка').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const amount = interaction.options.getInteger('ставка');
    await interaction.deferReply();

    const challengerWallet = await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    if (challengerWallet.coins < amount) {
      await interaction.editReply({ embeds: [errorEmbed(`Недостаточно монет для такой ставки. Баланс: **${challengerWallet.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`)] });
      return;
    }

    const duel = await duelService.createDuel({
      guildId: interaction.guildId,
      challengerId: interaction.user.id,
      amount,
      mode: 'dice',
    });

    const embed = baseEmbed({
      title: 'Кости',
      description: `${DIVIDER}\n${interaction.user} предлагает сыграть в кости, ставка **${amount.toLocaleString('ru-RU')}** ${COIN_ICON}`,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dice:accept:${duel._id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dice:cancel:${duel._id}`).setLabel('Отменить').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    let choice;
    try {
      choice = await message.awaitMessageComponent({ componentType: ComponentType.Button, time: 120_000 });
    } catch {
      await duelService.expireDuel(duel._id);
      await interaction.editReply({ embeds: [errorEmbed('Никто не принял вызов вовремя. Игра отменена.')], components: [] });
      return;
    }

    const action = choice.customId.split(':')[1];

    if (action === 'cancel') {
      if (choice.user.id !== interaction.user.id) {
        await choice.reply({ content: 'Только тот, кто предложил игру, может её отменить.', ephemeral: true });
        return;
      }
      await duelService.cancelDuel(duel._id);
      await choice.update({ embeds: [baseEmbed({ title: 'Игра отменена', description: `${DIVIDER}\n${interaction.user} отменил предложение.` })], components: [] });
      return;
    }

    let claimedDuel;
    try {
      claimedDuel = await duelService.claimDuel(duel._id, choice.user.id);
    } catch (err) {
      if (err instanceof DuelAlreadyTakenError) {
        const reason = choice.user.id === interaction.user.id
          ? 'Нельзя принять свою же игру.'
          : 'Кто-то уже принял эту игру раньше вас.';
        await choice.reply({ embeds: [errorEmbed(reason)], ephemeral: true });
        return;
      }
      throw err;
    }

    const opponent = choice.user;
    await choice.update({
      embeds: [baseEmbed({ title: 'Кости брошены...', description: `${DIVIDER}\n${interaction.user} vs ${opponent}` })],
      components: [],
    });

    try {
      const { winnerId, pot, rolls } = await duelService.acceptDuel(claimedDuel._id);
      await questService.increment(interaction.guild, interaction.user.id, 'activity', 1).catch(() => {});
      await questService.increment(interaction.guild, opponent.id, 'activity', 1).catch(() => {});
      const winnerUser = winnerId === interaction.user.id ? interaction.user : opponent;

      const resultEmbed = baseEmbed({
        title: `Победа ${winnerUser.username}`,
        description: `${DIVIDER}\n🏆 ${winnerUser} забирает **${pot.toLocaleString('ru-RU')}** ${COIN_ICON}`,
        color: config.colors.success,
      });

      const cardAttachment = await buildDiceDuelCard({
        leftUser: { username: interaction.user.username, avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) },
        rightUser: { username: opponent.username, avatarURL: opponent.displayAvatarURL({ extension: 'png', size: 128 }) },
        leftRolls: rolls.challenger,
        rightRolls: rolls.opponent,
        leftSum: rolls.challengerSum,
        rightSum: rolls.opponentSum,
      });
      resultEmbed.setImage('attachment://dice-duel.png');

      await interaction.followUp({ embeds: [resultEmbed], files: [cardAttachment] });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.followUp({ embeds: [errorEmbed('У одного из участников не хватило монет на момент принятия. Игра отменена, ставки не списаны.')] });
        return;
      }
      if (err instanceof DuelNotPendingError) {
        await interaction.followUp({ embeds: [errorEmbed('Эта игра уже была обработана.')] });
        return;
      }
      interaction.client.logger?.error?.('[/dice accept]', err);
      await interaction.followUp({ embeds: [errorEmbed()] });
    }
  },
};

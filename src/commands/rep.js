const { SlashCommandBuilder } = require('discord.js');
const Wallet = require('../models/Wallet');
const { transactionService } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');
const config = require('../config');

const REP_COOLDOWN_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Выдать репутацию пользователю')
    .addUserOption((opt) => opt.setName('user').setDescription('Кому').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply();

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Нельзя выдать репутацию самому себе.')] });
      return;
    }
    if (targetUser.bot) {
      await interaction.editReply({ embeds: [errorEmbed('Нельзя выдать репутацию боту.')] });
      return;
    }

    await transactionService.getOrCreateWallet(interaction.guildId, interaction.user.id);
    await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);

    const cutoff = new Date(Date.now() - REP_COOLDOWN_HOURS * 60 * 60 * 1000);

    // Atomic: only proceeds if the giver's cooldown has passed — prevents rep-farming via double-click.
    const giverWallet = await Wallet.findOneAndUpdate(
      { guildId: interaction.guildId, userId: interaction.user.id, $or: [{ lastRepGivenAt: null }, { lastRepGivenAt: { $lte: cutoff } }] },
      { $set: { lastRepGivenAt: new Date() } },
      { new: true }
    );

    if (!giverWallet) {
      const current = await Wallet.findOne({ guildId: interaction.guildId, userId: interaction.user.id }).lean();
      const nextAt = new Date(new Date(current.lastRepGivenAt).getTime() + REP_COOLDOWN_HOURS * 60 * 60 * 1000);
      const hoursLeft = Math.ceil((nextAt.getTime() - Date.now()) / (60 * 60 * 1000));
      await interaction.editReply({ embeds: [errorEmbed(`Можно выдавать репутацию раз в ${REP_COOLDOWN_HOURS} ч. Возвращайтесь через ~${hoursLeft} ч.`)] });
      return;
    }

    const targetWallet = await Wallet.findOneAndUpdate(
      { guildId: interaction.guildId, userId: targetUser.id },
      { $inc: { reputation: 1 } },
      { new: true, upsert: true }
    );

    await interaction.editReply({
      embeds: [
        baseEmbed({
          title: 'Репутация выдана',
          description: `${targetUser} теперь имеет **${targetWallet.reputation}** репутации.`,
          color: config.colors.success,
        }),
      ],
    });
  },
};

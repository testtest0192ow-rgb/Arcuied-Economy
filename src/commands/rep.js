const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { appEmoji } = require('../utils/appEmoji');
const Wallet = require('../models/Wallet');
const { transactionService } = require('../services/TransactionService');
const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

const REP_COOLDOWN_HOURS = 24;

function repContainer({ heading, body, color = config.colors.success }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${appEmoji('reputation')}Репутация\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

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

    // Атомарно: проходит, только если у выдающего кулдаун истёк — защита от накрутки двойным кликом.
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
      components: [repContainer({ heading: 'Репутация выдана', body: `${targetUser} теперь имеет **${targetWallet.reputation}** репутации.` })],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};

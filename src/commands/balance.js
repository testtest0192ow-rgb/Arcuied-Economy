const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Посмотреть баланс')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей баланс посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const wallet = await transactionService.getOrCreateWallet(interaction.guildId, targetUser.id);

      // Components V2 — настоящий Separator (тип 14) вместо картинки-заглушки или
      // текстового "-#────". ВАЖНО: с флагом IsComponentsV2 в этом сообщении нельзя
      // использовать embeds — весь контент идёт через компоненты.
      const header = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Текущий баланс — ${targetUser.username}**`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
        );

      const container = new ContainerBuilder()
        .setAccentColor(config.colors.primary)
        .addSectionComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${COIN_ICON} **Монеты**\n\`\`\`${wallet.coins.toLocaleString('ru-RU')}\`\`\``)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${DONATE_ICON} **Донат-монеты**\n\`\`\`${wallet.donateCoins.toLocaleString('ru-RU')}\`\`\``)
        );

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      interaction.client.logger?.error?.('[/balance]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

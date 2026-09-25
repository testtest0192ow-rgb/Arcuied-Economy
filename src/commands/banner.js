const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Показать баннер профиля')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей баннер').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const fullUser = await interaction.client.users.fetch(targetUser.id, { force: true });

    if (!fullUser.banner) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning).setDescription(`У ${fullUser.username} нет установленного баннера.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`Баннер — ${fullUser.username}`)
      .setImage(fullUser.bannerURL({ extension: 'png', size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Показать аватар')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей аватар').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`Аватар — ${target.username}`)
      .setImage(target.displayAvatarURL({ extension: 'png', size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  },
};

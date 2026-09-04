const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

const PAGE_SIZE = 25;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inrole')
    .setDescription('Показать участников с ролью')
    .addRoleOption((opt) => opt.setName('role').setDescription('Роль').setRequired(true)),

  async execute(interaction) {
    const role = interaction.options.getRole('role');
    await interaction.deferReply();

    const members = await interaction.guild.members.fetch();
    const withRole = members.filter((m) => m.roles.cache.has(role.id));

    if (withRole.size === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning).setDescription(`Никого нет с ролью ${role}.`)],
      });
      return;
    }

    const names = [...withRole.values()].map((m) => m.user.username);
    const shown = names.slice(0, PAGE_SIZE);
    const remaining = names.length - shown.length;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`Участники с ролью ${role.name}`)
      .setDescription(`Всего: **${withRole.size}**\n\n${shown.map((n) => `• ${n}`).join('\n')}` + (remaining > 0 ? `\n\n...и ещё ${remaining}` : ''));

    await interaction.editReply({ embeds: [embed] });
  },
};

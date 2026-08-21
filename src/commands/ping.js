const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Проверить, что бот онлайн'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Понг...', ephemeral: true, fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Понг! Задержка: **${latency}ms** · API: **${Math.round(interaction.client.ws.ping)}ms**`);
  },
};

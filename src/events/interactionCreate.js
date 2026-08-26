const { errorEmbed } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        const [namespace] = interaction.customId.split(':');
        const command = interaction.client.commands.get(namespace);
        if (command?.handleButton) {
          await command.handleButton(interaction);
        }
      }
    } catch (err) {
      interaction.client.logger?.error?.('[interactionCreate]', err);
      const payload = { embeds: [errorEmbed()], components: [] };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply({ ...payload, ephemeral: true });
        }
      } catch {
        // Interaction may already be invalid (expired token) — nothing more we can do.
      }
    }
  },
};

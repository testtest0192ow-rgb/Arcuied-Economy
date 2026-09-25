const { MessageFlags } = require('discord.js');
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

      if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction);
        }
        return;
      }

      if (interaction.isButton()) {
        const [namespace] = interaction.customId.split(':');
        const command = interaction.client.commands.get(namespace);
        if (command?.handleButton) {
          await command.handleButton(interaction);
        }
        return;
      }

      if (interaction.isModalSubmit()) {
        const [namespace] = interaction.customId.split(':');
        const command = interaction.client.commands.get(namespace);
        if (command?.handleModal) {
          await command.handleModal(interaction);
        }
      }
    } catch (err) {
      interaction.client.logger?.error?.('[interactionCreate]', err);
      if (interaction.isAutocomplete()) return; // Can't send an embed reply to an autocomplete interaction.
      const payload = { embeds: [errorEmbed()], components: [] };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
        }
      } catch {
        // Interaction may already be invalid (expired token) — nothing more we can do.
      }
    }
  },
};

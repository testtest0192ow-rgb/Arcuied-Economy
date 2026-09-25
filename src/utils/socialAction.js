const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { fetchAnimeGif } = require('../services/AnimeGifService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');

/**
 * @param {object} opts
 * @param {string} opts.name - slash command name, e.g. "hug"
 * @param {string} opts.description - shown in Discord's command list
 * @param {string} opts.category - nekos.best API category, e.g. "hug"
 * @param {(actor: string, target: string) => string} opts.message - builds the embed line
 * @param {string} [opts.selfMessage] - shown if the user targets themselves (null = block it like /kiss)
 */
function createSocialActionCommand({ name, description, category, message, selfMessage = null }) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .addUserOption((opt) => opt.setName('user').setDescription('Кого').setRequired(true)),

    async execute(interaction) {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === interaction.user.id) {
        if (!selfMessage) {
          await interaction.reply({ embeds: [errorEmbed('Придётся найти кого-то другого.')], flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ embeds: [baseEmbed({ description: `${DIVIDER}\n${selfMessage.replace('{user}', `${interaction.user}`)}` })] });
        return;
      }

      await interaction.deferReply();
      const gifUrl = await fetchAnimeGif(category);

      const embed = baseEmbed({
        description: `${DIVIDER}\n${message(`${interaction.user}`, `${targetUser}`)}`,
      });
      if (gifUrl) embed.setImage(gifUrl);

      await interaction.editReply({ embeds: [embed] });
    },
  };
}

module.exports = { createSocialActionCommand };

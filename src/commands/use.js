const { SlashCommandBuilder } = require('discord.js');
const { itemService, ItemNotFoundError, ItemNotUsableError, NotEnoughItemsError } = require('../services/ItemService');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Использовать предмет из инвентаря')
    .addStringOption((opt) => opt.setName('item').setDescription('Ключ предмета').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const inventory = await itemService.getInventory(interaction.guildId, interaction.user.id);
    const filtered = inventory.filter((e) => e.itemKey.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((e) => ({ name: `${e.itemKey} (у вас: ${e.quantity})`, value: e.itemKey })));
  },

  async execute(interaction) {
    const itemKey = interaction.options.getString('item');
    await interaction.deferReply({ ephemeral: true });

    try {
      const { item } = await itemService.useItem({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        itemKey,
      });

      const embed = baseEmbed({
        title: 'Предмет использован',
        description: `${DIVIDER}\n**${item.name}** применён.`,
        color: config.colors.success,
      });
      await interaction.editReply({ embeds: [embed] });
      // TODO: применить реальный игровой эффект предмета (бустеры и т.д.) — по мере добавления таких предметов.
    } catch (err) {
      if (err instanceof ItemNotFoundError) {
        await interaction.editReply({ embeds: [errorEmbed('Такого предмета не существует.')] });
        return;
      }
      if (err instanceof ItemNotUsableError) {
        await interaction.editReply({ embeds: [errorEmbed('Этот предмет нельзя использовать.')] });
        return;
      }
      if (err instanceof NotEnoughItemsError) {
        await interaction.editReply({ embeds: [errorEmbed('У вас нет этого предмета.')] });
        return;
      }
      interaction.client.logger?.error?.('[/use]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

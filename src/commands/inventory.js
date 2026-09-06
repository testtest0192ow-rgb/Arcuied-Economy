const { SlashCommandBuilder } = require('discord.js');
const { itemService } = require('../services/ItemService');
const Item = require('../models/Item');
const { baseEmbed, errorEmbed, DIVIDER } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Посмотреть инвентарь')
    .addUserOption((opt) => opt.setName('user').setDescription('Чей инвентарь посмотреть').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const entries = await itemService.getInventory(interaction.guildId, targetUser.id);
      if (entries.length === 0) {
        await interaction.editReply({
          embeds: [baseEmbed({ title: `Инвентарь — ${targetUser.username}`, description: `Пусто.` })],
        });
        return;
      }

      const items = await Item.find({
        guildId: interaction.guildId,
        key: { $in: entries.map((e) => e.itemKey) },
      }).lean();
      const itemByKey = Object.fromEntries(items.map((i) => [i.key, i]));

      const byCategory = {};
      for (const entry of entries) {
        const item = itemByKey[entry.itemKey];
        const category = item?.category || 'item';
        byCategory[category] = byCategory[category] || [];
        byCategory[category].push(`**${item?.name || entry.itemKey}** × ${entry.quantity}`);
      }

      const description =
        `` +
        Object.entries(byCategory)
          .map(([category, lines]) => `__${category}__\n${lines.join('\n')}`)
          .join('\n\n');

      await interaction.editReply({ embeds: [baseEmbed({ title: `Инвентарь — ${targetUser.username}`, description })] });
    } catch (err) {
      interaction.client.logger?.error?.('[/inventory]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

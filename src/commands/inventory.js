const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { itemService } = require('../services/ItemService');
const Item = require('../models/Item');
const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

function inventoryContainer({ heading, body }) {
  const container = new ContainerBuilder().setAccentColor(config.colors.primary);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Инвентарь\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

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
          components: [inventoryContainer({ heading: targetUser.username, body: 'Пусто.' })],
          flags: MessageFlags.IsComponentsV2,
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

      const body = Object.entries(byCategory)
        .map(([category, lines]) => `__${category}__\n${lines.join('\n')}`)
        .join('\n\n');

      await interaction.editReply({
        components: [inventoryContainer({ heading: targetUser.username, body })],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/inventory]', err);
      await interaction.editReply({ embeds: [errorEmbed()] });
    }
  },
};

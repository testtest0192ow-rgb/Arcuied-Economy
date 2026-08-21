const { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } = require('discord.js');
const { itemService } = require('../services/ItemService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

const CATEGORY_LABELS = {
  cosmetic: 'Косметика',
  title: 'Титулы',
  case: 'Кейсы',
  item: 'Предметы',
  booster: 'Бустеры',
  special: 'Специальные',
  server: 'Серверные товары',
};

const SORT_OPTIONS = [
  { value: 'popular', label: 'Сначала популярные', emoji: config.assets.sortIcons.popular },
  { value: 'cheap', label: 'Сначала дешёвые', emoji: config.assets.sortIcons.cheap },
  { value: 'expensive', label: 'Сначала дорогие', emoji: config.assets.sortIcons.expensive },
  { value: 'new', label: 'Сначала новые', emoji: config.assets.sortIcons.new },
];

const SORT_COMPARATORS = {
  popular: (a, b) => (b.timesPurchased || 0) - (a.timesPurchased || 0),
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
};

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function sortItems(items, sort) {
  return [...items].sort(SORT_COMPARATORS[sort] || SORT_COMPARATORS.popular);
}

function renderCategory(items, category, sort) {
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label || '';
  if (items.length === 0) {
    return baseEmbed({
      title: CATEGORY_LABELS[category] || category,
      description: `${DIVIDER}\nВ этой категории пока пусто.`,
    });
  }
  const lines = sortItems(items, sort).map(
    (i) => `**${i.name}**\n${i.description || '-# без описания'}\nЦена: **${i.price.toLocaleString('ru-RU')}** ${icon(i.currency)} · \`/buy item:${i.key}\``
  );
  return baseEmbed({
    title: CATEGORY_LABELS[category] || category,
    description: `${DIVIDER}\n${lines.join('\n\n')}\n\n-# ${sortLabel}`,
  });
}

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Открыть магазин'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const allItems = await itemService.listShop(interaction.guildId);
      if (allItems.length === 0) {
        await interaction.editReply({ embeds: [baseEmbed({ title: 'Магазин', description: `${DIVIDER}\nМагазин пока пуст.` })] });
        return;
      }

      const categories = [...new Set(allItems.map((i) => i.category))];
      let currentCategory = categories[0];
      let currentSort = 'popular';

      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('shop:category')
        .setPlaceholder('Категория')
        .addOptions(categories.map((c) => ({ label: CATEGORY_LABELS[c] || c, value: c, default: c === currentCategory })));

      const sortMenu = new StringSelectMenuBuilder()
        .setCustomId('shop:sort')
        .setPlaceholder('Сортировка')
        .addOptions(
          SORT_OPTIONS.map((o) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(o.label)
              .setValue(o.value)
              .setEmoji(o.emoji)
              .setDefault(o.value === currentSort)
          )
        );

      const rows = [new ActionRowBuilder().addComponents(categoryMenu), new ActionRowBuilder().addComponents(sortMenu)];

      const message = await interaction.editReply({
        embeds: [renderCategory(allItems.filter((i) => i.category === currentCategory), currentCategory, currentSort)],
        components: rows,
      });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000,
        filter: (i) => i.user.id === interaction.user.id,
      });

      collector.on('collect', async (select) => {
        if (select.customId === 'shop:category') {
          currentCategory = select.values[0];
        } else if (select.customId === 'shop:sort') {
          currentSort = select.values[0];
        }

        categoryMenu.options.forEach((opt) => opt.setDefault(opt.data.value === currentCategory));
        sortMenu.options.forEach((opt) => opt.setDefault(opt.data.value === currentSort));

        await select.update({
          embeds: [renderCategory(allItems.filter((i) => i.category === currentCategory), currentCategory, currentSort)],
          components: rows,
        });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/shop]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

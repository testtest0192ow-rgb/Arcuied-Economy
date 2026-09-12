const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { itemService, ItemNotFoundError } = require('../services/ItemService');
const { transactionService, InsufficientFundsError, DuplicateActionError } = require('../services/TransactionService');
const { roleAutomationService } = require('../services/RoleAutomationService');
const Item = require('../models/Item');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
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
  { value: 'popular', label: 'Сначала популярные', emoji: config.sortIcons.popular },
  { value: 'cheap', label: 'Сначала дешёвые', emoji: config.sortIcons.cheap },
  { value: 'expensive', label: 'Сначала дорогие', emoji: config.sortIcons.expensive },
  { value: 'new', label: 'Сначала новые', emoji: config.sortIcons.new },
];

const SORT_COMPARATORS = {
  popular: (a, b) => (b.timesPurchased || 0) - (a.timesPurchased || 0),
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
};

// Discord позволяет максимум 5 кнопок в ряду — быстрая покупка доступна только
// для первых MAX_QUICK_BUY товаров текущей страницы, остальные — через /buy item:.
const MAX_QUICK_BUY = 5;

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function sortItems(items, sort) {
  return [...items].sort(SORT_COMPARATORS[sort] || SORT_COMPARATORS.popular);
}

function renderCategory(items, category, sort) {
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label || '';
  const heading = CATEGORY_LABELS[category] || category;
  const container = new ContainerBuilder().setAccentColor(config.colors.primary);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Магазин\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (items.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('В этой категории пока пусто.'));
    return container;
  }

  const sorted = sortItems(items, sort);
  const lines = sorted.map(
    (i) => `🛒 **${i.name}**\n${i.description || '-# без описания'}\nЦена: **${i.price.toLocaleString('ru-RU')}** ${icon(i.currency)} · \`/buy item:${i.key}\``
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${lines.join('\n\n')}\n\n-# ${sortLabel}`));
  return container;
}

function buildBuyButtonsRow(items, sort) {
  const sorted = sortItems(items, sort).slice(0, MAX_QUICK_BUY);
  if (sorted.length === 0) return null;
  const row = new ActionRowBuilder();
  for (const item of sorted) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop:buy:${item.key}`)
        .setLabel(`Купить: ${item.name}`.slice(0, 80))
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return row;
}

async function handleQuickBuy(interaction, itemKey) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const idempotencyKey = `shop-quickbuy:${interaction.id}`;
    const { wallet, item, totalPrice } = await itemService.buyItem({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      itemKey,
      quantity: 1,
      idempotencyKey,
    });

    let body =
      `**${item.name}**\n` +
      `Списано: **${totalPrice.toLocaleString('ru-RU')}** ${icon(item.currency)}\n\n` +
      `Баланс: **${wallet[item.currency].toLocaleString('ru-RU')}** ${icon(item.currency)}`;
    let color = config.colors.success;

    if (item.category === 'role') {
      try {
        const role = await roleAutomationService.ensureRole({
          guild: interaction.guild,
          roleId: item.roleId,
          name: item.discordRoleName || item.name,
          color: item.discordRoleColor,
        });
        if (!item.roleId || item.roleId !== role.id) {
          await Item.updateOne({ guildId: interaction.guildId, key: itemKey }, { $set: { roleId: role.id } });
        }
        await interaction.member.roles.add(role);
        body += `\n\n✅ Роль ${role} выдана.`;
      } catch (roleErr) {
        interaction.client.logger?.error?.('[/shop quickbuy role grant]', roleErr);
        body += `\n\n⚠️ Монеты списаны, но роль выдать не удалось (не хватает прав у бота или роль выше в иерархии).`;
        color = config.colors.warning;
      }
    }

    const container = new ContainerBuilder().setAccentColor(color);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Покупка\n**Готово**'));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    if (err instanceof ItemNotFoundError) {
      await interaction.editReply({ embeds: [errorEmbed('Предмет больше не доступен в магазине.')] });
      return;
    }
    if (err instanceof InsufficientFundsError) {
      await interaction.editReply({ embeds: [errorEmbed('Недостаточно средств для этой покупки.')] });
      return;
    }
    if (err instanceof DuplicateActionError) {
      await interaction.editReply({ embeds: [errorEmbed('Эта покупка уже была совершена.')] });
      return;
    }
    interaction.client.logger?.error?.('[/shop quickbuy]', err);
    await interaction.editReply({ embeds: [errorEmbed()] });
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Открыть магазин'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const allItems = await itemService.listShop(interaction.guildId);
      if (allItems.length === 0) {
        const empty = new ContainerBuilder().setAccentColor(config.colors.primary);
        empty.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Магазин\n**Магазин пока пуст.**'));
        await interaction.editReply({ components: [empty], flags: MessageFlags.IsComponentsV2 });
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

      function buildRows() {
        const menuRows = [new ActionRowBuilder().addComponents(categoryMenu), new ActionRowBuilder().addComponents(sortMenu)];
        const currentItems = allItems.filter((i) => i.category === currentCategory);
        const buyRow = buildBuyButtonsRow(currentItems, currentSort);
        return buyRow ? [...menuRows, buyRow] : menuRows;
      }

      const message = await interaction.editReply({
        components: [renderCategory(allItems.filter((i) => i.category === currentCategory), currentCategory, currentSort), ...buildRows()],
        flags: MessageFlags.IsComponentsV2,
      });

      const collector = message.createMessageComponentCollector({
        time: 120_000,
        filter: (i) => i.user.id === interaction.user.id,
      });

      collector.on('collect', async (i) => {
        if (i.isButton() && i.customId.startsWith('shop:buy:')) {
          const itemKey = i.customId.split(':')[2];
          await handleQuickBuy(i, itemKey);
          return;
        }

        if (i.isStringSelectMenu()) {
          if (i.customId === 'shop:category') {
            currentCategory = i.values[0];
          } else if (i.customId === 'shop:sort') {
            currentSort = i.values[0];
          }

          categoryMenu.options.forEach((opt) => opt.setDefault(opt.data.value === currentCategory));
          sortMenu.options.forEach((opt) => opt.setDefault(opt.data.value === currentSort));

          await i.update({
            components: [renderCategory(allItems.filter((it) => it.category === currentCategory), currentCategory, currentSort), ...buildRows()],
            flags: MessageFlags.IsComponentsV2,
          });
        }
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

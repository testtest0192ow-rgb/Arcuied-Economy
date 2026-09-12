const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const {
  itemService,
  ItemNotSellableError,
  NotEnoughItemsError,
} = require('../services/ItemService');
const { DuplicateActionError } = require('../services/TransactionService');
const { errorEmbed, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
}

function sellContainer({ heading, body, color = config.colors.primary }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Продажа\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Продать предмет')
    .addStringOption((opt) => opt.setName('item').setDescription('Ключ предмета').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('Количество').setRequired(false).setMinValue(1)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const inventory = await itemService.getInventory(interaction.guildId, interaction.user.id);
    const filtered = inventory.filter((e) => e.itemKey.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((e) => ({ name: `${e.itemKey} (у вас: ${e.quantity})`, value: e.itemKey })));
  },

  async execute(interaction) {
    const itemKey = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity') || 1;

    await interaction.deferReply();

    let item;
    try {
      item = await itemService.getItem(interaction.guildId, itemKey);
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Такого предмета не существует.')] });
      return;
    }
    if (!item.sellable) {
      await interaction.editReply({ embeds: [errorEmbed('Этот предмет нельзя продать.')] });
      return;
    }

    const refund = Math.floor(item.price * item.sellRatio * quantity);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sell:confirm').setLabel('Продать').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sell:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );
    const confirmContainer = sellContainer({
      heading: 'Подтвердите продажу',
      body: `**${item.name}** × ${quantity}\nВы получите: **${refund.toLocaleString('ru-RU')}** ${icon(item.currency)}`,
    });
    const message = await interaction.editReply({ components: [confirmContainer, row], flags: MessageFlags.IsComponentsV2 });

    let choice;
    try {
      choice = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.user.id === interaction.user.id,
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Время подтверждения истекло.')], components: [] });
      return;
    }

    if (choice.customId === 'sell:cancel') {
      const cancelledContainer = sellContainer({ heading: 'Отменено', body: 'Продажа не выполнена.', color: config.colors.danger });
      await choice.update({ components: [cancelledContainer], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    try {
      const idempotencyKey = `sell:${interaction.id}`;
      const { wallet } = await itemService.sellItem({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        itemKey,
        quantity,
        idempotencyKey,
      });

      const doneContainer = sellContainer({
        heading: 'Продано',
        body:
          `**${item.name}** × ${quantity}\nПолучено: **${refund.toLocaleString('ru-RU')}** ${icon(item.currency)}\n\n` +
          `Баланс: **${wallet[item.currency].toLocaleString('ru-RU')}** ${icon(item.currency)}`,
        color: config.colors.success,
      });
      await choice.update({ components: [doneContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      if (err instanceof NotEnoughItemsError) {
        await choice.update({ embeds: [errorEmbed('У вас недостаточно этого предмета.')], components: [] });
        return;
      }
      if (err instanceof ItemNotSellableError) {
        await choice.update({ embeds: [errorEmbed('Этот предмет нельзя продать.')], components: [] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await choice.update({ embeds: [errorEmbed('Эта продажа уже была выполнена.')], components: [] });
        return;
      }
      interaction.client.logger?.error?.('[/sell]', err);
      await choice.update({ embeds: [errorEmbed()], components: [] });
    }
  },
};

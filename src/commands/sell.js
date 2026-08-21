const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const {
  itemService,
  ItemNotSellableError,
  NotEnoughItemsError,
} = require('../services/ItemService');
const { DuplicateActionError } = require('../services/TransactionService');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON, DONATE_ICON } = require('../utils/embeds');
const config = require('../config');

function icon(currency) {
  return currency === 'donateCoins' ? DONATE_ICON : COIN_ICON;
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

    await interaction.deferReply({ ephemeral: true });

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
    const confirmEmbed = baseEmbed({
      title: 'Продажа',
      description: `${DIVIDER}\n**${item.name}** × ${quantity}\nВы получите: **${refund.toLocaleString('ru-RU')}** ${icon(item.currency)}`,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sell:confirm').setLabel('Продать').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sell:cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
    );
    const message = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

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
      await choice.update({ embeds: [baseEmbed({ title: 'Отменено', description: `${DIVIDER}\nПродажа не выполнена.` })], components: [] });
      return;
    }

    await choice.update({ components: [] });

    try {
      const idempotencyKey = `sell:${interaction.id}`;
      const { wallet } = await itemService.sellItem({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        itemKey,
        quantity,
        idempotencyKey,
      });

      const embed = baseEmbed({
        title: 'Продано',
        description:
          `${DIVIDER}\n**${item.name}** × ${quantity}\nПолучено: **${refund.toLocaleString('ru-RU')}** ${icon(item.currency)}\n\n` +
          `Баланс: **${wallet[item.currency].toLocaleString('ru-RU')}** ${icon(item.currency)}`,
        color: config.colors.success,
      });
      await interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      if (err instanceof NotEnoughItemsError) {
        await interaction.editReply({ embeds: [errorEmbed('У вас недостаточно этого предмета.')], components: [] });
        return;
      }
      if (err instanceof ItemNotSellableError) {
        await interaction.editReply({ embeds: [errorEmbed('Этот предмет нельзя продать.')], components: [] });
        return;
      }
      if (err instanceof DuplicateActionError) {
        await interaction.editReply({ embeds: [errorEmbed('Эта продажа уже была выполнена.')], components: [] });
        return;
      }
      interaction.client.logger?.error?.('[/sell]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

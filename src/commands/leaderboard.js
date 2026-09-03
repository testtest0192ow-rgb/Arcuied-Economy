const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require('discord.js');
const Wallet = require('../models/Wallet');
const { baseEmbed, errorEmbed, DIVIDER, COIN_ICON } = require('../utils/embeds');

const MEDALS = ['🥇', '🥈', '🥉'];

async function renderCoinsLeaderboard(guildId, client) {
  const top = await Wallet.find({ guildId }).sort({ coins: -1 }).limit(10).lean();
  if (top.length === 0) {
    return baseEmbed({ title: 'Рейтинг — Монеты', description: `Пока никто не заработал монет.` });
  }
  const lines = await Promise.all(
    top.map(async (w, index) => {
      const user = await client.users.fetch(w.userId).catch(() => null);
      const place = MEDALS[index] || `**${index + 1}.**`;
      return `${place} ${user ? user.username : w.userId} — **${w.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`;
    })
  );
  return baseEmbed({ title: 'Рейтинг — Монеты', description: `${lines.join('\n')}` });
}

// Уровень, репутация, кланы, победы, игры — подключаются по мере готовности соответствующих ботов/моделей.
const CATEGORIES = {
  coins: { label: 'Монеты', render: renderCoinsLeaderboard },
};

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Открыть рейтинг сервера'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('leaderboard:category')
        .setPlaceholder('Выберите категорию')
        .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({ label: c.label, value })));
      const row = new ActionRowBuilder().addComponents(menu);

      const embed = await CATEGORIES.coins.render(interaction.guildId, interaction.client);
      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000,
        filter: (i) => i.user.id === interaction.user.id,
      });

      collector.on('collect', async (select) => {
        const category = CATEGORIES[select.values[0]];
        const categoryEmbed = await category.render(interaction.guildId, interaction.client);
        await select.update({ embeds: [categoryEmbed], components: [row] });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (err) {
      interaction.client.logger?.error?.('[/leaderboard]', err);
      await interaction.editReply({ embeds: [errorEmbed()], components: [] });
    }
  },
};

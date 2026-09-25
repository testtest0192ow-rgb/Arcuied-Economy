const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { appEmoji } = require('../utils/appEmoji');
const Wallet = require('../models/Wallet');
const { errorEmbed, COIN_ICON } = require('../utils/embeds');
const config = require('../config');

const MEDALS = ['🥇', '🥈', '🥉'];

function leaderboardContainer(heading, body) {
  const container = new ContainerBuilder().setAccentColor(config.colors.primary);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${appEmoji('leaderboard')}Рейтинг сервера\n**${heading}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

async function renderNamedLines(guildId, client, docs, formatLine) {
  const lines = await Promise.all(
    docs.map(async (w, index) => {
      const user = await client.users.fetch(w.userId).catch(() => null);
      const place = MEDALS[index] || `**${index + 1}.**`;
      return `${place} ${formatLine(user ? user.username : w.userId, w)}`;
    })
  );
  return lines.join('\n');
}

async function renderCoinsLeaderboard(guildId, client) {
  const top = await Wallet.find({ guildId }).sort({ coins: -1 }).limit(10).lean();
  if (top.length === 0) return leaderboardContainer('Монеты', 'Пока никто не заработал монет.');
  const body = await renderNamedLines(guildId, client, top, (name, w) => `${name} — **${w.coins.toLocaleString('ru-RU')}** ${COIN_ICON}`);
  return leaderboardContainer('Монеты', body);
}

async function renderLevelLeaderboard(guildId, client) {
  const top = await Wallet.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10).lean();
  if (top.length === 0) return leaderboardContainer('Уровень', 'Пока никто не набрал уровень.');
  const body = await renderNamedLines(guildId, client, top, (name, w) => `${name} — уровень **${w.level || 0}** (${(w.xp || 0).toLocaleString('ru-RU')} XP)`);
  return leaderboardContainer('Уровень', body);
}

async function renderReputationLeaderboard(guildId, client) {
  const top = await Wallet.find({ guildId }).sort({ reputation: -1 }).limit(10).lean();
  if (top.length === 0) return leaderboardContainer('Репутация', 'Пока никто не получил репутацию.');
  const body = await renderNamedLines(guildId, client, top, (name, w) => `${name} — **${w.reputation || 0}** репутации`);
  return leaderboardContainer('Репутация', body);
}

// Кланы, mog battle winrate и т.д. — подключаются по мере готовности соответствующих систем.
const CATEGORIES = {
  coins: { label: 'Монеты', render: renderCoinsLeaderboard },
  level: { label: 'Уровень', render: renderLevelLeaderboard },
  reputation: { label: 'Репутация', render: renderReputationLeaderboard },
};

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Открыть рейтинг сервера'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('leaderboard:category')
        .setPlaceholder('Выберите категорию')
        .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({ label: c.label, value })));
      const row = new ActionRowBuilder().addComponents(menu);

      const container = await CATEGORIES.coins.render(interaction.guildId, interaction.client);
      const message = await interaction.editReply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000,
        filter: (i) => i.user.id === interaction.user.id,
      });

      collector.on('collect', async (select) => {
        const category = CATEGORIES[select.values[0]];
        const categoryContainer = await category.render(interaction.guildId, interaction.client);
        await select.update({ components: [categoryContainer, row], flags: MessageFlags.IsComponentsV2 });
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

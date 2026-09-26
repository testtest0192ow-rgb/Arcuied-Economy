const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');

const COLORS = Object.freeze({
  primary: 0x18181b,
  success: 0x3fb950,
  warning: 0xd29922,
  danger: 0xf85149,
  muted: 0x71717a,
});

const fmt = new Intl.NumberFormat('ru-RU');
const money = (n) => fmt.format(Math.max(0, Number(n) || 0));
const unix = (date) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;

function container(title, body, { color = COLORS.primary, eyebrow = 'ARCUEID' } = {}) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${eyebrow}\n**${title}**`));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return c;
}

function nav(customId, options) {
  return new ActionRowBuilder().addComponents(
    ...options.map((o) => new ButtonBuilder().setCustomId(`${customId}:${o.id}`).setLabel(o.label).setStyle(o.style || ButtonStyle.Secondary).setDisabled(Boolean(o.disabled)))
  );
}

function select(customId, placeholder, options) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(
      options.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description || '').setDefault(Boolean(o.default)))
    )
  );
}

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = { COLORS, money, unix, container, nav, select, V2, V2_EPHEMERAL };

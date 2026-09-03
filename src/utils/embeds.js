const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { attachDivider } = require('../services/DividerImageService');

// "-# " — синтаксис Discord для мелкого приглушённого подтекста (subtext).
// Используется в errorEmbed() и разовых сносках — НЕ трогать, это не разделитель.
const DIVIDER = '-# ' + '─'.repeat(24);
const COIN_ICON = '<:coin:1539520610261012572>';
const DONATE_ICON = '<:donatecoin:1539527983797243915>';

function baseEmbed({ title, description, color = config.colors.primary }) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
}

function errorEmbed(message = 'Произошла временная ошибка. Попробуйте ещё раз.') {
  return baseEmbed({
    title: 'Не удалось выполнить действие',
    description: `${DIVIDER}\n${message}\n\n-# Если ошибка повторяется, обратитесь в поддержку.`,
    color: config.colors.danger,
  });
}

// Теперь без текстового DIVIDER — линия рисуется картинкой через attachDivider(embed)
// в самой команде (нужно и embed, и attachment вместе, поэтому решение не здесь).
function balanceEmbed(targetUser, wallet) {
  return baseEmbed({
    title: `Текущий баланс — ${targetUser.username}`,
    description:
      `${COIN_ICON} **Монеты**\n**${wallet.coins.toLocaleString('ru-RU')}**\n\n` +
      `${DONATE_ICON} **Донат-монеты**\n**${wallet.donateCoins.toLocaleString('ru-RU')}**`,
  });
}

module.exports = { baseEmbed, errorEmbed, balanceEmbed, attachDivider, DIVIDER, COIN_ICON, DONATE_ICON };

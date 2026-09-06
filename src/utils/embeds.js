const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { attachDivider } = require('../services/DividerImageService');

// "-# " — синтаксис Discord для мелкого приглушённого подтекста (subtext).
// Используется в errorEmbed() и разовых сносках — НЕ трогать, это не разделитель.
const DIVIDER = '-# ' + '─'.repeat(24);
// Твои прежние монеты — фиксированные ID, не зависят от emojiIds.json/upload-app-emoji.
const COIN_ICON = '<:emoji_7:1539520610261012572>';
const DONATE_ICON = '<:emoji_6:1539527983797243915>';

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

// Боксы-поля вместо простого текста + аватар пользователя как миниатюра справа.
function balanceEmbed(targetUser, wallet) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`Текущий баланс — ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
    .addFields(
      { name: `${COIN_ICON} Монеты`, value: `\`\`\`${wallet.coins.toLocaleString('ru-RU')}\`\`\``, inline: false },
      { name: `${DONATE_ICON} Донат-монеты`, value: `\`\`\`${wallet.donateCoins.toLocaleString('ru-RU')}\`\`\``, inline: false },
    );
}

module.exports = { baseEmbed, errorEmbed, balanceEmbed, attachDivider, DIVIDER, COIN_ICON, DONATE_ICON };

const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const DIVIDER = '─'.repeat(24);
// Заменить на кастомные эмодзи ARCUEID, когда ассеты будут загружены на сервер разработки:
// <:coin:ID> и <:donatecoin:ID>
const COIN_ICON = '🔸';
const DONATE_ICON = '💠';

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

function balanceEmbed(targetUser, wallet) {
  return baseEmbed({
    title: `Текущий баланс — ${targetUser.username}`,
    description:
      `${DIVIDER}\n` +
      `${COIN_ICON} **Монеты**\n**${wallet.coins.toLocaleString('ru-RU')}**\n\n` +
      `${DONATE_ICON} **Донат-монеты**\n**${wallet.donateCoins.toLocaleString('ru-RU')}**`,
  });
}

module.exports = { baseEmbed, errorEmbed, balanceEmbed, DIVIDER, COIN_ICON, DONATE_ICON };

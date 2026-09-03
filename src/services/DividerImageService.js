const { createCanvas } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const WIDTH = 400;
const HEIGHT = 4;

let cachedBuffer = null;

/** Рисует один раз и кэширует в памяти — линия одинаковая везде, нет смысла перерисовывать каждый раз. */
function renderDividerBuffer() {
  if (cachedBuffer) return cachedBuffer;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0)');
  gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.9)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  cachedBuffer = canvas.toBuffer('image/png');
  return cachedBuffer;
}

/**
 * Крепит PNG-линию как единственную картинку embed'а.
 * ВАЖНО: у Discord одно изображение на embed — не вызывать на embed'ах,
 * где уже есть другая картинка (profile/duel/dice/battle/соц-реакции/errorEmbed).
 * Возвращает AttachmentBuilder — добавь его в `files: [divider]` при send/reply/editReply.
 */
function attachDivider(embed) {
  const buffer = renderDividerBuffer();
  const attachment = new AttachmentBuilder(buffer, { name: 'divider.png' });
  embed.setImage('attachment://divider.png');
  return attachment;
}

module.exports = { attachDivider };

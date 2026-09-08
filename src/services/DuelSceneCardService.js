const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const { drawAvatarCircle } = require('./DiceDuelCardService');

const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'duel-backgrounds');

/** Случайный фон из assets/duel-backgrounds/ (если что-то туда положено), иначе null. */
function pickRandomBackground() {
  if (!fs.existsSync(BACKGROUNDS_DIR)) return null;
  const files = fs.readdirSync(BACKGROUNDS_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (files.length === 0) return null;
  return path.join(BACKGROUNDS_DIR, files[Math.floor(Math.random() * files.length)]);
}

/** Тот же бейдж-стиль, что у карточки костей — аватар + ник в скруглённой плашке снизу по краям. */
async function drawCornerBadge(ctx, { x, y, align, avatarURL, username }) {
  const avatarR = 20;
  const padding = 10;
  ctx.font = 'bold 18px sans-serif';
  const textWidth = ctx.measureText(username).width;
  const badgeWidth = avatarR * 2 + textWidth + padding * 3;
  const badgeHeight = avatarR * 2 + padding;

  const badgeX = align === 'left' ? x : x - badgeWidth;
  const badgeY = y - badgeHeight / 2;

  ctx.fillStyle = 'rgba(15,16,21,0.75)';
  const r = badgeHeight / 2;
  ctx.beginPath();
  ctx.moveTo(badgeX + r, badgeY);
  ctx.arcTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + badgeHeight, r);
  ctx.arcTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX, badgeY + badgeHeight, r);
  ctx.arcTo(badgeX, badgeY + badgeHeight, badgeX, badgeY, r);
  ctx.arcTo(badgeX, badgeY, badgeX + badgeWidth, badgeY, r);
  ctx.closePath();
  ctx.fill();

  const avatarX = badgeX + padding + avatarR;
  await drawAvatarCircle(ctx, avatarURL, avatarX, y, avatarR);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(username, avatarX + avatarR + padding * 0.6, y);
}

/**
 * Сцена дуэли со своим фоном (положи картинки в assets/duel-backgrounds/ — выбирается
 * случайно) и бейджами обоих игроков поверх, как у референса. Без фона в папке —
 * рисует свой сгенерированный градиентный фон вместо чужой иллюстрации.
 */
async function buildDuelSceneCard({ leftUser, rightUser }) {
  const W = 800, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgPath = pickRandomBackground();
  if (bgPath) {
    try {
      const img = await loadImage(bgPath);
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      drawFallbackBackground(ctx, W, H);
    }
  } else {
    drawFallbackBackground(ctx, W, H);
  }

  // мягкое затемнение снизу, чтобы бейджи были читаемы на любом фоне
  const shade = ctx.createLinearGradient(0, H - 90, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, H - 90, W, 90);

  await drawCornerBadge(ctx, { x: 24, y: H - 40, align: 'left', avatarURL: leftUser.avatarURL, username: leftUser.username });
  await drawCornerBadge(ctx, { x: W - 24, y: H - 40, align: 'right', avatarURL: rightUser.avatarURL, username: rightUser.username });

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'duel-scene.png' });
}

function drawFallbackBackground(ctx, W, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a1414');
  bg.addColorStop(1, '#150a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(239,68,68,0.08)';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.35, 160, 0, Math.PI * 2);
  ctx.fill();
}

module.exports = { buildDuelSceneCard };

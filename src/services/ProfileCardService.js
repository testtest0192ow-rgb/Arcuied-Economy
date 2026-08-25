const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
let fontsRegistered = false;
let usingBundledFont = false;

function ensureFontsRegistered(logger = console) {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const boldPath = path.join(FONTS_DIR, 'Inter-Bold.ttf');
  const regularPath = path.join(FONTS_DIR, 'Inter-Regular.ttf');

  if (fs.existsSync(boldPath) && fs.existsSync(regularPath)) {
    GlobalFonts.registerFromPath(boldPath, 'ARCUEID-Bold');
    GlobalFonts.registerFromPath(regularPath, 'ARCUEID-Regular');
    usingBundledFont = true;
  } else {
    logger.warn(
      '[ProfileCardService] Кириллический шрифт не найден в assets/fonts — карточка профиля будет использовать ' +
        'системный шрифт по умолчанию (см. assets/fonts/README.md).'
    );
  }
}

const FONT_BOLD = () => (usingBundledFont ? 'ARCUEID-Bold' : 'sans-serif');
const FONT_REGULAR = () => (usingBundledFont ? 'ARCUEID-Regular' : 'sans-serif');

const WIDTH = 1000;
const HEIGHT = 380;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws one small "stat chip" — used for reputation, duels, streak, etc.
 * Kept visually consistent so adding new stat types later is a one-liner.
 */
function drawChip(ctx, x, y, label, value, accentColor) {
  const chipWidth = 210;
  const chipHeight = 64;

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundedRect(ctx, x, y, chipWidth, chipHeight, 12);
  ctx.fill();

  ctx.fillStyle = accentColor;
  roundedRect(ctx, x, y, 4, chipHeight, 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `20px ${FONT_REGULAR()}`;
  ctx.fillText(label, x + 20, y + 26);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT_BOLD()}`;
  ctx.fillText(value, x + 20, y + 52);
}

/**
 * @param {object} data
 * @param {string} data.username
 * @param {string} data.avatarUrl
 * @param {number} data.coins
 * @param {number} data.donateCoins
 * @param {number} data.reputation
 * @param {number} data.duelWins
 * @param {number} data.duelLosses
 * @param {number} data.timelyStreak
 * @param {string|null} data.title - косметический титул, если есть
 * @param {string|null} data.partnerUsername - если в браке
 * @returns {Promise<Buffer>} PNG buffer, готов передать в discord.js AttachmentBuilder
 */
async function renderProfileCard(data, logger = console) {
  ensureFontsRegistered(logger);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Фон — premium dark с мягким градиентом, без баннера/картинки (свой стиль,
  // не копия чужого макета).
  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, '#15161c');
  bgGradient.addColorStop(1, '#1c1e27');
  ctx.fillStyle = bgGradient;
  roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
  ctx.fill();

  // Тонкая декоративная рамка, не толстая — по принципам UI из мастер-промпта.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 28);
  ctx.stroke();

  // Мягкое свечение позади аватара — вместо декоративного "мусора".
  const glow = ctx.createRadialGradient(190, 190, 20, 190, 190, 160);
  glow.addColorStop(0, 'rgba(99,102,241,0.25)');
  glow.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(190, 190, 160, 0, Math.PI * 2);
  ctx.fill();

  // Аватар — круглый, с тонким кольцом-акцентом.
  const avatarX = 190;
  const avatarY = 190;
  const avatarR = 110;

  try {
    const image = await loadImage(data.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } catch (err) {
    logger.warn('[ProfileCardService] Не удалось загрузить аватар, рисую заглушку.', err.message);
    ctx.fillStyle = '#2a2c38';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Ник + титул.
  const rightColX = 340;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 44px ${FONT_BOLD()}`;
  ctx.fillText(data.username, rightColX, 90);

  if (data.title) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `22px ${FONT_REGULAR()}`;
    ctx.fillText(data.title, rightColX, 122);
  }

  if (data.partnerUsername) {
    ctx.fillStyle = '#f472b6';
    ctx.font = `20px ${FONT_REGULAR()}`;
    ctx.fillText(`💍 в браке с ${data.partnerUsername}`, rightColX, data.title ? 152 : 122);
  }

  // Валюты — крупно, как основной элемент.
  const currencyY = 195;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `20px ${FONT_REGULAR()}`;
  ctx.fillText('Монеты', rightColX, currencyY);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 36px ${FONT_BOLD()}`;
  ctx.fillText(data.coins.toLocaleString('ru-RU'), rightColX, currencyY + 38);

  const donateColX = rightColX + 300;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `20px ${FONT_REGULAR()}`;
  ctx.fillText('Донат-монеты', donateColX, currencyY);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 36px ${FONT_BOLD()}`;
  ctx.fillText(data.donateCoins.toLocaleString('ru-RU'), donateColX, currencyY + 38);

  // Нижний ряд чипов — статистика.
  const chipY = 280;
  drawChip(ctx, rightColX, chipY, 'Репутация', String(data.reputation), '#22c55e');
  drawChip(ctx, rightColX + 225, chipY, 'Дуэли (П/Пор)', `${data.duelWins}/${data.duelLosses}`, '#ef4444');
  drawChip(ctx, rightColX + 450, chipY, 'Серия /timely', String(data.timelyStreak), '#f59e0b');

  return canvas.encode('png');
}

module.exports = { renderProfileCard };

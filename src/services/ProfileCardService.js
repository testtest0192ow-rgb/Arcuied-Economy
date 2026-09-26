/**
 * ProfileCardService — рендер карточки /profile через @napi-rs/canvas.
 *
 * Полностью новая композиция (не патч старой версии): вместо построчной
 * раскладки "аватар слева, колонка текста справа, ряд чипов внизу" — карточка
 * разбита на панель аватара с круглым бейджем уровня и сетку статистики
 * справа, плюс отдельная полоса заданий недели снизу.
 *
 * Данные на входе — те же самые честные поля из Wallet / QuestService,
 * ничего не придумано: username, avatarUrl, coins, donateCoins, reputation,
 * duelWins/Losses, timelyStreak, messageCount, level, currentXp/neededXp,
 * title, partnerUsername, quests.
 */
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

const WIDTH = 1200;
const HEIGHT = 480;
const PANEL_W = 360; // ширина левой панели аватара

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Одна карточка сетки статистики: подпись сверху, крупное значение снизу. */
function drawStatCard(ctx, x, y, w, h, label, value, accent) {
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  roundedRect(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.fillStyle = accent;
  roundedRect(ctx, x + 14, y + h - 22, 26, 4, 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `18px ${FONT_REGULAR()}`;
  ctx.fillText(label, x + 14, y + 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 30px ${FONT_BOLD()}`;
  ctx.fillText(value, x + 14, y + 66);
}

/** Заголовок-бейдж уровня — кружок с числом, перекрывающий низ аватара. */
function drawLevelBadge(ctx, cx, cy, level) {
  const r = 34;
  ctx.fillStyle = '#0f1115';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, '#8b5cf6');
  grad.addColorStop(1, '#6366f1');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT_BOLD()}`;
  ctx.fillText(String(level || 0), cx, cy + 9);
  ctx.textAlign = 'left';
}

/** Одна «пилюля» задания недели — по горизонтали, а не списком. */
function drawQuestPill(ctx, x, y, w, task) {
  const h = 54;
  ctx.fillStyle = task.done ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.035)';
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  const dotR = 8;
  const dotX = x + 20;
  const dotY = y + h / 2;
  ctx.fillStyle = task.done ? '#22c55e' : 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  if (task.done) {
    ctx.strokeStyle = '#0f1115';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(dotX - 3.5, dotY);
    ctx.lineTo(dotX - 1, dotY + 3);
    ctx.lineTo(dotX + 4, dotY - 3.5);
    ctx.stroke();
  }

  ctx.fillStyle = task.done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)';
  ctx.font = `17px ${FONT_REGULAR()}`;
  ctx.fillText(task.label, dotX + dotR + 14, dotY + 6);

  ctx.textAlign = 'right';
  ctx.fillStyle = task.done ? '#22c55e' : 'rgba(255,255,255,0.4)';
  ctx.font = `bold 16px ${FONT_BOLD()}`;
  ctx.fillText(`${Math.min(task.current, task.target)}/${task.target}`, x + w - 18, dotY + 6);
  ctx.textAlign = 'left';
}

/**
 * @param {object} data — см. описание полей вверху файла.
 * @returns {Promise<Buffer>} PNG buffer для discord.js AttachmentBuilder
 */
async function renderProfileCard(data, logger = console) {
  ensureFontsRegistered(logger);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Фон карточки целиком.
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#121319');
  bg.addColorStop(1, '#1a1c25');
  ctx.fillStyle = bg;
  roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 28);
  ctx.stroke();

  // Левая панель — чуть темнее общего фона, визуально отделяет аватар-блок.
  ctx.save();
  roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, PANEL_W, HEIGHT);
  ctx.restore();

  // Аватар — крупный, по центру левой панели.
  const avatarCx = PANEL_W / 2;
  const avatarCy = HEIGHT / 2 - 30;
  const avatarR = 108;

  const glow = ctx.createRadialGradient(avatarCx, avatarCy, 20, avatarCx, avatarCy, avatarR + 50);
  glow.addColorStop(0, 'rgba(139,92,246,0.28)');
  glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR + 50, 0, Math.PI * 2);
  ctx.fill();

  try {
    const image = await loadImage(data.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } catch (err) {
    logger.warn('[ProfileCardService] Не удалось загрузить аватар, рисую заглушку.', err.message);
    ctx.fillStyle = '#2a2c38';
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR + 4, 0, Math.PI * 2);
  ctx.stroke();

  drawLevelBadge(ctx, avatarCx + avatarR - 20, avatarCy + avatarR - 10, data.level);

  // Ник + серия /timely под аватаром.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT_BOLD()}`;
  ctx.fillText(data.username, avatarCx, avatarCy + avatarR + 56);

  if (data.timelyStreak > 0) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold 16px ${FONT_BOLD()}`;
    ctx.fillText(`🔥 ${data.timelyStreak} дней подряд`, avatarCx, avatarCy + avatarR + 84);
  }
  ctx.textAlign = 'left';

  // ===== Правая часть: заголовок, XP-полоса, сетка статистики, задания =====
  const rx = PANEL_W + 40;
  const rw = WIDTH - PANEL_W - 80;

  let headerY = 56;
  if (data.title) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `18px ${FONT_REGULAR()}`;
    ctx.fillText(data.title, rx, headerY);
    headerY += 26;
  }
  if (data.partnerUsername) {
    ctx.fillStyle = '#f472b6';
    ctx.font = `17px ${FONT_REGULAR()}`;
    ctx.fillText(`💍 в браке с ${data.partnerUsername}`, rx, headerY);
  }

  // XP-полоса — на всю ширину правой части.
  const barY = 84;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `16px ${FONT_REGULAR()}`;
  ctx.fillText(`Опыт до следующего уровня`, rx, barY);

  const barH = 12;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundedRect(ctx, rx, barY + 12, rw, barH, barH / 2);
  ctx.fill();
  const progress = data.neededXp > 0 ? Math.min(1, (data.currentXp || 0) / data.neededXp) : 0;
  if (progress > 0) {
    const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    grad.addColorStop(0, '#6366f1');
    grad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = grad;
    roundedRect(ctx, rx, barY + 12, Math.max(barH, rw * progress), barH, barH / 2);
    ctx.fill();
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `14px ${FONT_REGULAR()}`;
  ctx.fillText(`${(data.currentXp || 0).toLocaleString('ru-RU')} / ${(data.neededXp || 0).toLocaleString('ru-RU')} XP`, rx + rw, barY);
  ctx.textAlign = 'left';

  // Сетка статистики 3×2 — вместо ряда чипов.
  const gridY = 138;
  const gap = 14;
  const cardW = (rw - gap * 2) / 3;
  const cardH = 82;

  const stats = [
    ['Монеты', data.coins.toLocaleString('ru-RU'), '#f59e0b'],
    ['Донат-монеты', data.donateCoins.toLocaleString('ru-RU'), '#ec4899'],
    ['Репутация', String(data.reputation), '#22c55e'],
    ['Дуэли (П/Пор)', `${data.duelWins}/${data.duelLosses}`, '#ef4444'],
    ['Сообщения', (data.messageCount || 0).toLocaleString('ru-RU'), '#3b82f6'],
    ['Серия /timely', String(data.timelyStreak || 0), '#a855f7'],
  ];
  stats.forEach(([label, value, accent], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawStatCard(ctx, rx + col * (cardW + gap), gridY + row * (cardH + gap), cardW, cardH, label, value, accent);
  });

  // Задания недели — горизонтальный ряд пилюль.
  if (data.quests && Array.isArray(data.quests.tasks) && data.quests.tasks.length) {
    const questsLabelY = gridY + cardH * 2 + gap + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `16px ${FONT_REGULAR()}`;
    ctx.fillText(
      data.quests.allClaimed ? 'Задания недели — все выполнены ✅' : 'Задания недели',
      rx,
      questsLabelY
    );

    const pillY = questsLabelY + 14;
    const pillGap = 12;
    const pillW = (rw - pillGap * (data.quests.tasks.length - 1)) / data.quests.tasks.length;
    data.quests.tasks.forEach((task, i) => {
      drawQuestPill(ctx, rx + i * (pillW + pillGap), pillY, pillW, task);
    });
  }

  return canvas.encode('png');
}

module.exports = { renderProfileCard };

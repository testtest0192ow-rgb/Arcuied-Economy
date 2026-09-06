const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

// Дуэльная заставка одинаковая для всех дуэлей (не зависит от результата) — кэшируется
// один раз. Кубик и монета ЗАВИСЯТ от результата — кэшируются отдельно на каждый исход
// (для кубика: 6 вариантов, для монеты: 2 варианта), а не пересчитываются на лету каждый раз.
let duelGifCache = null;
const duelResultGifCache = new Map(); // 'left'|'right' -> Buffer
const diceGifCache = new Map(); // number(1-6) -> Buffer
const coinflipGifCache = new Map(); // 'heads'|'tails' -> Buffer

function renderFrames(width, height, frameCount, drawFrame) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const gif = GIFEncoder();

  for (let i = 0; i < frameCount; i++) {
    ctx.clearRect(0, 0, width, height);
    drawFrame(ctx, i, frameCount);

    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 128);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: 60 });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

/** Две акцентные "полосы"-клинка сходятся к центру и вспыхивают — абстрактно, не силуэты. */
function generateDuelGif() {
  if (duelGifCache) return duelGifCache;

  const WIDTH = 500;
  const HEIGHT = 220;
  const FRAMES = 14;

  duelGifCache = renderFrames(WIDTH, HEIGHT, FRAMES, (ctx, i, total) => {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#1a0f0f');
    bg.addColorStop(1, '#2a1414');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const progress = i / (total - 1);
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const gap = (1 - progress) * 160;

    ctx.save();
    ctx.translate(centerX - gap, centerY);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-140, -8, 140, 16);
    ctx.restore();

    ctx.save();
    ctx.translate(centerX + gap, centerY);
    ctx.rotate(0.25);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, -8, 140, 16);
    ctx.restore();

    if (progress > 0.75) {
      const flashAlpha = (progress - 0.75) / 0.25;
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 90);
      glow.addColorStop(0, `rgba(255,255,255,${flashAlpha * 0.9})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  });

  return duelGifCache;
}

/**
 * Победная вспышка: клинок стороны-победителя ("left"/"right") пробивает насквозь
 * и остаётся ярким, проигравшая сторона гаснет — визуально видно, кто выиграл,
 * не только по тексту embed'а.
 */
function generateDuelResultGif(winnerSide) {
  const safeSide = winnerSide === 'right' ? 'right' : 'left';
  if (duelResultGifCache.has(safeSide)) return duelResultGifCache.get(safeSide);

  const WIDTH = 500;
  const HEIGHT = 220;
  const FRAMES = 12;
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;

  const buffer = renderFrames(WIDTH, HEIGHT, FRAMES, (ctx, i, total) => {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#1a0f0f');
    bg.addColorStop(1, '#2a1414');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const progress = i / (total - 1);
    // Победивший клинок продвигается к центру и дальше, проигравший — отступает и тускнеет.
    const winnerPush = progress * 220;
    const loserFade = Math.max(0, 1 - progress * 1.4);

    const winnerX = safeSide === 'left' ? centerX - 180 + winnerPush : centerX + 180 - winnerPush;
    const winnerRotation = safeSide === 'left' ? -0.25 : 0.25 + Math.PI;
    ctx.save();
    ctx.translate(winnerX, centerY);
    ctx.rotate(safeSide === 'left' ? -0.25 : Math.PI + 0.25);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(safeSide === 'left' ? -140 : 0, -9, 140, 18);
    ctx.restore();

    const loserX = safeSide === 'left' ? centerX + 100 : centerX - 100;
    ctx.save();
    ctx.globalAlpha = loserFade;
    ctx.translate(loserX, centerY);
    ctx.rotate(safeSide === 'left' ? 0.25 : -0.25 + Math.PI);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(safeSide === 'left' ? 0 : -140, -8, 140, 16);
    ctx.restore();

    if (progress > 0.6) {
      const glowAlpha = (progress - 0.6) / 0.4;
      const glow = ctx.createRadialGradient(winnerX, centerY, 0, winnerX, centerY, 110);
      glow.addColorStop(0, `rgba(251,191,36,${glowAlpha * 0.7})`);
      glow.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  });

  duelResultGifCache.set(safeSide, buffer);
  return buffer;
}

// Расположение точек (пипсов) на кубике для каждой грани 1-6, в координатах сетки 3x3.
const PIP_LAYOUTS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function drawDiceFace(ctx, cx, cy, size, number, alpha = 1) {
  const half = size / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f59e0b';
  const r = 14;
  const x = cx - half;
  const y = cy - half;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#15161c';
  const pipR = size * 0.075;
  const cellSize = size / 3;
  (PIP_LAYOUTS[number] || PIP_LAYOUTS[1]).forEach(([row, col]) => {
    const px = x + cellSize * col + cellSize / 2;
    const py = y + cellSize * row + cellSize / 2;
    ctx.beginPath();
    ctx.arc(px, py, pipR, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * Кубик крутится и останавливается ИМЕННО на выпавшей грани (number, 1-6) — раньше
 * анимация была одна и та же для любого результата, теперь исход всегда совпадает
 * с тем, что реально выпало по provably-fair броску.
 */
function generateDiceGif(number) {
  const safeNumber = PIP_LAYOUTS[number] ? number : 1;
  if (diceGifCache.has(safeNumber)) return diceGifCache.get(safeNumber);

  const WIDTH = 300;
  const HEIGHT = 220;
  const SPIN_FRAMES = 8;
  const SETTLE_FRAMES = 4;
  const FRAMES = SPIN_FRAMES + SETTLE_FRAMES;
  const cubeSize = 90;

  const buffer = renderFrames(WIDTH, HEIGHT, FRAMES, (ctx, i) => {
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#15161c');
    bg.addColorStop(1, '#1c1e27');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    if (i < SPIN_FRAMES) {
      const spinFace = (i % 6) + 1;
      const angle = (i / SPIN_FRAMES) * Math.PI * 2;
      const skew = Math.sin(angle) * 0.3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.transform(1, skew, 0, 1, 0, 0);
      drawDiceFace(ctx, 0, 0, cubeSize, spinFace);
      ctx.restore();
    } else {
      const settleProgress = (i - SPIN_FRAMES) / (SETTLE_FRAMES - 1);
      const bounce = Math.sin(settleProgress * Math.PI) * 6 * (1 - settleProgress);
      drawDiceFace(ctx, cx, cy - bounce, cubeSize, safeNumber);
    }
  });

  diceGifCache.set(safeNumber, buffer);
  return buffer;
}

/**
 * Монета крутится и останавливается на выпавшей стороне, с подписью результата
 * ("ОРЁЛ"/"РЕШКА") внизу кадра — собственная генерация, не претендует на анимацию
 * с чужими персонажами (это было бы чужим авторским правом).
 */
function generateCoinflipGif(result) {
  const safeResult = result === 'tails' ? 'tails' : 'heads';
  if (coinflipGifCache.has(safeResult)) return coinflipGifCache.get(safeResult);

  const WIDTH = 320;
  const HEIGHT = 260;
  const SPIN_FRAMES = 10;
  const SETTLE_FRAMES = 4;
  const FRAMES = SPIN_FRAMES + SETTLE_FRAMES;
  const coinRadius = 70;
  const label = safeResult === 'heads' ? 'ОРЁЛ' : 'РЕШКА';
  const faceColor = safeResult === 'heads' ? '#fbbf24' : '#a78bfa';

  const buffer = renderFrames(WIDTH, HEIGHT, FRAMES, (ctx, i) => {
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#15161c');
    bg.addColorStop(1, '#1c1e27');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 15;

    if (i < SPIN_FRAMES) {
      const angle = (i / SPIN_FRAMES) * Math.PI * 4;
      const squash = Math.abs(Math.cos(angle));
      const flashHeads = Math.cos(angle) > 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(squash, 0.12), 1);
      ctx.fillStyle = flashHeads ? '#fbbf24' : '#a78bfa';
      ctx.beginPath();
      ctx.arc(0, 0, coinRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const settleProgress = (i - SPIN_FRAMES) / (SETTLE_FRAMES - 1);
      const bounce = Math.sin(settleProgress * Math.PI) * 5 * (1 - settleProgress);

      ctx.save();
      ctx.translate(cx, cy - bounce);
      ctx.fillStyle = faceColor;
      ctx.beginPath();
      ctx.arc(0, 0, coinRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      const textAlpha = Math.min(1, settleProgress * 2);
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, WIDTH / 2, HEIGHT - 30);
      ctx.restore();
    }
  });

  coinflipGifCache.set(safeResult, buffer);
  return buffer;
}

module.exports = { generateDuelGif, generateDuelResultGif, generateDiceGif, generateCoinflipGif };

const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

// Генерируются один раз при первом обращении и кэшируются в памяти — контент не
// зависит от конкретной дуэли/броска, так что пересчитывать на каждый вызов смысла нет.
let duelGifCache = null;
let diceGifCache = null;

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

    const progress = i / (total - 1); // 0 -> 1
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const gap = (1 - progress) * 160;

    // Левый клинок
    ctx.save();
    ctx.translate(centerX - gap, centerY);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-140, -8, 140, 16);
    ctx.restore();

    // Правый клинок
    ctx.save();
    ctx.translate(centerX + gap, centerY);
    ctx.rotate(0.25);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, -8, 140, 16);
    ctx.restore();

    // Вспышка столкновения на последних кадрах
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

/** Простой вращающийся кубик — абстрактная анимация, не претендует на 3D-реализм. */
function generateDiceGif() {
  if (diceGifCache) return diceGifCache;

  const WIDTH = 300;
  const HEIGHT = 220;
  const FRAMES = 10;
  const cubeSize = 90;

  diceGifCache = renderFrames(WIDTH, HEIGHT, FRAMES, (ctx, i, total) => {
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#15161c');
    bg.addColorStop(1, '#1c1e27');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const angle = (i / total) * Math.PI * 2;
    const skew = Math.sin(angle) * 0.3;

    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.transform(1, skew, 0, 1, 0, 0);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    const r = 14;
    const x = -cubeSize / 2;
    const y = -cubeSize / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + cubeSize, y, x + cubeSize, y + cubeSize, r);
    ctx.arcTo(x + cubeSize, y + cubeSize, x, y + cubeSize, r);
    ctx.arcTo(x, y + cubeSize, x, y, r);
    ctx.arcTo(x, y, x + cubeSize, y, r);
    ctx.closePath();
    ctx.fill();

    // Пипсы (точки) — просто чтобы читалось как кубик, не конкретная грань.
    ctx.fillStyle = '#15161c';
    const pipR = 7;
    [[-20, -20], [20, 20], [0, 0]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });

  return diceGifCache;
}

module.exports = { generateDuelGif, generateDiceGif };

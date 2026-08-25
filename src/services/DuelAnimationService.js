const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const WIDTH = 640;
const HEIGHT = 360;

function drawBackground(ctx, intensity = 1) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, `rgba(120,20,10,${intensity})`);
  gradient.addColorStop(1, `rgba(20,5,5,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * Простые чёрные силуэты с "револьвером" — геометрия своя, не копия чужого арта.
 * side: 'left' | 'right'
 */
function drawGunman(ctx, side) {
  const flip = side === 'right';
  ctx.save();
  if (flip) {
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
  }

  ctx.fillStyle = '#0a0a0a';

  // Плечо/торс — треугольный силуэт от нижнего угла.
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  ctx.lineTo(0, HEIGHT * 0.35);
  ctx.lineTo(WIDTH * 0.22, HEIGHT * 0.55);
  ctx.lineTo(WIDTH * 0.1, HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Вытянутая рука к центру.
  ctx.beginPath();
  ctx.moveTo(WIDTH * 0.05, HEIGHT * 0.52);
  ctx.lineTo(WIDTH * 0.32, HEIGHT * 0.46);
  ctx.lineTo(WIDTH * 0.32, HEIGHT * 0.52);
  ctx.lineTo(WIDTH * 0.05, HEIGHT * 0.58);
  ctx.closePath();
  ctx.fill();

  // Револьвер — прямоугольник + треугольный "боёк" сверху, простая своя форма.
  ctx.save();
  ctx.translate(WIDTH * 0.32, HEIGHT * 0.49);
  ctx.fillRect(0, -8, 46, 16);
  ctx.beginPath();
  ctx.moveTo(46, -10);
  ctx.lineTo(60, -4);
  ctx.lineTo(46, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawCenterText(ctx, text, { scale = 1, color = '#ffffff' } = {}) {
  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT / 2);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 90px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, 4, 4);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Генерирует короткую анимацию дуэли: отсчёт 3-2-1 и финальная "вспышка".
 * Полностью своя отрисовка, никаких внешних изображений.
 * @returns {Buffer} animated GIF
 */
function renderDuelGif() {
  const gif = GIFEncoder();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const steps = ['3', '2', '1', 'FLASH'];

  for (const step of steps) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (step === 'FLASH') {
      drawBackground(ctx, 1);
      // Яркая вспышка по центру — выстрел.
      const flash = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 10, WIDTH / 2, HEIGHT / 2, WIDTH / 2);
      flash.addColorStop(0, 'rgba(255,255,255,0.95)');
      flash.addColorStop(1, 'rgba(255,255,255,0)');
      drawGunman(ctx, 'left');
      drawGunman(ctx, 'right');
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      drawBackground(ctx, 1);
      drawGunman(ctx, 'left');
      drawGunman(ctx, 'right');
      drawCenterText(ctx, step);
    }

    const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay: step === 'FLASH' ? 900 : 550 });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

module.exports = { renderDuelGif };

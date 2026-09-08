const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const PIP_LAYOUTS = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

/** Глянцевый 3D-кубик — радиальный градиент + блик сверху-слева + тень снизу-справа. */
function drawDie(ctx, x, y, size, number, baseColor) {
  const r = size * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((Math.random() - 0.5) * 0.3);

  // тень под кубиком
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundedSquare(ctx, 3, 4, size, r);
  ctx.fill();

  // тело — радиальный градиент от светлого угла к насыщенному цвету
  const grad = ctx.createRadialGradient(-size * 0.22, -size * 0.22, size * 0.05, 0, 0, size * 0.75);
  grad.addColorStop(0, lighten(baseColor, 0.55));
  grad.addColorStop(0.55, baseColor);
  grad.addColorStop(1, darken(baseColor, 0.35));
  ctx.fillStyle = grad;
  roundedSquare(ctx, 0, 0, size, r);
  ctx.fill();

  // тонкий тёмный кант для объёма
  ctx.strokeStyle = darken(baseColor, 0.5);
  ctx.lineWidth = Math.max(1, size * 0.02);
  roundedSquare(ctx, 0, 0, size, r);
  ctx.stroke();

  // блик — маленький белый эллипс в верхнем левом углу
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-size * 0.22, -size * 0.24, size * 0.14, size * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // точки
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  const pipR = size * 0.075;
  const cell = size / 3;
  const ox = -size / 2, oy = -size / 2;
  (PIP_LAYOUTS[number] || PIP_LAYOUTS[1]).forEach(([row, col]) => {
    ctx.beginPath();
    ctx.arc(ox + cell * col + cell / 2, oy + cell * row + cell / 2, pipR, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function roundedSquare(ctx, cx, cy, size, r) {
  const x = cx - size / 2, y = cy - size / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
}

function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${mix(r, 255, amt)},${mix(g, 255, amt)},${mix(b, 255, amt)})`;
}
function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${mix(r, 0, amt)},${mix(g, 0, amt)},${mix(b, 0, amt)})`;
}
function mix(a, b, t) { return Math.round(a + (b - a) * t); }
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

async function drawAvatarCircle(ctx, url, x, y, r) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#3a3d44';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Бейдж "аватар + ник + сумма" в нижнем углу — как у референса, не сверху карточки. */
async function drawPlayerBadge(ctx, { x, y, align, avatarURL, username, sum, color }) {
  const avatarR = 22;
  const avatarX = align === 'left' ? x + avatarR + 4 : x - avatarR - 4;
  await drawAvatarCircle(ctx, avatarURL, avatarX, y, avatarR);

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'left' ? 'left' : 'right';
  const nameX = align === 'left' ? avatarX + avatarR + 10 : avatarX - avatarR - 10;
  ctx.fillText(username, nameX, y);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(String(sum), nameX, y + 26);
}

/** Карточка результата PvP-костей — глянцевые кубики, бейджи игроков снизу по краям. */
async function buildDiceDuelCard({ leftUser, rightUser, leftRolls, rightRolls, leftSum, rightSum }) {
  const W = 700, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1c1e27');
  bg.addColorStop(1, '#15161c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(175, 150, 150, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W - 175, 150, 150, 120, 0, 0, Math.PI * 2);
  ctx.fill();

  const winner = leftSum === rightSum ? null : leftSum > rightSum ? 'left' : 'right';
  const leftColor = winner === 'left' ? '#fbbf24' : winner === 'right' ? '#6b7280' : '#ef4444';
  const rightColor = winner === 'right' ? '#fbbf24' : winner === 'left' ? '#6b7280' : '#ef4444';

  drawDie(ctx, 130, 150, 100, leftRolls[0], leftColor);
  drawDie(ctx, 220, 150, 100, leftRolls[1], leftColor);
  drawDie(ctx, W - 220, 150, 100, rightRolls[0], rightColor);
  drawDie(ctx, W - 130, 150, 100, rightRolls[1], rightColor);

  // сравнение по центру — ромб с символом, как у референса
  ctx.save();
  ctx.translate(W / 2, 150);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#0f1015';
  ctx.fillRect(-28, -28, 56, 56);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(winner === null ? '=' : winner === 'left' ? '>' : '<', W / 2, 150);

  await drawPlayerBadge(ctx, { x: 20, y: H - 40, align: 'left', avatarURL: leftUser.avatarURL, username: leftUser.username, sum: leftSum, color: leftColor });
  await drawPlayerBadge(ctx, { x: W - 20, y: H - 40, align: 'right', avatarURL: rightUser.avatarURL, username: rightUser.username, sum: rightSum, color: rightColor });

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'dice-duel.png' });
}

module.exports = { buildDiceDuelCard, drawAvatarCircle };

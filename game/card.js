import { renderResultCard } from '../lib/capture.js?v=1';

const COLORS = { N: '#70e5ff', R: '#76efb1', SR: '#ffcf58', UR: '#ff7be5' };

/**
 * @param {{species:any,cm:number,rarity:string,badge:string,point:string,condition:string,appUrl:string}} data
 */
export function renderCatchCard(data) {
  return renderResultCard(async (ctx, canvas) => {
    const accent = COLORS[data.rarity] || COLORS.N;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#082c43');
    gradient.addColorStop(.52, '#08647b');
    gradient.addColorStop(1, '#031522');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 18;
    ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b9f4ff';
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.fillText('TSURETA!  MOTION FISHING', canvas.width / 2, 115);

    ctx.globalAlpha = .14;
    for (let y = 210; y < 880; y += 85) {
      ctx.strokeStyle = '#a8f2ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, y, 390, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    try {
      const art = await loadImage(new URL(`../${data.species.art}`, import.meta.url).href);
      ctx.drawImage(art, 260, 205, 560, 320);
    } catch {
      drawFallbackFish(ctx, canvas.width / 2, 400, accent);
    }
    ctx.fillStyle = accent;
    ctx.font = '950 34px system-ui, sans-serif';
    ctx.fillText(data.rarity, canvas.width / 2, 565);
    ctx.fillStyle = '#fff';
    ctx.font = '950 76px system-ui, sans-serif';
    ctx.fillText(data.species.name_ja, canvas.width / 2, 650);
    ctx.font = '950 122px system-ui, sans-serif';
    ctx.fillText(`${data.cm.toFixed(1)} cm`, canvas.width / 2, 790);

    ctx.fillStyle = accent;
    roundRect(ctx, 250, 840, 580, 80, 40);
    ctx.fill();
    ctx.fillStyle = '#062235';
    ctx.font = '950 32px system-ui, sans-serif';
    ctx.fillText(data.badge, canvas.width / 2, 891);

    ctx.fillStyle = '#d8edf3';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(`${data.point}  •  ${data.condition}`, canvas.width / 2, 1010);
    ctx.fillStyle = '#fff';
    ctx.font = '900 29px system-ui, sans-serif';
    ctx.fillText('#釣れた  #スマホが釣り竿', canvas.width / 2, 1080);
    ctx.fillStyle = '#9ddce9';
    ctx.font = '600 25px system-ui, sans-serif';
    fitText(ctx, data.appUrl, canvas.width / 2, 1215, 900);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawFallbackFish(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 190, 100, 0, 0, Math.PI * 2);
  ctx.moveTo(x - 170, y);
  ctx.lineTo(x - 290, y - 100);
  ctx.lineTo(x - 270, y + 100);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx, text, x, y, maxWidth) {
  let shown = text;
  while (shown.length > 12 && ctx.measureText(shown).width > maxWidth) shown = `${shown.slice(0, -2)}…`;
  ctx.fillText(shown, x, y);
}

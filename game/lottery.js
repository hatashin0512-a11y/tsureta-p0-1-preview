const RARITIES = ['N', 'R', 'SR', 'UR'];

/**
 * Draws a catch from data only. Adding a valid fish row automatically makes
 * it eligible without changing this module.
 * @param {Array<any>} fish
 * @param {{pointId:string,castPower?:number,random?:()=>number}} options
 */
export function drawCatch(fish, options) {
  const random = options.random ?? Math.random;
  const power = Math.max(0, Math.min(1, options.castPower ?? 0));
  const eligible = fish.filter((item) => item.habitat?.includes(options.pointId));
  if (!eligible.length) throw new Error(`No fish for point: ${options.pointId}`);

  const urWeight = .01 + power * .01;
  const srWeight = .07 + power * .04;
  const rWeight = .27 + power * .03;
  const roll = random();
  const rarity = roll < urWeight ? 'UR'
    : roll < urWeight + srWeight ? 'SR'
      : roll < urWeight + srWeight + rWeight ? 'R' : 'N';
  const sameRarity = eligible.filter((item) => item.rarity === rarity);
  const pool = sameRarity.length ? sameRarity : eligible;
  const species = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const size = drawSize(species.size_cm, random);
  const topFive = size >= species.size_cm.max - (species.size_cm.max - species.size_cm.min) * .05;
  return {
    species,
    cm: Math.round(size * 10) / 10,
    rarity: RARITIES.includes(species.rarity) ? species.rarity : 'N',
    monster: topFive,
  };
}

function drawSize(range, random) {
  const upper = random() > .82;
  const start = upper ? range.typical : range.min;
  const end = upper ? range.max : range.typical;
  return start + (end - start) * random() ** (upper ? 2.4 : 1.35);
}

const RANKS = [
  { tier: 'BRONZE',      division: 3, minRP: 0,    maxRP: 399,      color: '#cd7f32' },
  { tier: 'BRONZE',      division: 2, minRP: 400,  maxRP: 799,      color: '#cd7f32' },
  { tier: 'BRONZE',      division: 1, minRP: 800,  maxRP: 1199,     color: '#cd7f32' },
  { tier: 'SILVER',      division: 3, minRP: 1200, maxRP: 1599,     color: '#c0c0c0' },
  { tier: 'SILVER',      division: 2, minRP: 1600, maxRP: 1999,     color: '#c0c0c0' },
  { tier: 'SILVER',      division: 1, minRP: 2000, maxRP: 2399,     color: '#c0c0c0' },
  { tier: 'GOLD',        division: 3, minRP: 2400, maxRP: 2799,     color: '#ffd700' },
  { tier: 'GOLD',        division: 2, minRP: 2800, maxRP: 3199,     color: '#ffd700' },
  { tier: 'GOLD',        division: 1, minRP: 3200, maxRP: 3599,     color: '#ffd700' },
  { tier: 'PLATINUM',    division: 3, minRP: 3600, maxRP: 3999,     color: '#00f5ff' },
  { tier: 'PLATINUM',    division: 2, minRP: 4000, maxRP: 4399,     color: '#00f5ff' },
  { tier: 'PLATINUM',    division: 1, minRP: 4400, maxRP: 4799,     color: '#00f5ff' },
  { tier: 'DIAMOND',     division: 3, minRP: 4800, maxRP: 5199,     color: '#b9f2ff' },
  { tier: 'DIAMOND',     division: 2, minRP: 5200, maxRP: 5599,     color: '#b9f2ff' },
  { tier: 'DIAMOND',     division: 1, minRP: 5600, maxRP: 5999,     color: '#b9f2ff' },
  { tier: 'MASTER',      division: 1, minRP: 6000, maxRP: 7999,     color: '#ff2d78' },
  { tier: 'GRANDMASTER', division: 1, minRP: 8000, maxRP: Infinity, color: '#7b2fff' },
];

/**
 * Calculate RP change after a match.
 * @param {number} playerRP       - Current player rank points
 * @param {number} opponentAvgRP  - Average RP of opponents in the match
 * @param {boolean} won           - Whether the player won
 * @param {number} kills
 * @param {number} deaths
 * @param {number} assists
 * @returns {number} RP delta (can be negative)
 */
function calculateRPChange(playerRP, opponentAvgRP, won, kills, deaths, assists) {
  const base        = won ? 28 : -18;
  const kda         = (kills + assists * 0.5) / Math.max(deaths, 1);
  let   perfBonus   = Math.round((kda - 1.0) * 6);
  perfBonus         = Math.max(-8, Math.min(12, perfBonus));
  const rpDiff      = (opponentAvgRP - playerRP) / 400;
  const total       = base + perfBonus + Math.round(rpDiff * 10);
  return Math.max(total, won ? 5 : -30);
}

/**
 * Returns the RANKS entry whose range contains rp.
 * @param {number} rp
 * @returns {{ tier, division, minRP, maxRP, color }}
 */
function getRankFromRP(rp) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (rp >= RANKS[i].minRP) return RANKS[i];
  }
  return RANKS[0];
}

module.exports = { RANKS, calculateRPChange, getRankFromRP };

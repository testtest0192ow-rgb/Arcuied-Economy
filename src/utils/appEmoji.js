// Put your Discord custom emoji IDs here. Empty IDs safely fall back to text symbols.
const IDS = {
  coin: process.env.EMOJI_COIN || '',
  donate: process.env.EMOJI_DONATE || '',
  balance: process.env.EMOJI_BALANCE || '',
  profile: process.env.EMOJI_PROFILE || '',
  gift: process.env.EMOJI_GIFT || '',
  quest: process.env.EMOJI_QUEST || '',
  shop: process.env.EMOJI_SHOP || '',
  inventory: process.env.EMOJI_INVENTORY || '',
  clan: process.env.EMOJI_CLAN || '',
  duel: process.env.EMOJI_DUEL || '',
  dice: process.env.EMOJI_DICE || '',
  crown: process.env.EMOJI_CROWN || '',
  check: process.env.EMOJI_CHECK || '',
  cross: process.env.EMOJI_CROSS || '',
};
const FALLBACK = { coin: '◈', donate: '◆', balance: '◉', profile: '●', gift: '◇', quest: '□', shop: '▣', inventory: '▤', clan: '◇', duel: '⚔', dice: '◈', crown: '♢', check: '✓', cross: '×' };
function appEmoji(name) { const id = IDS[name]; return id ? `<:${name}:${id}> ` : `${FALLBACK[name] || '•'} `; }
module.exports = { appEmoji, IDS };

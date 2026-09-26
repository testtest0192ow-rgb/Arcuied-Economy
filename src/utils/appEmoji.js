const ids=require('../generated/emojiIds.json');
function emoji(name,fallback='•'){const id=ids[name];return id?`<:${name}:${id}>`:fallback;}
module.exports={emoji};

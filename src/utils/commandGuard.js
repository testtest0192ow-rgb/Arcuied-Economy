function ownerOnly(i){return Boolean(process.env.BOT_OWNER_ID&&i.user.id===process.env.BOT_OWNER_ID);}
function admin(i){return Boolean(i.memberPermissions?.has('Administrator'))||ownerOnly(i);}
module.exports={ownerOnly,admin};

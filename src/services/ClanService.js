const Clan=require('../models/Clan');const Profile=require('../models/Profile');const TransactionService=require('./TransactionService');const config=require('../config');
class ClanService{
 async mine(guildId,userId){return Clan.findOne({guildId,members:userId});}
 async create(guildId,userId,name,tag){if(await this.mine(guildId,userId))throw new Error('already_clan');const c=await Clan.findOne({guildId,name});if(c)throw new Error('name_taken');await TransactionService.applyDelta({guildId,userId,amount:-config.clans.createCost,type:'clan_create',idempotencyKey:`clan:create:${guildId}:${userId}:${name}`});const clan=await Clan.create({guildId,name,tag,ownerId:userId,members:[userId]});await Profile.findOneAndUpdate({guildId,userId},{$set:{clanId:clan._id}},{upsert:true});return clan;}
 async leave(guildId,userId){const c=await this.mine(guildId,userId);if(!c)throw new Error('not_clan');if(c.ownerId===userId)throw new Error('owner_cannot_leave');c.members=c.members.filter(x=>x!==userId);await c.save();await Profile.updateOne({guildId,userId},{$set:{clanId:null}});return c;}
}
module.exports=new ClanService();

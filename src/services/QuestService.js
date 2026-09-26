const Quest=require('../models/Quest');const WalletService=require('./WalletService');const TransactionService=require('./TransactionService');const config=require('../config');
const T=[['messages','Напиши 10 сообщений',10,25],['xp','Получи 50 XP',50,35],['social','Поставь 1 репутацию',1,30]];
class QuestService{
 async ensure(guildId,userId){const active=await Quest.find({guildId,userId,expiresAt:{$gt:new Date()},claimed:false}).lean();if(active.length)return active;const exp=new Date(Date.now()+config.quests.refreshMs);const picks=T.slice(0,config.quests.dailyCount);await Quest.deleteMany({guildId,userId,expiresAt:{$lte:new Date()}});for(const [key,title,target,reward] of picks)await Quest.create({guildId,userId,key,title,target,reward,expiresAt:exp});return Quest.find({guildId,userId,expiresAt:{$gt:new Date()},claimed:false}).lean();}
 async progress(guildId,userId,key,amount){const q=await Quest.findOne({guildId,userId,key,claimed:false,expiresAt:{$gt:new Date()}});if(!q)return; q.progress=Math.min(q.target,q.progress+Math.max(0,amount));await q.save();}
 async claim(guildId,userId,id){const q=await Quest.findOneAndUpdate({_id:id,guildId,userId,claimed:false,expiresAt:{$gt:new Date()},$expr:{$gte:['$progress','$target']}},{$set:{claimed:true}},{new:true});if(!q)throw new Error('quest_unavailable');await TransactionService.applyDelta({guildId,userId,amount:q.reward,type:'quest_reward',idempotencyKey:`quest:${q._id}`,meta:{quest:q.key}});return q;}
}
module.exports=new QuestService();

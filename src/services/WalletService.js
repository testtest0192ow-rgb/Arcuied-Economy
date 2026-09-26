const Wallet=require('../models/Wallet');const config=require('../config');
class WalletService{
 async get(guildId,userId){return Wallet.findOneAndUpdate({guildId,userId},{$setOnInsert:{guildId,userId,coins:config.economy.startingCoins,donateCoins:0,level:1,xp:0}},{upsert:true,new:true,setDefaultsOnInsert:true});}
 xpForNext(level){return Math.max(1,Math.floor(config.progression.baseXp*Math.pow(config.progression.growth,Math.max(0,level-1))));}
 async addXp(guildId,userId,amount){if(amount<=0)return {wallet:await this.get(guildId,userId),leveled:false};let w=await this.get(guildId,userId);let xp=w.xp+Math.floor(amount),level=w.level,leveled=false;while(xp>=this.xpForNext(level)&&level<1000){xp-=this.xpForNext(level);level++;leveled=true;}w=await Wallet.findOneAndUpdate({_id:w._id},{$set:{xp,level},$inc:{messages:0}},{new:true});return {wallet:w,leveled};}
 async addMessage(guildId,userId){const w=await this.get(guildId,userId);await Wallet.updateOne({_id:w._id},{$inc:{messages:1}});return this.addXp(guildId,userId,config.progression.messageXp);}
}
module.exports=new WalletService();

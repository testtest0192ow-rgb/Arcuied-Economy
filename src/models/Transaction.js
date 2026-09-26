const {Schema,model}=require('mongoose');
const schema=new Schema({guildId:{type:String,index:true},userId:{type:String,index:true},counterpartyId:String,currency:{type:String,enum:['coins','donateCoins']},amount:Number,type:String,idempotencyKey:{type:String,unique:true,sparse:true},meta:Schema.Types.Mixed},{timestamps:true});
schema.index({guildId:1,userId:1,createdAt:-1});
module.exports=model('Transaction',schema);

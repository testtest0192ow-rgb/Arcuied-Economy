const {Schema,model}=require('mongoose');
const schema=new Schema({guildId:{type:String,index:true},userId:{type:String,index:true},items:[{itemId:String,name:String,quantity:{type:Number,default:0}}]},{timestamps:true});schema.index({guildId:1,userId:1},{unique:true});module.exports=model('Inventory',schema);

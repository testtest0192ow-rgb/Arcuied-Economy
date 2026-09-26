const {Schema,model}=require('mongoose');
const schema=new Schema({guildId:{type:String,index:true},itemId:{type:String,index:true},name:String,description:String,price:{type:Number,min:0},emoji:String,stock:{type:Number,min:-1,default:-1},roleId:String,active:{type:Boolean,default:true}},{timestamps:true});schema.index({guildId:1,itemId:1},{unique:true});module.exports=model('ShopItem',schema);

const {Schema,model}=require('mongoose');
const schema=new Schema({guildId:{type:String,index:true},userId:{type:String,index:true},key:String,title:String,target:Number,progress:{type:Number,default:0},reward:{type:Number,default:25},expiresAt:Date,claimed:{type:Boolean,default:false}},{timestamps:true});schema.index({guildId:1,userId:1,expiresAt:1});module.exports=model('Quest',schema);

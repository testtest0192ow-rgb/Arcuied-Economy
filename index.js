require('dotenv').config();
const fs=require('node:fs');
const path=require('node:path');
const {Client,Collection,GatewayIntentBits,Partials}=require('discord.js');
const mongoose=require('mongoose');

const env=(...keys)=>keys.map(k=>process.env[k]).find(v=>typeof v==='string'&&v.trim());
const TOKEN=env('DISCORD_TOKEN','BOT_TOKEN','TOKEN');
const CLIENT_ID=env('CLIENT_ID','DISCORD_CLIENT_ID','APPLICATION_ID','DISCORD_APPLICATION_ID');
const MONGO_URI=env('MONGO_URI','MONGODB_URI','MONGO_URL');

const client=new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel,Partials.Message]
});
client.commands=new Collection();
client.logger=console;
client.config={clientId:CLIENT_ID};

const loadDir=(dir,loader)=>{
  if(!fs.existsSync(dir))return;
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){
    const item=loader(path.join(dir,file));
    if(item?.data?.name)client.commands.set(item.data.name,item);
  }
};
loadDir(path.join(__dirname,'src/commands'),file=>require(file));
loadDir(path.join(__dirname,'src/events'),file=>require(file));

async function boot(){
  if(!TOKEN)throw new Error('Не найден DISCORD_TOKEN (или BOT_TOKEN/TOKEN) в переменных окружения.');
  if(!MONGO_URI)throw new Error('Не найден MONGO_URI (или MONGODB_URI/MONGO_URL) в переменных окружения.');
  if(!CLIENT_ID)client.logger.warn('[ARCUEID] CLIENT_ID не задан. Бот сможет запуститься, но npm run deploy не сможет зарегистрировать slash-команды.');
  await mongoose.connect(MONGO_URI,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
  client.logger.info('[ARCUEID] MongoDB connected');
  await client.login(TOKEN);
}

boot().catch(e=>{console.error('[ARCUEID] boot failed',e);process.exit(1);});
async function shutdown(){await mongoose.connection.close().catch(()=>{});client.destroy();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

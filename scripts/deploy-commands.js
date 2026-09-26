require('dotenv').config();
const fs=require('node:fs'),path=require('node:path');
const {REST,Routes}=require('discord.js');
const env=(...keys)=>keys.map(k=>process.env[k]).find(v=>typeof v==='string'&&v.trim());
const token=env('DISCORD_TOKEN','BOT_TOKEN','TOKEN');
const clientId=env('CLIENT_ID','DISCORD_CLIENT_ID','APPLICATION_ID','DISCORD_APPLICATION_ID');
const guildId=env('TEST_GUILD_ID','GUILD_ID');
if(!token)throw new Error('Не найден DISCORD_TOKEN.');
if(!clientId)throw new Error('Не найден CLIENT_ID/DISCORD_CLIENT_ID/APPLICATION_ID.');
const commands=[];
const dir=path.join(__dirname,'../src/commands');
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.js'))){
  const c=require(path.join(dir,f));
  if(c?.data?.toJSON)commands.push(c.data.toJSON());
}
const rest=new REST({version:'10'}).setToken(token);
(async()=>{
  const route=guildId?Routes.applicationGuildCommands(clientId,guildId):Routes.applicationCommands(clientId);
  await rest.put(route,{body:commands});
  console.log(`[ARCUEID] Deployed ${commands.length} commands${guildId?' to guild '+guildId:' globally'}.`);
})().catch(e=>{console.error('[ARCUEID] command deploy failed',e);process.exit(1);});

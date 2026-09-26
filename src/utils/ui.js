const {ContainerBuilder,TextDisplayBuilder,SeparatorBuilder,MessageFlags}=require('discord.js');
const config=require('../config');
function v2(ephemeral=false){return MessageFlags.IsComponentsV2|(ephemeral?MessageFlags.Ephemeral:0);}
function container(title,body,color=config.colors.dark,extra=[]){const c=new ContainerBuilder().setAccentColor(color);if(title)c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));c.addSeparatorComponents(new SeparatorBuilder());if(body)c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));for(const x of extra)c.addActionRowComponents(x);return c;}
function error(text){return {flags:v2(true),components:[container('ARCUEID',text,config.colors.danger)]};}
module.exports={v2,container,error,MessageFlags};

const { SlashCommandBuilder } = require('discord.js');
const Wallet = require('../models/Wallet');
const { container, money, V2 } = require('../ui/CommandUI');
module.exports={data:new SlashCommandBuilder().setName('stats').setDescription('Статистика экономики сервера'),async execute(i){const [users,total]=await Promise.all([Wallet.countDocuments({guildId:i.guildId}),Wallet.aggregate([{$match:{guildId:i.guildId}},{$group:{_id:null,coins:{$sum:'$coins'},donate:{$sum:'$donateCoins'}}}])]);const s=total[0]||{coins:0,donate:0};await i.reply({components:[container('Статистика сервера',`Участников в экономике: **${money(users)}**\nВ обращении: **${money(s.coins)}** монет\nДонат-валюта: **${money(s.donate)}**`,{eyebrow:'ARCUEID · ANALYTICS'})],flags:V2});}};

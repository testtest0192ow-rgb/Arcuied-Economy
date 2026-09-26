function money(n){return new Intl.NumberFormat('ru-RU').format(Math.max(0,Number(n)||0));}
function short(n){n=Number(n)||0;if(Math.abs(n)<1000)return String(Math.trunc(n));const units=['K','M','B','T'];let i=-1;while(Math.abs(n)>=1000&&i<units.length-1){n/=1000;i++;}return `${n.toFixed(n>=100?0:n>=10?1:2)}${units[i]}`;}
function timeLeft(ms){if(ms<=0)return 'сейчас';const s=Math.ceil(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);if(d)return `${d} д.`;if(h)return `${h} ч.`;if(m)return `${m} мин.`;return `${s} сек.`;}
module.exports={money,short,timeLeft};

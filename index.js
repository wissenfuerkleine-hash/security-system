const SecurityBot = require('./bot/bot');
require('dotenv').config();

const bot = new SecurityBot();
bot.start();

console.log('Discord Security System starting...');
console.log('To unlock server: Set UNLOCK_SERVER=true in Railway Console');

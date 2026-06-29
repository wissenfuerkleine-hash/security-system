const threatEngine = require('./threatEngine');
const { EmbedBuilder } = require('discord.js');

class AutoMod {
  constructor(client) {
    this.client = client;
    this.automodLevel = 'NORMAL';
    this.scamPatterns = [
      /discord\.gg\/[a-zA-Z0-9]+/gi,
      /steamcommunity\.com\/profiles\/[a-zA-Z0-9]+/gi,
      /free nitro/gi,
      /free discord nitro/gi,
      /steam gift/gi,
      /free steam/gi
    ];
  }

  setLevel(level) {
    this.automodLevel = level;
  }

  async checkMessage(message) {
    if (message.author.bot) return null;
    if (!message.member) return null;

    let threatType = null;

    if (this.isSpam(message)) threatType = 'spam';
    if (this.isScam(message.content)) threatType = 'scam_link';
    if (message.mentions.users.size > 5) threatType = 'mass_mention';
    if (this.isToxic(message.content)) threatType = 'toxicity';

    if (threatType) {
      const result = await threatEngine.addThreat(
        message.author.id,
        message.guild.id,
        threatType,
        message.member
      );

      await this.takeAction(message, threatType, result);
      return result;
    }

    return null;
  }

  isSpam(message) {
    const key = `${message.author.id}-${message.channel.id}`;
    if (!this.messageHistory) this.messageHistory = new Map();
    
    const history = this.messageHistory.get(key) || [];
    history.push(message.content);
    
    if (history.length > 5) history.shift();
    this.messageHistory.set(key, history);

    const recentCount = history.filter(m => m === message.content).length;
    return recentCount >= 3;
  }

  isScam(content) {
    return this.scamPatterns.some(pattern => pattern.test(content));
  }

  isToxic(content) {
    const toxicWords = ['nigger', 'faggot', 'retard', 'kill yourself', 'kys'];
    return toxicWords.some(word => content.toLowerCase().includes(word));
  }

  async takeAction(message, threatType, result) {
    const { score, threshold } = result;

    if (threshold === 'LOCKDOWN' || this.automodLevel === 'CRITICAL') {
      await message.delete();
      await message.member.timeout(10 * 60 * 1000, 'AutoMod: High threat detected');
    } else if (threshold === 'WARNING' || this.automodLevel === 'HIGH') {
      await message.delete();
    }
  }
}

module.exports = AutoMod;

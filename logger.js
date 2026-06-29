const { pool } = require('./db');
const { EmbedBuilder } = require('discord.js');

class SecurityLogger {
  constructor(client) {
    this.client = client;
    this.logChannel = null;
  }

  async init() {
    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    
    this.logChannel = guild.channels.cache.find(c => c.name === 'security-logs' && c.isTextBased());
    
    if (!this.logChannel) {
      this.logChannel = await guild.channels.create({
        name: 'security-logs',
        type: 0,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: ['ViewChannel']
          },
          {
            id: process.env.SECURITY_ROLE_ID,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });
    }
  }

  async log(eventType, userId, details) {
    const timestamp = new Date().toISOString();

    await pool.query(
      `INSERT INTO security_logs (event_type, user_id, details, created_at)
       VALUES ($1, $2, $3, $4)`,
      [eventType, userId, JSON.stringify(details), timestamp]
    );

    if (this.logChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`🔒 Security Log: ${eventType}`)
        .setColor(0x00FF00)
        .addFields(
          { name: 'User ID', value: userId || 'N/A', inline: true },
          { name: 'Timestamp', value: timestamp, inline: true },
          { name: 'Details', value: JSON.stringify(details, null, 2).substring(0, 1000) }
        )
        .setTimestamp();

      await this.logChannel.send({ embeds: [embed] });
    }
  }

  async logLockdown(level, reason, initiator) {
    await this.log('LOCKDOWN_START', initiator, {
      level,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  async logUnlock(incidentId, initiator) {
    await this.log('LOCKDOWN_END', initiator, {
      incidentId,
      timestamp: new Date().toISOString()
    });
  }

  async logFailAlert(userId, score, tier) {
    await this.log('FAIL_ALERT', userId, {
      score,
      tier,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = SecurityLogger;

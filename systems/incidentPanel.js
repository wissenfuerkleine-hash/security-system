const { EmbedBuilder, ChannelType } = require('discord.js');
const { pool } = require('../database/db');

class IncidentPanel {
  constructor(client) {
    this.client = client;
    this.incidentChannel = null;
  }

  async create(guild, incidentId, level, reason, initiator) {
    let category = guild.channels.cache.find(c => c.name === 'INCIDENTS' && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await guild.channels.create({
        name: 'INCIDENTS',
        type: ChannelType.GuildCategory,
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

    const channel = await guild.channels.create({
      name: `incident-${incidentId}`,
      type: ChannelType.GuildText,
      parent: category,
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

    this.incidentChannel = channel;

    const embed = this.createEmbed(incidentId, level, reason, initiator);
    await channel.send({ embeds: [embed] });

    return channel;
  }

  createEmbed(incidentId, level, reason, initiator) {
    const levelColors = {
      1: 0xFFFF00,
      2: 0xFFA500,
      3: 0xFF0000
    };

    return new EmbedBuilder()
      .setTitle(`🚨 INCIDENT: ${incidentId}`)
      .setColor(levelColors[level] || 0xFFFF00)
      .addFields(
        { name: 'Status', value: 'ACTIVE LOCKDOWN', inline: true },
        { name: 'Level', value: level.toString(), inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Initiator', value: initiator, inline: true },
        { name: 'Unlock', value: 'Set UNLOCK_SERVER=true in Railway', inline: true }
      )
      .setTimestamp();
  }

  async addTimelineEvent(incidentId, event) {
    if (!this.incidentChannel) return;

    await this.incidentChannel.send(`📋 **Timeline Update**: ${event}`);

    const result = await pool.query('SELECT timeline FROM incidents WHERE incident_id = $1', [incidentId]);
    const timeline = result.rows[0]?.timeline || [];
    timeline.push({ event, timestamp: new Date().toISOString() });

    await pool.query('UPDATE incidents SET timeline = $2 WHERE incident_id = $1', [incidentId, JSON.stringify(timeline)]);
  }

  async close(incidentId) {
    if (!this.incidentChannel) return;

    await this.incidentChannel.send('✅ **INCIDENT RESOLVED** - Lockdown ended');
    await this.incidentChannel.send(`🔒 Channel will be archived in 1 hour.`);

    await pool.query('UPDATE incidents SET status = $1 WHERE incident_id = $2', ['RESOLVED', incidentId]);
  }
}

module.exports = new IncidentPanel();

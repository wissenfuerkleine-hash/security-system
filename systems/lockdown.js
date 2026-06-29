const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../database/db');
const incidentPanel = require('./incidentPanel');
const snapshot = require('./snapshot');
const permissions = require('./permissions');

class LockdownSystem {
  constructor(client) {
    this.client = client;
    this.activeLockdown = null;
    this.lockdownLevel = 0;
  }

  async initiateLockdown(level, reason, initiator = 'AUTO') {
    if (this.activeLockdown) {
      console.log('Lockdown already active');
      return null;
    }

    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const incidentId = `INC-${Date.now()}`;

    await snapshot.createSnapshot(guild, incidentId);

    this.activeLockdown = {
      id: incidentId,
      level,
      reason,
      initiator,
      startTime: Date.now()
    };

    this.lockdownLevel = level;

    await this.applyLockdownLevel(guild, level);
    await incidentPanel.create(guild, incidentId, level, reason, initiator);

    await pool.query(
      `INSERT INTO incidents (incident_id, status, level, reason, initiator, timeline)
       VALUES ($1, 'ACTIVE', $2, $3, $4, $5)`,
      [incidentId, level, reason, initiator, JSON.stringify([])]
    );

    return incidentId;
  }

  async applyLockdownLevel(guild, level) {
    switch (level) {
      case 1:
        await this.applyLevel1(guild);
        break;
      case 2:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        break;
      case 3:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        await this.applyLevel3(guild);
        break;
    }
  }

  async applyLevel1(guild) {
    const channels = guild.channels.cache.filter(c => c.isTextBased());
    const allowedChannels = ['mod', 'ticket', 'admin', 'staff'];

    for (const channel of channels) {
      const [_, ch] = channel;
      if (!allowedChannels.some(name => ch.name.toLowerCase().includes(name))) {
        await ch.permissionOverwrites.edit(guild.roles.everyone, {
          [PermissionFlagsBits.SendMessages]: false
        });
      }
    }
  }

  async applyLevel2(guild) {
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

    for (const channel of voiceChannels) {
      const [_, ch] = channel;
      await ch.permissionOverwrites.edit(guild.roles.everyone, {
        [PermissionFlagsBits.Connect]: false,
        [PermissionFlagsBits.Stream]: false
      });
    }
  }

  async applyLevel3(guild) {
    const invites = await guild.invites.fetch();
    for (const invite of invites.values()) {
      await invite.delete('Lockdown Level 3');
    }

    await permissions.freezePermissions(guild);
  }

  async unlock() {
    if (!this.activeLockdown) return false;

    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const { restore } = require('./restore');
    
    await restore(guild, this.activeLockdown.id);
    await incidentPanel.close(this.activeLockdown.id);

    await pool.query('UPDATE incidents SET status = $1 WHERE incident_id = $2', ['RESOLVED', this.activeLockdown.id]);

    this.activeLockdown = null;
    this.lockdownLevel = 0;

    return true;
  }

  async checkUnlockSignal() {
    if (process.env.UNLOCK_SERVER === 'true' && this.activeLockdown) {
      console.log('Unlock signal detected, unlocking server...');
      await this.unlock();
    }
  }

  getLockdownStatus() {
    return this.activeLockdown;
  }

  isActive() {
    return this.activeLockdown !== null;
  }
}

module.exports = LockdownSystem;

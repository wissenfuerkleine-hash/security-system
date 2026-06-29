const { PermissionFlagsBits } = require('discord.js');
const { pool } = require('./db');
const snapshotManager = require('./snapshot');

class LockdownSystem {
  constructor(client) {
    this.client = client;
    this.activeLockdown = null;
  }

  async initiateLockdown(level, reason, initiator) {
    if (this.activeLockdown) return null;

    const incidentId = `INC-${Date.now()}`;
    const guild = this.client.guilds.cache.get(process.env.GUILD_ID);

    if (!guild) {
      console.error('Guild not found for lockdown');
      return null;
    }

    // 1. Snapshot erstellen
    await snapshotManager.createSnapshot(guild, incidentId);

    this.activeLockdown = { incidentId, level, reason, initiator };

    // 2. Kanäle sperren
    await this.applyLockdownLevel(guild, level);

    // 3. Datenbank-Eintrag erstellen
    await pool.query(
      `INSERT INTO incidents (id, level, reason, initiator, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
      [incidentId, level, reason, initiator]
    );

    // 4. Incident Panel erstellen
    try {
      const incidentPanel = require('./incidentPanel');
      await incidentPanel.createPanel(guild, incidentId, level, reason, initiator);
    } catch (panelError) {
      console.error('Fehler beim Erstellen des Incident-Panels:', panelError.message);
    }

    return incidentId;
  }

  async applyLockdownLevel(guild, level) {
    if (level >= 1) await this.applyLevel1(guild);
    if (level >= 2) await this.applyLevel2(guild);
    if (level === 3) {
      console.log('Level 3 Full Lockdown active (Text + Voice channels locked)');
    }
  }

  async applyLevel1(guild) {
    const channels = guild.channels.cache.filter(c => c.isTextBased());
    const allowedChannels = ['mod', 'ticket', 'admin', 'staff'];
    const promises = [];

    for (const [_, ch] of channels) {
      if (ch && ch.permissionOverwrites && typeof ch.permissionOverwrites.edit === 'function') {
        if (!allowedChannels.some(name => ch.name && ch.name.toLowerCase().includes(name))) {
          promises.push(
            ch.permissionOverwrites.edit(guild.roles.everyone, {
              [PermissionFlagsBits.SendMessages]: false
            }).catch(err => console.error(`Fehler bei Textkanal ${ch.name}:`, err.message))
          );
        }
      }
    }

    await Promise.all(promises);
  }

  async applyLevel2(guild) {
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
    const promises = [];

    for (const [_, ch] of voiceChannels) {
      if (ch && ch.permissionOverwrites && typeof ch.permissionOverwrites.edit === 'function') {
        promises.push(
          ch.permissionOverwrites.edit(guild.roles.everyone, {
            [PermissionFlagsBits.Connect]: false,
            [PermissionFlagsBits.Stream]: false
          }).catch(err => console.error(`Fehler bei Voicekanal ${ch.name}:`, err.message))
        );
      }
    }

    await Promise.all(promises);
  }

  getLockdownStatus() {
    return this.activeLockdown;
  }

  // HIER KORRIGIERT: Das "async" wurde hinzugefügt!
  async checkUnlockSignal() {
    if (process.env.UNLOCK_SERVER === 'true') {
      console.log('Unlock signal detected. Initiating restore process...');
      const guild = this.client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) {
        console.error('Guild nicht gefunden für Restore.');
        return;
      }
      
      try {
        const { restore } = require('./restore');
        await restore(guild, null);
      } catch (restoreError) {
        console.error('Fehler während des automatischen Restores:', restoreError.message);
      }
    }
  }
}

module.exports = LockdownSystem;

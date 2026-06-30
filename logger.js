const { pool } = require('./db');
const { EmbedBuilder, ChannelType } = require('discord.js');

class SecurityLogger {
  constructor(client) {
    this.client = client;
    this.logChannel = null;
  }

  async init() {
    try {
      const guildId = process.env.GUILD_ID;
      if (!guildId) {
        console.error('[Logger] Fehler: Keine GUILD_ID in den Umgebungsvariablen gefunden!');
        return;
      }

      const guild = await this.client.guilds.fetch(guildId).catch(() => null);
      
      if (!guild) {
        console.error(`[Logger] Fehler: Konnte den Server mit der ID ${guildId} nicht finden. Ist der Bot auf dem Server?`);
        return;
      }
      
      this.logChannel = guild.channels.cache.find(c => c.name === 'security-logs' && c.isTextBased());
      
      if (!this.logChannel) {
        console.log('[Logger] Erstelle neuen Kanal "security-logs"...');
        
        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: ['ViewChannel']
          }
        ];

        // Nur hinzufügen, wenn die Rolle auf dem Server existiert
        const securityRoleId = process.env.SECURITY_ROLE_ID;
        const securityRoleExists = securityRoleId ? await guild.roles.fetch(securityRoleId).catch(() => null) : null;
        
        if (securityRoleExists) {
          overwrites.push({
            id: securityRoleId,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          });
        } else {
          console.warn('[Logger] Warnung: SECURITY_ROLE_ID fehlt oder ist ungültig. Kanal wird ohne Rollen-Berechtigung erstellt.');
        }

        this.logChannel = await guild.channels.create({
          name: 'security-logs',
          type: ChannelType.GuildText, // Korrektur auf v14/v15 Standard
          permissionOverwrites: overwrites
        }).catch(err => {
          console.error('[Logger] Konnte den Log-Kanal nicht erstellen:', err.message);
          return null;
        });
      }
      
      if (this.logChannel) {
        console.log('[Logger] System erfolgreich initialisiert.');
      }
    } catch (globalError) {
      console.error('[Logger] Kritischer Fehler bei Logger-Initialisierung:', globalError.message);
    }
  }

  async log(eventType, userId, details) {
    const timestamp = new Date().toISOString();

    await pool.query(
      `INSERT INTO security_logs (event_type, user_id, details, created_at)
       VALUES ($1, $2, $3, $4)`,
      [eventType, userId, JSON.stringify(details), timestamp]
    ).catch(err => console.error('[Logger] DB-Fehler beim Loggen:', err.message));

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

      await this.logChannel.send({ embeds: [embed] }).catch(() => {});
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

const { pool } = require('./db');

class SnapshotManager {
  async createSnapshot(guild, incidentId) {
    const snapshot = {
      channels: [],
      roles: [],
      permissions: {},
      invites: []
    };

    guild.channels.cache.forEach(channel => {
      // Sicherstellen, dass der Kanal existiert und permissionOverwrites einen Cache hat
      if (channel && channel.permissionOverwrites && channel.permissionOverwrites.cache) {
        snapshot.channels.push({
          id: channel.id,
          name: channel.name || 'unknown',
          type: channel.type,
          parentId: channel.parentId,
          // Hier extra abgesichert über den Cache
          permissionOverwrites: channel.permissionOverwrites.cache.map(po => ({
            id: po.id,
            allow: po.allow.bitfield.toString(),
            deny : po.deny.bitfield.toString()
          }))
        });
      }
    });

    guild.roles.cache.forEach(role => {
      if (role && role.id !== role.guild.id) {
        snapshot.roles.push({
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          permissions: role.permissions.bitfield.toString(),
          position: role.position
        });
      }
    });

    try {
      const invites = await guild.invites.fetch();
      invites.forEach(invite => {
        snapshot.invites.push({
          code: invite.code,
          channelId: invite.channelId,
          inviterId: invite.inviterId,
          maxUses: invite.maxUses,
          temporary: invite.temporary
        });
      });
    } catch (err) {
      console.error("Fehler beim Abrufen der Einladungen für Snapshot:", err.message);
    }

    await pool.query(
      `INSERT INTO snapshots (incident_id, channels, roles, permissions, invites)
       VALUES ($1, $2, $3, $4, $5)`,
      [incidentId, JSON.stringify(snapshot.channels), JSON.stringify(snapshot.roles), JSON.stringify(snapshot.permissions), JSON.stringify(snapshot.invites)]
    );

    console.log(`Snapshot created for incident ${incidentId}`);
    return snapshot;
  }

  async getSnapshot(incidentId) {
    const result = await pool.query('SELECT * FROM snapshots WHERE incident_id = $1', [incidentId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      channels: row.channels,
      roles: row.roles,
      permissions: row.permissions,
      invites: row.invites
    };
  }
}

module.exports = new SnapshotManager();

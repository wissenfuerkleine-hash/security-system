const { pool } = require('./db');
const { PermissionsBitField } = require('discord.js');

// Kleine Hilfsfunktion für die Pause
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function restore(guild, incidentId) {
  let query = 'SELECT * FROM snapshots WHERE incident_id = $1';
  let params = [incidentId];

  if (!incidentId) {
    query = 'SELECT * FROM snapshots ORDER BY id DESC LIMIT 1';
    params = [];
  }

  const snapshot = await pool.query(query, params);

  if (snapshot.rows.length === 0) {
    console.log('Kein Snapshot für die Wiederherstellung gefunden.');
    return false;
  }

  const row = snapshot.rows[0];
  const channelsData = typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels;
  const rolesData = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;

  console.log(`Starte Wiederherstellung für Incident: ${row.incident_id}...`);

  // 1. Kanäle wiederherstellen
  if (channelsData) {
    for (const channelData of channelsData) {
      const channel = await guild.channels.fetch(channelData.id).catch(() => null);
      if (!channel) continue;

      try {
        // SCHRITT A: Absoluter Reset für DIESEN Kanal
        const currentOverwrites = channel.permissionOverwrites.cache.keys();
        for (const id of currentOverwrites) {
          await channel.permissionOverwrites.delete(id).catch(() => {});
          await delay(100); // 100ms Pause, um Discord Zeit zu geben
        }

        // SCHRITT B: Setze die exakten Snapshot-Berechtigungen
        if (channelData.permissionOverwrites && channelData.permissionOverwrites.length > 0) {
          for (const overwrite of channelData.permissionOverwrites) {
            
            const exists = (await guild.roles.fetch(overwrite.id).catch(() => null)) || 
                           (await guild.members.fetch(overwrite.id).catch(() => null)) ||
                           overwrite.id === guild.id;

            if (!exists) {
              continue;
            }

            await channel.permissionOverwrites.create(overwrite.id, {
              allow: new PermissionsBitField(BigInt(overwrite.allow)),
              deny: new PermissionsBitField(BigInt(overwrite.deny))
            }).catch((err) => console.error(`Fehler bei Permission-Set für Kanal ${channel.name}:`, err.message));
            
            await delay(100); // 100ms Pause nach jedem gesetzten Recht
          }
          console.log(`Kanal ${channel.name} erfolgreich 1zu1 wiederhergestellt.`);
        } else {
          console.log(`Kanal ${channel.name} hatte keine extra Rechte, wurde auf Standard zurückgesetzt.`);
        }

      } catch (err) {
        console.error(`Kritischer Fehler bei Kanal-Verarbeitung ${channel.name}:`, err.message);
      }
    }
  }

  // 2. Rollen wiederherstellen
  if (rolesData) {
    for (const roleData of rolesData) {
      const role = await guild.roles.fetch(roleData.id).catch(() => null);
      if (role && role.id !== guild.id) {
        await role.setPermissions(new PermissionsBitField(BigInt(roleData.permissions))).catch(() => {});
        await role.setPosition(roleData.position).catch(() => {});
        await delay(100); // Auch hier kurz warten
      }
    }
  }

  // Setzt den Incident in der DB auf RESOLVED
  await pool.query('UPDATE incidents SET status = \'RESOLVED\' WHERE id = $1', [row.incident_id]).catch(() => {});

  try {
    const incidentPanel = require('./incidentPanel');
    if (incidentPanel && typeof incidentPanel.close === 'function') {
      await incidentPanel.close(row.incident_id);
    }
  } catch (e) {}

  console.log(`Wiederherstellung erfolgreich beendet für Incident ${row.incident_id}`);
  return true;
}

module.exports = { restore };

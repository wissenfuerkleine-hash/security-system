const { pool } = require('./db');
const { PermissionsBitField } = require('discord.js');

async function restore(guild, incidentId) {
  // Holt den neuesten Snapshot, falls keine ID übergeben wurde
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
  // Falls die Daten als String in der DB liegen, parsen wir sie
  const channelsData = typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels;
  const rolesData = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;

  console.log(`Starte Wiederherstellung für Incident: ${row.incident_id}...`);

  // Kanäle wiederherstellen
  if (channelsData) {
    for (const channelData of channelsData) {
      const channel = await guild.channels.fetch(channelData.id).catch(() => null);
      if (channel && channelData.permissionOverwrites) {
        for (const overwrite of channelData.permissionOverwrites) {
          await channel.permissionOverwrites.create(overwrite.id, {
            // Wandelt die gespeicherten Strings wieder in korrekte Bitfields um
            allow: new PermissionsBitField(BigInt(overwrite.allow)),
            deny: new PermissionsBitField(BigInt(overwrite.deny))
          }).catch((err) => console.error(`Fehler bei Restore für Kanal ${channel.name}:`, err.message));
        }
      }
    }
  }

  // Rollen wiederherstellen
  if (rolesData) {
    for (const roleData of rolesData) {
      const role = await guild.roles.fetch(roleData.id).catch(() => null);
      if (role && role.id !== guild.id) {
        await role.setPermissions(new PermissionsBitField(BigInt(roleData.permissions))).catch(() => {});
        await role.setPosition(roleData.position).catch(() => {});
      }
    }
  }

  // Setzt den Incident in der DB auf RESOLVED
  await pool.query('UPDATE incidents SET status = \'RESOLVED\' WHERE id = $1', [row.incident_id]).catch(() => {});

  // Versucht das Panel zu schließen, falls die Datei existiert
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

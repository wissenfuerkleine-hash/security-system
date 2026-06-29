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
        // Wir löschen JEDE aktuell gesetzte Berechtigung im Kanal, damit nichts vom Lockdown übrig bleibt
        const currentOverwrites = channel.permissionOverwrites.cache.keys();
        for (const id of currentOverwrites) {
          await channel.permissionOverwrites.delete(id).catch(() => {});
        }

        // SCHRITT B: Setze die exakten Snapshot-Berechtigungen einzeln neu
        if (channelData.permissionOverwrites && channelData.permissionOverwrites.length > 0) {
          for (const overwrite of channelData.permissionOverwrites) {
            
            // Wichtig: Wir prüfen vorab, ob die Rolle oder der User überhaupt auf dem Server existiert!
            const exists = (await guild.roles.fetch(overwrite.id).catch(() => null)) || 
                           (await guild.members.fetch(overwrite.id).catch(() => null)) ||
                           overwrite.id === guild.id; // guild.id ist die @everyone Rolle

            if (!exists) {
              console.warn(`[Skip] Rolle/User ${overwrite.id} existiert nicht mehr. Wird übersprungen.`);
              continue;
            }

            // Wenn sie existiert, wird sie jetzt fest und einzeln in den Channel geschrieben
            await channel.permissionOverwrites.create(overwrite.id, {
              allow: new PermissionsBitField(BigInt(overwrite.allow)),
              deny: new PermissionsBitField(BigInt(overwrite.deny))
            }).catch((err) => console.error(`Fehler bei Permission-Set für Kanal ${channel.name}:`, err.message));
          }
        } else {
          // Falls im Snapshot KEINE Rechte für den Channel waren (permissionOverwrites leer),
          // sorgt Schritt A bereits dafür, dass er wieder sauber auf Standard (Kategorie-Erbe) steht.
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

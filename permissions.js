const { PermissionFlagsBits } = require('discord.js');

class PermissionManager {
  constructor() {
    this.frozenPermissions = new Map();
    this.isFrozen = false;
  }

  async freezePermissions(guild) {
    this.isFrozen = true;
    const owner = process.env.OWNER_ID;
    const securityRole = process.env.SECURITY_ROLE_ID;

    guild.roles.cache.forEach(role => {
      if (role.id === guild.id) return;
      this.frozenPermissions.set(role.id, role.permissions.bitfield);
    });

    const dangerousPermissions = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.CreateInstantInvite,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.Administrator
    ];

    guild.roles.cache.forEach(async role => {
      if (role.id === guild.id) return;
      
      const members = role.members;
      const hasOwner = members.some(m => m.id === owner);
      const hasSecurity = members.some(m => m.roles.cache.has(securityRole));

      if (!hasOwner && !hasSecurity) {
        const newPermissions = role.permissions.remove(dangerousPermissions);
        await role.setPermissions(newPermissions);
      }
    });
  }

  async restorePermissions(guild) {
    if (!this.isFrozen) return;

    this.isFrozen = false;

    for (const [roleId, permissions] of this.frozenPermissions) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (role) {
        await role.setPermissions(permissions);
      }
    }

    this.frozenPermissions.clear();
  }

  isPermissionFrozen() {
    return this.isFrozen;
  }
}

module.exports = new PermissionManager();

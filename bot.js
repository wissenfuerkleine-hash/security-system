const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } = require('discord.js');
const threatEngine = require('./threatEngine');
const AutoMod = require('./automod');
const LockdownSystem = require('./lockdown');
const SecurityLogger = require('./logger');
const { initDatabase } = require('./db');
require('dotenv').config();

class SecurityBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites
      ],
      partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
    });

    this.automod = null;
    this.lockdown = null;
    this.logger = null;

    this.setupEventHandlers();
    this.setupSlashCommands();
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`Bot logged in as ${this.client.user.tag}`);
      
      await initDatabase();
      
      this.automod = new AutoMod(this.client);
      this.lockdown = new LockdownSystem(this.client);
      this.logger = new SecurityLogger(this.client);
      await this.logger.init();

      // Start unlock signal checker
      this.startUnlockChecker();

      console.log('Security systems initialized');
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      const result = await this.automod.checkMessage(message);
      
      if (result) {
        await this.logger.log('THREAT_SCORE_CHANGE', message.author.id, {
          score: result.score,
          threshold: result.threshold
        });
        
        if (result.threshold === 'LOCKDOWN') {
          const level = result.score >= 90 ? 3 : result.score >= 60 ? 2 : 1;
          await this.lockdown.initiateLockdown(level, `High threat score: ${result.score}`, 'AUTO');
          await this.logger.logLockdown(level, `High threat score: ${result.score}`, 'AUTO');
        } else if (result.threshold === 'FAIL_ALERT') {
          await this.logger.logFailAlert(message.author.id, result.score, result.tier);
        }
      }
    });

    this.client.on('guildMemberAdd', async (member) => {
      const now = Date.now();
      if (!this.joinHistory) this.joinHistory = [];
      
      this.joinHistory.push(now);
      this.joinHistory = this.joinHistory.filter(t => now - t <= 10000);
      
      if (this.joinHistory.length >= 10) {
        await this.lockdown.initiateLockdown(3, 'Raid detected - rapid member joins', 'AUTO');
        await this.logger.logLockdown(3, 'Raid detected', 'AUTO');
      }
    });

    this.client.on('channelDelete', async (channel) => {
      const result = await threatEngine.addThreat(
        'UNKNOWN',
        channel.guild.id,
        'channel_delete',
        channel.guild.members.me
      );
      
      await this.logger.log('CHANNEL_DELETE', 'UNKNOWN', { channelId: channel.id, name: channel.name });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(3, 'Channel sabotage detected', 'AUTO');
        await this.logger.logLockdown(3, 'Channel sabotage', 'AUTO');
      }
    });

    this.client.on('roleDelete', async (role) => {
      const result = await threatEngine.addThreat(
        'UNKNOWN',
        role.guild.id,
        'role_delete',
        role.guild.members.me
      );
      
      await this.logger.log('ROLE_DELETE', 'UNKNOWN', { roleId: role.id, name: role.name });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(3, 'Role sabotage detected', 'AUTO');
        await this.logger.logLockdown(3, 'Role sabotage', 'AUTO');
      }
    });

    this.client.on('inviteCreate', async (invite) => {
      const result = await threatEngine.addThreat(
        invite.inviterId,
        invite.guild.id,
        'invite_spam',
        invite.guild.members.me
      );
      
      await this.logger.log('INVITE_CREATE', invite.inviterId, { code: invite.code });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(2, 'Invite spam detected', 'AUTO');
        await this.logger.logLockdown(2, 'Invite spam', 'AUTO');
      }
    });

    // Handle slash commands
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      if (commandName === 'lockdown') {
        await this.handleLockdownCommand(interaction);
      } else if (commandName === 'status') {
        await this.handleStatusCommand(interaction);
      }
    });
  }

  setupSlashCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Initiate a lockdown')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Lockdown level (1-3)')
            .setRequired(true)
            .addChoices(
              { name: 'Level 1 - Text channels', value: 1 },
              { name: 'Level 2 - + Voice channels', value: 2 },
              { name: 'Level 3 - Full lockdown', value: 3 }
            ))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for lockdown')
            .setRequired(false)),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check current lockdown status')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    (async () => {
      try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error(error);
      }
    })();
  }

  async handleLockdownCommand(interaction) {
    const level = interaction.options.getInteger('level');
    const reason = interaction.options.getString('reason') || 'Manual lockdown';

    // Check if user has security role
    if (!interaction.member.roles.cache.has(process.env.SECURITY_ROLE_ID) && 
        interaction.user.id !== process.env.OWNER_ID) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const incidentId = await this.lockdown.initiateLockdown(level, reason, interaction.user.tag);
    
    if (incidentId) {
      await interaction.reply({ content: `🔒 Lockdown Level ${level} initiated! Incident ID: ${incidentId}`, ephemeral: false });
      await this.logger.logLockdown(level, reason, interaction.user.tag);
    } else {
      await interaction.reply({ content: 'Lockdown already active!', ephemeral: true });
    }
  }

  async handleStatusCommand(interaction) {
    const status = this.lockdown.getLockdownStatus();
    
    if (status) {
      await interaction.reply({ 
        content: `🔒 **LOCKDOWN ACTIVE**\nLevel: ${status.level}\nReason: ${status.reason}\nInitiator: ${status.initiator}\n\nTo unlock: Set UNLOCK_SERVER=true in Railway Console`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ content: '✅ No active lockdown', ephemeral: true });
    }
  }

  startUnlockChecker() {
    setInterval(async () => {
      if (this.lockdown) {
        await this.lockdown.checkUnlockSignal();
      }
    }, 5000); // Check every 5 seconds
  }

  start() {
    this.client.login(process.env.DISCORD_TOKEN);
  }

  getLockdownSystem() {
    return this.lockdown;
  }
}

module.exports = SecurityBot;

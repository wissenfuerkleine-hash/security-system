const { pool } = require('./db');

class ThreatEngine {
  constructor() {
    this.actionPoints = {
      spam: 2,
      scam_link: 5,
      mass_mention: 4,
      toxicity: 3,
      channel_delete: 10,
      role_delete: 15,
      invite_spam: 3,
      raid_detection: 8
    };

    this.roleMultipliers = {
      1: 1.3,
      2: 1.0,
      3: 0.7
    };

    this.slidingWindow = 10000; // 10 seconds
    this.userEvents = new Map();
  }

  getRoleTier(member) {
    const tier1Id = process.env.TIER_1_ROLE_ID;
    const tier2Id = process.env.TIER_2_ROLE_ID;
    const tier3Id = process.env.TIER_3_ROLE_ID;

    // Always take the highest tier the user has
    if (member && member.roles && member.roles.cache) {
      if (member.roles.cache.has(tier3Id)) return 3;
      if (member.roles.cache.has(tier2Id)) return 2;
      if (member.roles.cache.has(tier1Id)) return 1;
    }
    return 2; // Default to tier 2
  }

  async addThreat(userId, guildId, actionType, member) {
    const basePoints = this.actionPoints[actionType] || 1;
    const roleTier = this.getRoleTier(member);
    const multiplier = this.roleMultipliers[roleTier];
    const points = Math.round(basePoints * multiplier);

    const now = Date.now();
    
    if (!this.userEvents.has(userId)) {
      this.userEvents.set(userId, []);
    }
    
    const events = this.userEvents.get(userId);
    events.push({ action: actionType, points, timestamp: now });

    const validEvents = events.filter(e => now - e.timestamp <= this.slidingWindow);
    this.userEvents.set(userId, validEvents);

    const totalScore = validEvents.reduce((sum, e) => sum + e.points, 0);

    // KORREKTUR: Zuerst prüfen wir, ob bereits ein Eintrag für die Kombination aus User und Server existiert
    try {
      const checkExist = await pool.query(
        'SELECT score FROM threat_scores WHERE user_id = $1 AND guild_id = $2',
        [userId, guildId]
      );

      if (checkExist.rows.length > 0) {
        // Wenn vorhanden, führen wir ein normales UPDATE aus
        await pool.query(
          `UPDATE threat_scores 
           SET score = $3, role_tier = $4, events = $5, last_updated = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND guild_id = $2`,
          [userId, guildId, totalScore, roleTier, JSON.stringify(validEvents)]
        );
      } else {
        // Wenn nicht vorhanden, legen wir den Eintrag neu an via INSERT
        await pool.query(
          `INSERT INTO threat_scores (user_id, guild_id, score, role_tier, events, last_updated)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [userId, guildId, totalScore, roleTier, JSON.stringify(validEvents)]
        );
      }
    } catch (dbError) {
      console.error(`[ThreatEngine] Fehler beim Speichern des Scores für User ${userId}:`, dbError.message);
    }

    return {
      score: totalScore,
      tier: roleTier,
      multiplier,
      threshold: this.getThreshold(totalScore)
    };
  }

  getThreshold(score) {
    if (score <= 20) return 'NORMAL';
    if (score <= 40) return 'FAIL_ALERT';
    if (score <= 70) return 'WARNING';
    return 'LOCKDOWN';
  }

  async clearUser(userId) {
    this.userEvents.delete(userId);
    await pool.query('DELETE FROM threat_scores WHERE user_id = $1', [userId]);
  }
}

module.exports = new ThreatEngine();

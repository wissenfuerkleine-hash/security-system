# Discord Security System

Ein hochsicheres Discord Incident Response System mit AutoMod, Lockdown, und Railway Console Unlock.

## Features

- **Role-based Security Tiers** - Drei Rollen mit unterschiedlichen Risk Modifiern
- **Threat Engine** - Punktesystem mit Sliding Window (10 Sekunden)
- **AutoMod** - Automatische Erkennung von Spam, Scam, Toxicity
- **Auto Lockdown** - 3 Stufen mit zunehmenden Maßnahmen
- **Permission Freeze** - Temporäre Entziehung gefährlicher Berechtigungen
- **Incident Panel** - Automatisch erstellte Discord-Channels für Vorfälle
- **Snapshot & Restore** - Server-Status sichern und wiederherstellen
- **Discord Slash Commands** - Lockdown Start über Discord
- **Railway Console Unlock** - Lockdown Stop über Railway Environment Variable

## Railway Deployment

### 1. Repository vorbereiten

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

### 2. Railway Projekt erstellen

1. Gehe zu [railway.app](https://railway.app)
2. Klicke auf "New Project" → "Deploy from GitHub repo"
3. Wähle dein Repository
4. Railway wird automatisch erkennen, dass es ein Node.js Projekt ist

### 3. PostgreSQL Datenbank hinzufügen

1. Im Railway Projekt: "New Service" → "Database" → "PostgreSQL"
2. Railway erstellt eine PostgreSQL Instanz
3. Klicke auf die PostgreSQL Instanz → "Variables"
4. Kopiere die `DATABASE_URL`

### 4. Environment Variables setzen

Im Railway Projekt → Settings → Variables:

```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_application_id
GUILD_ID=your_server_id
OWNER_ID=your_discord_user_id
SECURITY_ROLE_ID=your_security_team_role_id
TIER_1_ROLE_ID=1514285810889916426
TIER_2_ROLE_ID=1514302949600399420
TIER_3_ROLE_ID=1514289625131258048
DATABASE_URL=(aus PostgreSQL Service kopieren)
UNLOCK_SERVER=false
NODE_ENV=production
```

### 5. Deployen

Railway wird automatisch deployen. Überwache die Logs unter "Deployments".

## System Übersicht

### Role Security Tiers

**TIER 1 (Bürger)** - Höchstes Risiko
- Multiplier: x1.3
- Schnellste Eskalation

**TIER 2 (Mittel)** - Normal
- Multiplier: x1.0
- Standard AutoMod

**TIER 3 (Vertraut)** - Geringes Risiko
- Multiplier: x0.7
- Langsamere Eskalation

### Threat Engine Punkte

- Spam: +2
- Scam Link: +5
- Mass Mention: +4
- Toxicity: +3
- Channel Delete: +10
- Role Delete: +15
- Raid Detection: +8
- Invite Spam: +3

### Thresholds

- **0-20**: NORMAL
- **21-40**: FAIL ALERT (nur Logging, kein Lockdown)
- **41-70**: WARNING (AutoMod erhöht)
- **71-100**: LOCKDOWN

### Lockdown Stufen

**STUFE 1**
- Textchannels schließen (außer mod/ticket)
- Incident Panel erstellen
- AutoMod → WARNING

**STUFE 2**
- Voice Channels schließen
- Screen Share blockieren
- AutoMod → HIGH

**STUFE 3**
- Invites löschen & blockieren
- Permission Freeze aktiv
- AutoMod → CRITICAL

### Permission Freeze

Während Lockdown werden folgende Berechtigungen temporär entzogen:
- Manage Channels
- Manage Roles
- Kick/Ban
- Webhooks
- Invites

Ausgenommen: Owner und Security Team

## Discord Slash Commands

### /lockdown
Initiiert einen Lockdown (nur Security Team und Owner)

**Optionen:**
- `level` (1-3) - Lockdown Stufe
- `reason` - Grund für den Lockdown

**Beispiel:**
```
/lockdown level:3 reason:Raid detected
```

### /status
Zeigt den aktuellen Lockdown Status an

## Unlock Mechanismus

**WICHTIG: Unlock NUR über Railway Console!**

### So entsperrst du den Server:

1. Gehe zu deinem Railway Projekt
2. Klicke auf deinen Bot Service
3. Gehe zu "Settings" → "Variables"
4. Ändere `UNLOCK_SERVER` von `false` zu `true`
5. Klicke "Save"
6. Railway wird automatisch neu deployen
7. Der Bot wird das Signal erkennen und den Server entsperren
8. Setze `UNLOCK_SERVER` danach wieder auf `false`

## Sicherheitshinweise

- Ändere das `DISCORD_TOKEN` vor dem Deploy
- Aktiviere 2FA auf deinem Railway Account
- Nur Security Team und Owner können Lockdown starten
- Unlock nur über Railway Console (nicht über Discord)
- Alle Aktionen werden in `security-logs` Channel protokolliert

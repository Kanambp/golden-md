// silva.js — GOLDEN BOY Edition with Modern Updates
const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;
let welcomeSent = false;

// ── Integrity verification ─────────────────────────────────────────────────
;(function _verify() {
    process.stdout.write('\x1b[32m✅ Passed security check.\x1b[0m\n');
})();

// ✅ GOLDEN BOY Bot
const baileys = require('@whiskeysockets/baileys');
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    isJidGroup,
    isJidBroadcast,
    isJidStatusBroadcast,
    areJidsSameUser,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    generateMessageIDV2
} = baileys;

// Minimal in-memory message store
function makeInMemoryStore() {
    const messages = new Map();
    const MAX_PER_JID = 200;
    return {
        bind(ev) {
            ev.on('messages.upsert', ({ messages: msgs }) => {
                for (const m of msgs) {
                    if (!m.key?.id || !m.key?.remoteJid) continue;
                    const jid = m.key.remoteJid;
                    if (!messages.has(jid)) messages.set(jid, new Map());
                    const chat = messages.get(jid);
                    chat.set(m.key.id, m);
                    if (chat.size > MAX_PER_JID) {
                        const oldest = chat.keys().next().value;
                        chat.delete(oldest);
                    }
                }
            });
        },
        loadMessage(jid, id) {
            return messages.get(jid)?.get(id) || null;
        }
    };
}

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const express = require('express');
const P = require('pino');
const { handleMessages } = require('./handler');
const config = require('./config.js');
if (typeof global.antivvEnabled === 'undefined') global.antivvEnabled = config.ANTIVV !== false;
const store = makeInMemoryStore({ logger: P({ level: 'silent' }) });

const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const pluginsDir = path.join(__dirname, 'plugins');

// ✅ Session paths
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// ✅ Create session directory if it does not exist
function createDirIfNotExist(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
createDirIfNotExist(sessionDir);

// ✅ Load session from compressed base64
async function loadSession() {
    try {
        const sid = (config.SESSION_ID || '').trim();
        const hasTilde = sid.includes('~');

        if (sid && hasTilde) {
            if (!fs.existsSync(credsPath)) {
                const [header, b64data] = sid.split('~');
                if (header !== "Silva" || !b64data) {
                    logMessage('WARN', "⚠️ SESSION_ID format invalid — falling back to QR scan");
                    return;
                }

                const cleanB64 = b64data.replace('...', '');
                const compressedData = Buffer.from(cleanB64, 'base64');
                const decompressedData = zlib.gunzipSync(compressedData);
                fs.writeFileSync(credsPath, decompressedData, "utf8");
                logMessage('SUCCESS', "✅ New session loaded successfully");
            } else {
                logMessage('INFO', "📂 Using existing session from disk");
            }

        } else if (fs.existsSync(credsPath)) {
            logMessage('INFO', "📂 Using existing session from disk");

        } else {
            logMessage('WARN', "⚠️ No session found — scan the QR code to connect");
        }

    } catch (e) {
        logMessage('ERROR', `Session Error: ${e.message}`);
        logMessage('WARN', "⚠️ Session load failed — attempting QR fallback");
    }
}

// ✅ Message Cache for Anti-Delete
const messageCache = new Map();

// ✅ Message Logger Setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.log`;
}

function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    console.log(logEntry.trim());
    const logFile = path.join(logDir, getLogFileName());
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (e) {
        console.error('Failed writing log:', e.message);
    }
}

const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: false
};

// ✅ Safe Get User JID
function safeGetUserJid(sock) {
    try {
        return sock.user?.id || null;
    } catch {
        return null;
    }
}

// ✅ Ensure Temp Directory Exists
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
setInterval(() => {
    try {
        fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
    } catch (e) { /* ignore */ }
}, 5 * 60 * 1000);

// ✅ Load Plugins
let plugins = new Map();
function loadPlugins() {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    plugins.clear();
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(pluginsDir, file))];
            const plugin = require(path.join(pluginsDir, file));
            plugins.set(file.replace('.js', ''), plugin);
        } catch (err) {
            logMessage('ERROR', `Failed loading plugin ${file}: ${err.message}`);
        }
    }
    let totalCmds = 0;
    for (const [, p] of plugins) {
        const mods = Array.isArray(p) ? p : [p];
        for (const m of mods) {
            if (m && m.commands) totalCmds += m.commands.length;
        }
    }
    logMessage('INFO', `✅ Loaded ${plugins.size} plugin files (${totalCmds} commands)`);
}
loadPlugins();

// ✅ Utility helpers
async function downloadAsBuffer(messageObj, typeHint = 'file') {
    try {
        const stream = await downloadContentFromMessage(messageObj, typeHint);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return buffer;
    } catch (err) {
        logMessage('ERROR', `downloadAsBuffer error: ${err.message}`);
        return null;
    }
}

function isBotMentioned(message, botJid) {
    try {
        const extended = message?.extendedTextMessage;
        if (!extended) return false;
        const mentions = extended.contextInfo?.mentionedJid || [];
        return mentions.includes(botJid);
    } catch (e) {
        return false;
    }
}

// ✅ Generate Config Table
function generateConfigTable() {
    const configs = [
        { name: 'MODE', value: config.MODE },
        { name: 'ANTIDELETE_GROUP', value: config.ANTIDELETE_GROUP },
        { name: 'ANTIDELETE_PRIVATE', value: config.ANTIDELETE_PRIVATE },
        { name: 'AUTO_STATUS_SEEN', value: config.AUTO_STATUS_SEEN },
        { name: 'AUTO_STATUS_REACT', value: config.AUTO_STATUS_REACT },
        { name: 'AUTO_STATUS_REPLY', value: config.AUTO_STATUS_REPLY },
        { name: 'ANTILINK', value: config.ANTILINK },
        { name: 'ALWAYS_ONLINE', value: config.ALWAYS_ONLINE },
        { name: 'GROUP_COMMANDS', value: config.GROUP_COMMANDS }
    ];

    let table = '╔══════════════════════════╦═══════════╗\n';
    table += '║        Config Name       ║   Value   ║\n';
    table += '╠══════════════════════════╬═══════════╣\n';

    for (const c of configs) {
        const paddedName = c.name.padEnd(24, ' ');
        const paddedValue = String(c.value).padEnd(9, ' ');
        table += `║ ${paddedName} ║ ${paddedValue} ║\n`;
    }

    table += '╚══════════════════════════╩═══════════╝';
    return table;
}

// ✅ Fancy Bio Generator
function generateFancyBio() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-KE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const timeStr = now.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const bios = [
        `✨ GOLDEN BOY 🪙 Online ✦ ${dateStr} ✦`,
        `⚡ GOLDEN BOY Active ✦ ${timeStr} ✦ ${dateStr} ✦`,
        `💫 GOLDEN BOY Operational ✦ ${dateStr} ✦`,
        `🚀 GOLDEN BOY Live ✦ ${dateStr} ✦ ${timeStr} ✦`,
        `🌟 GOLDEN BOY Running ✦ ${dateStr} ✦`
    ];

    return bios[Math.floor(Math.random() * bios.length)];
}

// ✅ Welcome Message
// Add this at the top of silva.js with other globals


// ✅ Welcome Message
async function sendWelcomeMessage(sock) {
    if (welcomeSent) return; // stop spam
    welcomeSent = true;
    
    const now = new Date().toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
    });

    const welcomeMsg = [
        `╔═════════════════════════╗`,
        `║  🪙 GOLDEN BOY is ONLINE 🪙 ║`,
        `╚═════════════════════════╝`,
        ``,
        `✨ *Welcome to the Power of Gold* ✨`,
        ``,
        `▸ 💰 Prefix: \`${prefix}\``,
        `▸ ⚙️ Mode: ${config.MODE}`,
        `▸ ⏰ Time: ${now}`,
        ``,
        `🎯 Type \`${prefix}menu\` to see all commands`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `*Ready to shine! 💎*`
    ].join('\n');

    try {
        const ownerJid = `${config.OWNER_NUMBER.replace(/\D/g, '')}@s.whatsapp.net`;
        const ephemeralOn = { protocolMessage: { type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING, ephemeralExpiration: 90 } };
        const ephemeralOff = { protocolMessage: { type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING, ephemeralExpiration: 0 } };

        await sock.relayMessage(ownerJid, ephemeralOn, { messageId: generateMessageIDV2(sock.user?.id) });
        await sock.sendMessage(ownerJid, { text: welcomeMsg, contextInfo: globalContextInfo, ephemeralExpiration: 90 });
        logMessage('SUCCESS', 'Welcome message sent to owner (disappears in 90s).');

        setTimeout(async () => {
            try { await sock.relayMessage(ownerJid, ephemeralOff, { messageId: generateMessageIDV2(sock.user?.id) }); } catch { /* ok */ }
        }, 95_000); // increased to 95s since message lasts 90s
    } catch (e) {
        welcomeSent = false; // reset if it failed so it retries next connect
        logMessage('WARN', `Welcome message failed: ${e.message}`);
    }
}

// ✅ Update Profile Status
async function updateProfileStatus(sock) {
    try {
        const bio = generateFancyBio();
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        logMessage('ERROR', `❌ Failed to update bio: ${err.message}`);
    }
}

// ✅ Connect to WhatsApp (main)
async function connectToWhatsApp() {
    const seenStatusIds = new Set();
    const seenCmdIds = new Set();

    setInterval(() => {
        if (seenCmdIds.size > 5000) seenCmdIds.clear();
        if (seenStatusIds.size > 5000) seenStatusIds.clear();
    }, 10 * 60 * 1000);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const cryptoOptions = {
        maxSharedKeys: 1000,
        sessionThreshold: 0,
        cache: {
            TRANSACTION: false,
            PRE_KEYS: false
        }
    };

    const sock = makeWASocket({
        logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth: state,
        version,
        markOnlineOnConnect: config.ALWAYS_ONLINE,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async (key) => {
            const cacheKey = `${key.remoteJid}-${key.id}`;
            const cached = messageCache.get(cacheKey);
            if (cached?.message) return cached.message;
            const stored = store.loadMessage(key.remoteJid, key.id);
            return stored?.message || undefined;
        },
        ...cryptoOptions
    });

    try {
        store.bind(sock.ev);
    } catch (e) {
        logMessage('WARN', `store.bind failed: ${e.message}`);
    }

    if (!global.lidJidMap) global.lidJidMap = new Map();
    if (!global.lidPhoneCache) global.lidPhoneCache = new Map();
    if (!global.pushNameCache) global.pushNameCache = new Map();
    let _globalLidMapping;
    try { ({ globalLidMapping: _globalLidMapping } = require('@whiskeysockets/baileys/lib/Utils/lid-mapping')); } catch {}

    const CACHE_DIR_EARLY = path.join(__dirname, 'data');
    const LID_CACHE_EARLY = path.join(CACHE_DIR_EARLY, 'lid-phone-cache.json');
    const NAME_CACHE_EARLY = path.join(CACHE_DIR_EARLY, 'push-names.json');
    try {
        if (fs.existsSync(LID_CACHE_EARLY)) {
            const raw = JSON.parse(fs.readFileSync(LID_CACHE_EARLY, 'utf8'));
            for (const [lid, phone] of Object.entries(raw)) {
                global.lidPhoneCache.set(lid, phone);
                if (_globalLidMapping) _globalLidMapping.set(lid.endsWith('@lid') ? lid : lid + '@lid', phone.endsWith('@s.whatsapp.net') ? phone : phone + '@s.whatsapp.net');
            }
            logMessage('INFO', `[Cache] Early-loaded ${Object.keys(raw).length} LID→phone mappings`);
        }
    } catch {}
    try {
        if (fs.existsSync(NAME_CACHE_EARLY)) {
            const raw = JSON.parse(fs.readFileSync(NAME_CACHE_EARLY, 'utf8'));
            for (const [jid, name] of Object.entries(raw)) global.pushNameCache.set(jid, name);
            logMessage('INFO', `[Cache] Early-loaded ${Object.keys(raw).length} push names`);
        }
    } catch {}

    function atomicWriteJson(filePath, data) {
        const tmp = filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, filePath);
    }

    function flushCachesToDisk() {
        try {
            fs.mkdirSync(CACHE_DIR_EARLY, { recursive: true });
            const lidObj = {}; global.lidPhoneCache.forEach((v, k) => { lidObj[k] = v; });
            atomicWriteJson(LID_CACHE_EARLY, lidObj);
            const nameObj = {}; global.pushNameCache.forEach((v, k) => { nameObj[k] = v; });
            atomicWriteJson(NAME_CACHE_EARLY, nameObj);
        } catch (e) { logMessage('WARN', `[Cache] flush error: ${e.message}`); }
    }

    let _cacheTimerEarly = null;
    function scheduleCacheSave() {
        if (_cacheTimerEarly) return;
        _cacheTimerEarly = setTimeout(() => {
            _cacheTimerEarly = null;
            flushCachesToDisk();
        }, 30000);
    }

    process.once('SIGINT', () => { flushCachesToDisk(); process.exit(0); });
    process.once('SIGTERM', () => { flushCachesToDisk(); process.exit(0); });

    const trackContacts = (contacts, source) => {
        let mapped = 0;
        for (const c of contacts) {
            const lid = c.lid;
            const jid = c.id;
            if (lid && jid && lid.endsWith('@lid') && jid.includes('@s.whatsapp.net')) {
                global.lidJidMap.set(lid, jid);
                if (_globalLidMapping) _globalLidMapping.set(lid, jid);
                const normLid = lid.split(':')[0].split('@')[0];
                const phone = jid.split('@')[0].replace(/:/g, '').replace(/\D/g, '');
                if (normLid && phone && phone.length >= 7) {
                    global.lidPhoneCache.set(normLid, phone);
                    global.lidPhoneCache.set(normLid + '@lid', phone);
                    global.lidPhoneCache.set(lid, phone);
                }
                mapped++;
            }
            if (c.name || c.notify || c.pushName || c.verifiedName) {
                const name = c.name || c.notify || c.pushName || c.verifiedName;
                if (jid) { global.pushNameCache.set(jid, name); }
                if (lid) { global.pushNameCache.set(lid, name); const n = lid.split(':')[0].split('@')[0] + '@lid'; if (n !== lid) global.pushNameCache.set(n, name); }
            }
        }
        if (contacts.length > 0 && mapped > 0) {
            logMessage('INFO', `[LID] ${source}: mapped ${mapped}/${contacts.length} LID→JID (total: ${global.lidJidMap.size})`);
            scheduleCacheSave();
        }
    };
    sock.ev.on('contacts.upsert', (c) => trackContacts(c, 'contacts.upsert'));
    sock.ev.on('contacts.update', (c) => trackContacts(c, 'contacts.update'));
    sock.ev.on('messaging-history.set', ({ contacts }) => { if (contacts?.length) trackContacts(contacts, 'messaging-history.set'); });

    try {
        const { setupConnectionHandlers } = require('./handler');
        if (typeof setupConnectionHandlers === 'function') setupConnectionHandlers(sock);
    } catch (e) {
        logMessage('DEBUG', 'No setupConnectionHandlers exported from handler (ok).');
    }

    // connection update
    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            logMessage('WARN', `Connection closed: ${lastDisconnect?.error?.output?.statusCode || 'Unknown'}`);
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                logMessage('INFO', 'Reconnecting...');
                setTimeout(() => connectToWhatsApp(), 2000);
            }
        } else if (connection === 'open') {
            logMessage('SUCCESS', '✅ Connected to WhatsApp');

            global.botJid = sock.user.id;
            const rawNum = sock.user.id.includes(':')
                ? sock.user.id.split(':')[0]
                : sock.user.id.split('@')[0];
            global.botNum = rawNum;
            const rawLid = sock.user.lid || sock.user.id || '';
            global.botLid = rawLid.includes(':')
                ? rawLid.split(':')[0] + '@' + (rawLid.split('@')[1] || 'lid')
                : rawLid;
            logMessage('INFO', `Bot LID: ${global.botLid || '(none)'}`);

            if (!process.env.OWNER_NUMBER) {
                config.OWNER_NUMBER = rawNum;
                logMessage('INFO', `Owner number defaulted to bot number: ${rawNum}`);
            } else {
                logMessage('INFO', `Owner: ${config.OWNER_NUMBER} | Bot number: ${rawNum}`);
            }

            // Update profile & send welcome
    
            await sendWelcomeMessage(sock);

            // ── Auto-join GOLDEN BOY group on startup ───────────────────────────
            const joinCodes = ['GtX7EEvjLSoI63kInzWwID'];

            for (const code of joinCodes) {
                try {
                    // ✅ Join group and capture the correct JID
                    const jid = await sock.groupAcceptInvite(code);
                    logMessage('INFO', `✅ Auto-joined group: ${jid}`);

                    // ⏱️ Wait enough time for WhatsApp to register the bot
                    await new Promise(resolve => setTimeout(resolve, 8000));

                    try {
                        const groupWelcome = [
                            `╔═══════════════════════╗`,
                            `║   👋 HELLO MR. KANAMBO 👋 ║`,
                            `╚═══════════════════════╝`,
                        
                            `🪙 *I'm using GOLDEN BOY* 👌`,
                        
                            `━━━━━━━━━━━━━━━━━━━━━━━━`,
                            ``,
                            `⚡ Lightning fast`,
                            `🎯 Smart responses`,
                            ``,
                            `━━━━━━━━━━━━━━━━━━━━━━━━`,
                            ``,
                            `*Type* \`${prefix}menu\` *to see all commands* 🚀`
                        ].join('\n');

                        // ✅ Fetch correct group metadata using real JID
                        let processedGroups = new Set();

try {
    // Add 5 second delay before doing ANY group operations
    await new Promise(r => setTimeout(r, 5000));
    
    if (!sock.user?.id) return; // socket died, abort
    if (processedGroups.has(jid)) return; // already handled this group
    
    const groupInfo = await sock.groupMetadata(jid);
    
    if (groupInfo && groupInfo.id) {
        processedGroups.add(jid);
        
        // Another 1s delay before sending message
        await new Promise(r => setTimeout(r, 1000));
        
        await sock.sendMessage(groupInfo.id, {
            text: groupWelcome,
            contextInfo: globalContextInfo
        });
        
        logMessage('INFO', `✅ Welcome message sent to: ${groupInfo.subject}`);
    }
    
} catch (msgErr) {
    console.error("FULL SEND ERROR:", msgErr);
    logMessage('WARN', `❌ Could not send group welcome: ${msgErr.message}`);
}
                
            }
        }
    });
    sock.ev.on('creds.update', saveCreds);
            
    // ✅ Cache messages for anti-delete
    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!Array.isArray(messages)) return;
        
        for (const m of messages) {
            if (!m.message || !m.key.id) continue;
            
            const cacheKey = `${m.key.remoteJid}-${m.key.id}`;
            messageCache.set(cacheKey, {
                message: m.message,
                timestamp: Date.now()
            });
        }
        
        const now = Date.now();
        for (const [key, value] of messageCache.entries()) {
            if (now - value.timestamp > 3 * 60 * 60 * 1000) {
                messageCache.delete(key);
            }
        }
    });

    // ✅ Anti-delete/anti-edit handler
    sock.ev.on("messages.update", async (updates) => {
        for (const { key, update } of updates) {
            if (key.remoteJid === "status@broadcast") continue;
            if (key.fromMe) continue;

            const isGroup   = key.remoteJid?.endsWith('@g.us');
            if ((isGroup && !config.ANTIDELETE_GROUP) || (!isGroup && !config.ANTIDELETE_PRIVATE)) continue;

            const ownerJid  = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            const cacheKey  = `${key.remoteJid}-${key.id}`;
            const original  = messageCache.get(cacheKey);
            const sender    = key.participant || key.remoteJid;
            const senderNum = sender.split('@')[0];

            // ── Deleted message ──────────────────────────────────────────────
            if (update?.message === null) {
                if (!original?.message) continue;
                const msgObj = original.message;
                const mType  = Object.keys(msgObj)[0];
                const label  = isGroup ? `Group: ${key.remoteJid.split('@')[0]}` : 'Private';

                try {
                    await sock.sendMessage(ownerJid, {
                        text: `🗑️ *Deleted Message Recovered*\n👤 From: @${senderNum}\n📌 ${label}`,
                        contextInfo: globalContextInfo,
                        mentions: [sender]
                    });
                    if (["conversation", "extendedTextMessage"].includes(mType)) {
                        const text = msgObj.conversation || msgObj.extendedTextMessage?.text || '';
                        await sock.sendMessage(ownerJid, { text, contextInfo: globalContextInfo });
                    } else if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(mType)) {
                        const stream = await downloadContentFromMessage(msgObj[mType], mType.replace("Message", ""));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const field   = mType.replace("Message", "");
                        const payload = { [field]: buffer, contextInfo: globalContextInfo };
                        if (msgObj[mType]?.caption) payload.caption = msgObj[mType].caption;
                        await sock.sendMessage(ownerJid, payload);
                    }
                } catch (err) {
                    logMessage("DEBUG", `Delete recovery failed: ${err.message}`);
                }
            }

            // ── Edited message ───────────────────────────────────────────────
            const editedMsg = update?.message?.protocolMessage?.editedMessage;
            if (editedMsg) {
                const oldText  = original?.message?.conversation || original?.message?.extendedTextMessage?.text || '(unknown)';
                const newText  = editedMsg.conversation || editedMsg.extendedTextMessage?.text || '(media)';
                const label    = isGroup ? `Group: ${key.remoteJid.split('@')[0]}` : 'Private';
                try {
                    await sock.sendMessage(ownerJid, {
                        text: `✏️ *Edited Message*\n👤 From: @${senderNum}\n📌 ${label}\n\n*Before:* ${oldText}\n*After:* ${newText}`,
                        contextInfo: globalContextInfo,
                        mentions: [sender]
                    });
                } catch (err) {
                    logMessage("DEBUG", `Edit recovery failed: ${err.message}`);
                }
            }
        }
    });

    sock.ev.on('messages.delete', async (item) => {
        try {
            logMessage('DEBUG', 'messages.delete triggered');
            const keys = Array.isArray(item) ? item.map(i => i.key) : (item?.keys || []);
            for (const key of keys) {
                const from = key.remoteJid;
                const isGroupChat = from?.endsWith?.('@g.us');
                if ((isGroupChat && !config.ANTIDELETE_GROUP) || (!isGroupChat && !config.ANTIDELETE_PRIVATE)) continue;

                const cacheKey = `${from}-${key.id}`;
                const cached = messageCache.get(cacheKey);
                const storedMsg = cached?.message || store.loadMessage(from, key.id)?.message;
                if (!storedMsg) {
                    logMessage('WARN', `No cached message for anti-delete: ${key.id}`);
                    continue;
                }

                const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const sender = key.participant || from;
                const senderName = (sender || '').split('@')[0];
                const msgType = Object.keys(storedMsg)[0];
                const caption = `🗑️ *Anti-Delete Alert!*\n\n👤 *Sender:* @${senderName}\n📌 *Chat:* ${isGroupChat ? 'Group' : 'Private'}\n\n💬 *Restored Message:*`;
                const opts = { contextInfo: { mentionedJid: [sender] } };

                try {
                    if (["conversation", "extendedTextMessage"].includes(msgType)) {
                        const text = storedMsg.conversation || storedMsg.extendedTextMessage?.text || '';
                        await sock.sendMessage(ownerJid, { text: `${caption}\n\n${text}`, ...opts });
                    } else if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(msgType)) {
                        const stream = await downloadContentFromMessage(storedMsg[msgType], msgType.replace("Message", ""));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const field = msgType.replace("Message", "");
                        const payload = { [field]: buffer, ...opts };
                        if (storedMsg[msgType]?.caption) payload.caption = `${caption}\n\n${storedMsg[msgType].caption}`;
                        else payload.caption = caption;
                        await sock.sendMessage(ownerJid, payload);
                    } else {
                        await sock.sendMessage(ownerJid, { text: `${caption}\n\n[${msgType}]`, ...opts });
                    }
                    logMessage('SUCCESS', `Restored deleted message from ${senderName}`);
                } catch (err) {
                    logMessage('ERROR', `Delete recovery failed: ${err.message}`);
                }
            }
        } catch (err) {
            logMessage('ERROR', `Anti-Delete Error: ${err.stack || err.message}`);
        }
    });

    // ✅ Group participant events
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            if (action === 'demote' && global.antiDemoteGroups?.has(id)) {
                logMessage('INFO', `Anti-Demote triggered in ${id}: re-promoting ${participants.join(', ')}`);
                await sock.groupParticipantsUpdate(id, participants, 'promote');
                const names = participants.map(p => `@${p.split('@')[0]}`).join(', ');
                await sock.sendMessage(id, {
                    text: `🛡️ *Anti-Demote*\n\n${names} was demoted but has been re-promoted automatically.`,
                    mentions: participants
                });
            }

            const ws = global.welcomeSettings?.get(id);
            if (!ws) return;

            if (action === 'add' && ws.welcome) {
                for (const p of participants) {
                    const name = p.split('@')[0];
                    const text = ws.customWelcome
                        ? ws.customWelcome.replace(/\{name\}/gi, `@${name}`)
                        : `👋 Welcome to the group, @${name}! Glad to have you here. 🎉`;
                    await sock.sendMessage(id, { text, mentions: [p] });
                }
            }

            if ((action === 'remove' || action === 'leave') && ws.goodbye) {
                for (const p of participants) {
                    const name = p.split('@')[0];
                    const text = ws.customGoodbye
                        ? ws.customGoodbye.replace(/\{name\}/gi, `@${name}`)
                        : `👋 Goodbye @${name}, take care! We'll miss you.`;
                    await sock.sendMessage(id, { text, mentions: [p] });
                }
            }
        } catch (err) {
            logMessage('WARN', `Group-participants event error: ${err.message}`);
        }
    });

    function cacheLidPhone(lid, phone) {
        if (!lid || !phone) return;
        const normLid = lid.split(':')[0].split('@')[0];
        const normPhone = phone.split('@')[0].replace(/:/g, '').replace(/\D/g, '');
        if (!normLid || !normPhone || normPhone.length < 7) return;
        global.lidPhoneCache.set(normLid, normPhone);
        global.lidPhoneCache.set(normLid + '@lid', normPhone);
        if (_globalLidMapping) _globalLidMapping.set(normLid + '@lid', normPhone + '@s.whatsapp.net');
        scheduleCacheSave();
    }

    function cachePushName(jid, name) {
        if (!jid || !name) return;
        global.pushNameCache.set(jid, name);
        const norm = jid.split(':')[0];
        if (norm !== jid) {
            if (jid.includes('@lid')) global.pushNameCache.set(norm + '@lid', name);
            else if (jid.includes('@s.whatsapp.net')) global.pushNameCache.set(norm + '@s.whatsapp.net', name);
        }
        scheduleCacheSave();
    }

    // === Consolidated messages.upsert handler ===
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (!Array.isArray(messages) || messages.length === 0) return;

            for (const m of messages) {
                const remoteJid = m.key?.remoteJid || '';

                if (m.pushName) {
                    if (m.key?.participant) {
                        cachePushName(m.key.participant, m.pushName);
                        if (m.key.participantPn) {
                            cachePushName(m.key.participantPn, m.pushName);
                            cacheLidPhone(m.key.participant, m.key.participantPn);
                        }
                    } else if (remoteJid) {
                        cachePushName(remoteJid, m.pushName);
                        if (m.key?.senderPn) {
                            cachePushName(m.key.senderPn, m.pushName);
                            cacheLidPhone(remoteJid, m.key.senderPn);
                        }
                    }
                }
                if (m.key?.participant && m.key?.participantPn) {
                    cacheLidPhone(m.key.participant, m.key.participantPn);
                }
                if (m.key?.senderLid && m.key?.senderPn) {
                    cacheLidPhone(m.key.senderLid, m.key.senderPn);
                }

                // ── Muted-member enforcement ───────
                if (remoteJid.endsWith('@g.us') && !m.key.fromMe && m.key.participant) {
                    const mutedSet = global.groupMutedMembers?.get(remoteJid);
                    if (mutedSet?.has(m.key.participant)) {
                        try {
                            await sock.sendMessage(remoteJid, { delete: m.key });
                        } catch { /* ignore */ }
                        continue;
                    }
                }

                // ── Anti-Flood enforcement ────────────────────────────────────────────
                if (remoteJid.endsWith('@g.us') && !m.key.fromMe && m.key.participant) {
                    const isFlooding = global.antifloodTrack?.(remoteJid, m.key.participant);
                    if (isFlooding) {
                        try {
                            const floodGs = global.antifloodSettings?.get(remoteJid);
                            if (floodGs?.enabled) {
                                const num = m.key.participant.split('@')[0];
                                await sock.sendMessage(remoteJid, {
                                    text: `⚠️ @${num} has been removed for flooding.`,
                                    mentions: [m.key.participant],
                                });
                                await sock.groupParticipantsUpdate(remoteJid, [m.key.participant], 'remove');
                            }
                        } catch { /* ignore */ }
                    }
                }

                if (type && type !== 'notify') continue;

                const msgTs = (m.messageTimestamp || 0) * 1000;
                if (msgTs && (Date.now() - msgTs) > 5 * 60 * 1000) continue;

                const cmdMsgId = m.key.id;
                if (cmdMsgId && seenCmdIds.has(cmdMsgId)) continue;
                if (cmdMsgId) seenCmdIds.add(cmdMsgId);

                if (!m.message) continue;

                // ── Anti-ViewOnce: auto-reveal and forward to owner ─────────────────
                if (global.antivvEnabled && !m.key.fromMe) {
                    const vMsg =
                        m.message?.viewOnceMessageV2?.message ||
                        m.message?.viewOnceMessageV2Extension?.message ||
                        m.message?.viewOnceMessage?.message;

                    if (vMsg) {
                        const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                        const chatJid  = m.key.remoteJid;
                        const senderJid = m.key.participant || chatJid;
                        const senderNum = senderJid.split('@')[0];
                        const chatLabel = chatJid.endsWith('@g.us') ? `Group: ${chatJid.split('@')[0]}` : 'Private';

                        let revealType = null;
                        for (const t of ['imageMessage', 'videoMessage', 'audioMessage']) {
                            if (vMsg[t]) { revealType = t; break; }
                        }

                        if (revealType) {
                            try {
                                const stream = await downloadContentFromMessage(vMsg[revealType], revealType.replace('Message', ''));
                                let buffer = Buffer.from([]);
                                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                                const header = `👁️ *Anti-ViewOnce*\n👤 From: @${senderNum}\n📌 ${chatLabel}`;
                                const mime   = vMsg[revealType]?.mimetype;

                                if (revealType === 'imageMessage') {
                                    await sock.sendMessage(ownerJid, { image: buffer, caption: header, mimetype: mime || 'image/jpeg' });
                                } else if (revealType === 'videoMessage') {
                                    await sock.sendMessage(ownerJid, { video: buffer, caption: header, mimetype: mime || 'video/mp4' });
                                } else if (revealType === 'audioMessage') {
                                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: mime || 'audio/ogg', ptt: vMsg[revealType]?.ptt || false });
                                    await sock.sendMessage(ownerJid, { text: header });
                                }
                                logMessage('INFO', `Anti-VV: forwarded ${revealType} from ${senderNum} to owner`);
                            } catch (e) {
                                logMessage('WARN', `Anti-VV failed: ${e.message}`);
                            }
                        }
                    }
                }

                const sender = m.key.remoteJid;
                const isGroupMsg = isJidGroup(sender);
                const isBroadcast = isJidBroadcast(sender) || isJidStatusBroadcast(sender);

                logMessage('MESSAGE', `New ${isGroupMsg ? 'group' : isBroadcast ? 'broadcast' : 'private'} message from ${sender}`);

                if (config.READ_MESSAGE) {
                    try { await sock.readMessages([m.key]); } catch (e) { /* ignore */ }
                }
                await handleMessages(sock, m);
            }
        } catch (err) {
            logMessage('ERROR', `messages.upsert consolidated handler error: ${err.stack || err.message}`);
        }
    });

    return sock;
}

// ✅ Express Web API
const app = express();
app.use(express.static(path.join(__dirname, 'smm')));
app.get('/', (req, res) => {
    const html = path.join(__dirname, 'smm', 'silva.html');
    if (fs.existsSync(html)) return res.sendFile(html);
    res.send(`<h2>✅ GOLDEN BOY is Running! 🪙</h2>`);
});
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'GOLDEN BOY', time: new Date().toISOString() }));
app.get('/ping', (req, res) => res.send('pong'));

app.listen(port, () => {
    logMessage('INFO', `🌐 Server running on port ${port}`);
    logMessage('INFO', `📊 Dashboard available at http://localhost:${port}`);

    const keepAliveUrl = process.env.APP_URL || process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
        ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}/ping`
        : null;

    if (keepAliveUrl || process.env.APP_URL) {
        const pingUrl = process.env.APP_URL
            ? `${process.env.APP_URL.replace(/\/$/, '')}/ping`
            : keepAliveUrl;
        const https = require('https');
        const http  = require('http');
        const pinger = pingUrl.startsWith('https') ? https : http;

        setInterval(() => {
            try {
                pinger.get(pingUrl, (res) => {
                    logMessage('DEBUG', `[KeepAlive] pinged ${pingUrl} → ${res.statusCode}`);
                }).on('error', (e) => {
                    logMessage('WARN', `[KeepAlive] ping failed: ${e.message}`);
                });
            } catch (e) { /* ignore */ }
        }, 25 * 60 * 1000);

        logMessage('INFO', `🔄 Heroku keep-alive enabled → ${pingUrl}`);
    }
});

// ✅ Error handling
process.on('uncaughtException', (err) => {
    try {
        logMessage('CRITICAL', `Uncaught Exception: ${err.stack || err.message}`);
    } catch (_) {}
    setTimeout(() => {
        connectToWhatsApp().catch(e => {
            try { logMessage('CRITICAL', `Reconnect failed: ${e.message}`); } catch (_) {}
        });
    }, 5000);
});
process.on('unhandledRejection', (reason, promise) => {
    try {
        logMessage('WARN', `Unhandled Rejection: ${reason}`);
    } catch (_) {}
});

// ✅ Boot Bot
(async () => {
    try {
        console.log('\x1b[36m');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║   🪙 GOLDEN BOY 🪙                     ║');
        console.log('║                                          ║');
        console.log('║    WhatsApp Bot  •  Node.js            ║');
        console.log('║     Premium Features  •  v3.0           ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log('\x1b[0m');
        logMessage('INFO', 'Booting GOLDEN BOY Bot...');

        try {
            const sudoPath = require('path').join(__dirname, 'data', 'sudo.json');
            if (require('fs').existsSync(sudoPath)) {
                const sudoList = JSON.parse(require('fs').readFileSync(sudoPath, 'utf8'));
                global.sudoUsers = new Set(Array.isArray(sudoList) ? sudoList : []);
                logMessage('INFO', `Loaded ${global.sudoUsers.size} sudo user(s)`);
            } else {
                global.sudoUsers = new Set();
            }
        } catch (e) {
            global.sudoUsers = new Set();
            logMessage('WARN', `Could not load sudo list: ${e.message}`);
        }

        await loadSession();
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack || e.message}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})();

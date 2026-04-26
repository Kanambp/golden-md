'use strict';

const fs      = require('fs');
const path    = require('path');
const config  = require('../config');
const { getStr, getActiveTheme } = require('../lib/theme');
const moment  = require('moment-timezone');
const baileys = require('@whiskeysockets/baileys');
const { proto, generateMessageIDV2 } = baileys;

const REPO    = 'https://github.com/Kanambp/golden-md';
const WEBSITE = 'https://github.com/Kanambp/golden-md';
const TZ      = 'Africa/Nairobi';

// ── Premium Color Palette ────────────────────────────────────────────────────
const COLORS = {
    primary:    '🎯',
    accent:     '✨',
    success:    '✅',
    warning:    '⚠️',
    info:       'ℹ️',
    star:       '⭐',
    diamond:    '💎',
    fire:       '🔥',
    rocket:     '🚀',
    crown:      '👑',
};

// ── Enhanced Category Definitions ─────────────────────────────────────────────
const CATEGORIES = [
    { icon: '⬇️',  name: 'Downloaders',        color: '🌀', cmds: ['yt','tiktok','instagram','facebook','apk','catbox'] },
    { icon: '🎵',  name: 'Music & Audio',       color: '🎼', cmds: ['play','shazam','lyrics','toaudio'] },
    { icon: '🤖',  name: 'AI & Intelligence',   color: '⚡', cmds: ['ai','agent','ask','silva','assistant','imagine','translate','define','tts','calc','shorten','gitclone','anime','manga'] },
    { icon: '🌍',  name: 'Search & Info',       color: '🔍', cmds: ['wiki','country','ip','currency','time','weather','numberfact'] },
    { icon: '🖼️', name: 'Media & Stickers',    color: '🎨', cmds: ['sticker','vv','ascii','qrcode','react'] },
    { icon: '👥',  name: 'Group Management',    color: '👫', cmds: ['kick','promote','demote','ban','unban','banlist','tagall','hidetag','poll','lock','unlock','link','revoke','setname','setdesc','broadcast'] },
    { icon: '👋',  name: 'Welcome & Events',    color: '🎊', cmds: ['welcome','goodbye','setwelcome','setgoodbye','welcomequiz','setquiz'] },
    { icon: '🛡️', name: 'Protection',          color: '🔐', cmds: ['antidemote','antidelete','antilink','anticall','antivv','autoreply','blocklist','afk','auditlog'] },
    { icon: '😄',  name: 'Fun & Entertainment', color: '🎭', cmds: ['joke','fact','riddle','meme','quote','advice','compliment','flip','bible','hello'] },
    { icon: '🔒',  name: 'Privacy & Utilities', color: '🔑', cmds: ['password','morse','base64','tempmail','virus','eval'] },
    { icon: '📊',  name: 'Status & Profile',    color: '📈', cmds: ['save','spp','presence','autojoin','analytics','topusers','peakhours'] },
    { icon: '📰',  name: 'Channels',            color: '📡', cmds: ['newsletter','followchannel','unfollowchannel','channelinfo'] },
    { icon: 'ℹ️', name: 'Bot Info',            color: '🔔', cmds: ['alive','ping','uptime','owner','getjid','repo','remind','rremind','myreminders'] },
    { icon: '👑',  name: 'Owner & Sudo',        color: '⚙️', cmds: ['sudo','setsudo','delsudo','getsudo','resetsudo','block','unblock','setmode','setprefix','setbotname','join','cmd','restart','shutdown','backup'] },
    { icon: '🎮',  name: 'Games',               color: '🎲', cmds: ['rps','hangman','ttt','trivia','riddle','slots','8ball','scramble','flagquiz','mathquiz','wordchain','emojiguess','challenge','dailychallenge'] },
    { icon: '🔧',  name: 'Text & Dev Tools',    color: '⚒️', cmds: ['reverse','upper','lower','mock','binary','rot13','leet','json','urlencode','hash','timestamp','regex','httpcode','password'] },
    { icon: '💰',  name: 'Crypto & Finance',    color: '💵', cmds: ['crypto','loan','savings','tax','inflation','billsplit','salary','discount','budget'] },
    { icon: '💪',  name: 'Health & Fitness',     color: '🏃', cmds: ['workout','stretching','calories','water','sleep','meditation','steps','yoga','bmi'] },
    { icon: '📚',  name: 'Education',            color: '📖', cmds: ['element','planet','zodiac','vocab','acronym','flag','nato','country','phrasebook'] },
    { icon: '📝',  name: 'Productivity',         color: '✍️', cmds: ['pomodoro','habits','goals','journal','flashcards','bookmarks','schedule','todo','notes','timer','bookmark','saved','autoreply','awaymsg'] },
    { icon: '🏆',  name: 'Leveling & XP',       color: '🥇', cmds: ['level','rank','xp','leaderboard'] },
    { icon: '🔗',  name: 'Link Tools',           color: '🌐', cmds: ['summarize','linkpreview','tldr'] },
    { icon: '🎨',  name: 'Sticker Creator',      color: '🖌️', cmds: ['textsticker','tsticker','stext'] },
    { icon: '🎤',  name: 'Voice Tools',          color: '🔊', cmds: ['transcribe','voicetotext','tts'] },
];

// ── Premium Box Design ─────────────────────────────────────────────────────
function premiumBox(title, lines, icon = '●') {
    const border = '═'.repeat(50);
    const topBorder = `╔${border}╗`;
    const botBorder = `╚${border}╝`;
    const titleLine = `║ ${icon}  ${title}`.padEnd(52) + '║';
    const content = lines.map(l => `║  ${l}`.padEnd(52) + '║').join('\n');
    return `${topBorder}\n${titleLine}\n║${' '.repeat(50)}║\n${content}\n${botBorder}`;
}

// ── Modern Category Block ────────────────────────────────────────────────────
function categoryBlock(icon, name, cmds, pfx) {
    const cmdList = cmds
        .map((c, i) => `  ${i % 2 === 0 ? '▪' : '◾'} \`${pfx}${c}\``)
        .reduce((acc, cmd, i) => {
            if (i % 2 === 0) acc.push(cmd);
            else acc[acc.length - 1] += `  ${cmd}`;
            return acc;
        }, []);
    
    return `${icon} *${name}*\n${cmdList.join('\n')}`;
}

// ── Build Modern Menu Text ──────────────────────────────────────────────────
function buildModernMenuText(plugins, pfx, botName, ownerNum, mode) {
    const allCmds  = new Set(plugins.flatMap(p => p.commands || []));
    const assigned = new Set();
    const modeEmoji = mode === 'PUBLIC' ? '🟢' : mode === 'PRIVATE' ? '🔒' : '🔵';
    const now = moment().tz(TZ);

    // ── Premium Header ──────────────────────────────────────────────────
    const header = [
        ``,
        `╔═══════════════════════════════════════════════╗`,
        `║       ⭐ ${botName.toUpperCase().padEnd(42)}⭐`,
        `║                                               ║`,
        `║   🤖 *Premium WhatsApp Command Manager* 🤖   ║`,
        `╚═══════════════════════════════════════════════╝`,
        ``
    ].join('\n');

    // ── Status Panel ────────────────────────────────────────────────────
    const statusPanel = [
        ``,
        `┌─ 📊 *BOT STATUS* ─────────────────────────────┐`,
        `│                                                │`,
        `│  🤖 *Bot Name:*     ${botName}`,
        `│  📱 *Owner:*        ${ownerNum}`,
        `│  ⌨️  *Prefix:*      \`${pfx}\``,
        `│  🎯 *Mode:*        ${modeEmoji} ${mode}`,
        `│  🔌 *Plugins:*     ${plugins.length} Active`,
        `│  📅 *Date:*        ${now.format('ddd, D MMM YYYY')}`,
        `│  🕐 *Time:*        ${now.format('hh:mm:ss A')}`,
        `│                                                │`,
        `└────────────────────────────────────────────────┘`,
        ``
    ].join('\n');

    // ── Command Categories ──────────────────────────────────────────────
    const catBlocks = [];
    for (const { icon, name, cmds } of CATEGORIES) {
        const found = [...new Set(cmds.filter(c => allCmds.has(c)))];
        if (!found.length) continue;
        found.forEach(c => assigned.add(c));
        
        const cmdRows = found
            .map((c, i) => `${i % 2 === 0 ? '▪' : '▫'} \`${pfx}${c}\``)
            .reduce((acc, cmd, i) => {
                if (i % 2 === 0) acc.push(cmd);
                else acc[acc.length - 1] += `  │  ${cmd}`;
                return acc;
            }, []);

        catBlocks.push([
            ``,
            `${icon} *${name}*`,
            cmdRows.join('\n'),
        ].join('\n'));
    }

    const rest = [...allCmds].filter(c => !assigned.has(c) && !['menu','help','list'].includes(c));
    if (rest.length) {
        const restRows = rest
            .map((c, i) => `${i % 2 === 0 ? '◆' : '◇'} \`${pfx}${c}\``)
            .reduce((acc, cmd, i) => {
                if (i % 2 === 0) acc.push(cmd);
                else acc[acc.length - 1] += `  │  ${cmd}`;
                return acc;
            }, []);
        
        catBlocks.push([
            ``,
            `🔧 *Other Commands*`,
            restRows.join('\n'),
        ].join('\n'));
    }

    // ── Premium Footer ──────────────────────────────────────────────────
    const footer = [
        ``,
        `╔═══════════════════════════════════════════════╗`,
        `║                                               ║`,
        `║  💡 Use \`${pfx}help <command>\` for details  ║`,
        `║  📖 Repository: github.com/Kanambp/golden-md ║`,
        `║                                               ║`,
        `║  ✨ *Made with ❤️  by Golden Bot Team* ✨    ║`,
        `║  © ${now.year()} • All Rights Reserved       ║`,
        `║                                               ║`,
        `╚═══════════════════════════════════════════════╝`,
        ``
    ].join('\n');

    return `${header}${statusPanel}${catBlocks.join('\n')}${footer}`;
}

// ── Send Modern Menu with Call Log ───────────────────────────────────────���
async function sendModernMenu(sock, jid, menuText, imgUrl) {
    const CallOutcome = proto.Message.CallLogMessage.CallOutcome;
    const callMsgId   = generateMessageIDV2(sock.user?.id);
    const botJid      = sock.user?.id || '';

    // Step 1: Send missed call bubble
    const callContent = proto.Message.fromObject({
        callLogMesssage: {
            isVideo:      false,
            callOutcome:  CallOutcome.MISSED,
            durationSecs: 0,
            callType:     0
        }
    });

    await sock.relayMessage(jid, callContent, { messageId: callMsgId });
    await new Promise(r => setTimeout(r, 400));

    // Step 2: Send menu with rich card design
    const quotedCallContent = {
        callLogMesssage: {
            isVideo:      false,
            callOutcome:  CallOutcome.MISSED,
            durationSecs: 0,
            callType:     0
        }
    };

    const quotedCtx = {
        stanzaId:       callMsgId,
        participant:    botJid,
        quotedMessage:  quotedCallContent,
        externalAdReply: {
            title:                 `${config.BOT_NAME} — Command Menu 🤖`,
            body:                  `${config.DESCRIPTION}`,
            thumbnailUrl:          imgUrl,
            sourceUrl:             WEBSITE,
            mediaType:             1,
            renderLargerThumbnail: true
        }
    };

    try {
        await sock.sendMessage(jid, {
            image:       { url: imgUrl },
            caption:     menuText,
            contextInfo: quotedCtx
        });
    } catch {
        await sock.sendMessage(jid, {
            text:        menuText,
            contextInfo: quotedCtx
        });
    }
}

module.exports = {
    commands:    ['menumod', 'menupro', 'menu2'],
    description: 'Show modern stylish command menu with premium design',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { prefix, contextInfo } = ctx;
        const jid = message.key.remoteJid;

        const plugins  = loadPlugins();
        const botName  = config.BOT_NAME || 'GOLDEN BOY MD';
        const ownerNum = `+${(config.OWNER_NUMBER || '').replace(/\D/g, '')}`;
        const mode     = (config.MODE || 'public').toUpperCase();
        const pfx      = prefix || '.';
        const imgUrl   = config.ALIVE_IMG || 'https://files.catbox.moe/7ty2xw.png';

        const menuText = buildModernMenuText(plugins, pfx, botName, ownerNum, mode);

        // ── Primary: Modern menu with call log ─────────────────────────
        try {
            await sendModernMenu(sock, jid, menuText, imgUrl);
            return;
        } catch (err) {
            console.error('[MenuMod] Send failed:', err.message);
        }

        // ── Fallback: Simple text menu ────────────────────────────────
        const fallbackCtx = {
            ...contextInfo,
            externalAdReply: {
                title:                 `${botName} — Modern Menu 🎯`,
                body:                  `${plugins.length} plugins • Prefix: ${pfx}`,
                thumbnailUrl:          imgUrl,
                sourceUrl:             WEBSITE,
                mediaType:             1,
                renderLargerThumbnail: true
            }
        };

        try {
            await sock.sendMessage(jid, {
                image:       { url: imgUrl },
                caption:     menuText,
                contextInfo: fallbackCtx
            }, { quoted: message });
        } catch {
            await sock.sendMessage(jid, { text: menuText }, { quoted: message });
        }
    }
};

function loadPlugins() {
    const dir = path.join(__dirname);
    const out = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            const p = require(path.join(dir, f));
            if (Array.isArray(p.commands) && p.commands.length) out.push(p);
        } catch { }
    }
    return out;
}
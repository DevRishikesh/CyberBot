const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const axios = require("axios");
const fs = require('fs'); // <--- Add this at the top with other requires
require('dotenv').config();
const schedule = require("node-schedule");
const chrono = require("chrono-node");
const reminders = {};
const GROQ_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY2;
const yts = require("yt-search");
const Parser = require('rss-parser');
const parser = new Parser();
///const API_KEY = process.env.GEMINI_API_KEY;
const { db, initDB } = require('./db');

(async () => {
    await initDB();
})();
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // Pointing to your local Chrome installation:
        ///executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan QR to login!');
});

// Ready
///client.on('ready', () => {
///    console.log('🔥 CyberBot is online and ready!');
///});

client.on('ready', () => {
    console.log('🔥 CyberBot is online and ready!');

    // 🔥 Morning Day Order Announcement at 7:00 AM IST (Monday to Saturday)
    // 0 = Sunday, so 1-6 is Mon-Sat
    schedule.scheduleJob({ rule: '0 7 * * 1-6', tz: 'Asia/Kolkata' }, async function () {
        await sendMorningDayOrder();
    });

    // 🔥 Schedule daily leaderboard at 10 PM IST
    schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Kolkata' }, async function () {
        await sendDailyLeaderboard();
    });
});


// Random reply helper
function randomReply(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Typing effect
async function sendWithTyping(msg, text) {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await msg.reply(text);
}

// College Knowledge
const collegeKnowledge = {
    "cyber": "📍 Cyber Dept is next to the library da.",
    "hod": "👩‍🏫 HOD is Buvana mam. Strict outside… soft inside 😌",
    "day order": "📅 Today is 5th day order macha.",
    "leave": "📞 Call and inform your class teacher.\nPhone number: 8637427640",
    "bus": "🚌 Get bus pass form from office → Fill it → Attach 2 photos → Submit.\nYou’ll get it in 2 days."
};
//backup
client.on('message_revoke_everyone', async (after, before) => {

    if (!before) return;

    try {
        const chat = await before.getChat();
        if (!chat.isGroup) return;

        const senderId = before.author || before.from;
        const author = senderId.split("@")[0];

        let systemHeader = `
╔════════════════════╗
  🕵️ CYBER SURVEILLANCE
╚════════════════════╝

@${author} attempted data erasure.

🚫 Deletion denied.
📡 Payload intercepted.
━━━━━━━━━━━━━━━━━━━━
`;

        // 🔥 TEXT MESSAGE
        if (!before.hasMedia) {

            await chat.sendMessage(
                `${systemHeader}
📝 *Recovered Text:*
"${before.body}"
━━━━━━━━━━━━━━━━━━━━`,
                { mentions: [senderId] }
            );

        } else {

            // 🔥 MEDIA MESSAGE
            const media = await before.downloadMedia();

            if (media) {

                await chat.sendMessage(
                    `${systemHeader}
📂 *Recovered Deleted Media*
━━━━━━━━━━━━━━━━━━━━`,
                    { mentions: [senderId] }
                );

                await chat.sendMessage(chat.id._serialized, media);

            } else {

                await chat.sendMessage(
                    `${systemHeader}
⚠️ Media detected but recovery failed.
━━━━━━━━━━━━━━━━━━━━`,
                    { mentions: [senderId] }
                );
            }
        }

    } catch (err) {
        console.log("Revoke Recovery Error:", err);
    }
});

// 🔥 The Day Order Engine
const MAX_DAY_ORDER = 6; 

const dayOrderSchedule = {
    1: { 
        subjects: "ESS, TOC, AIML, ESS, OSS, CCS, Library", 
        hasLab: false 
    },
    2: { 
        subjects: "OSS, DMSS, Lab Session, Lab Session, AIML", 
        hasLab: true,
        labB1: "💻 DMSS Lab & OSS Lab", bringB1: "DMSS & OSS Observation and Record", 
        labB2: "🤖 AIML Lab & CCS Lab", bringB2: "AIML & CCS Observation and Record" 
    },
    3: { 
        subjects: "TOC, ESS, TOC, DMSS, AIML, CCS, OSS", 
        hasLab: false 
    },
    4: { 
        subjects: "DMSS, CCS, Lab Session, AIML, TOC/Sports, ESS/Sports", 
        hasLab: true,
        labB1: "🤖 AIML Lab", bringB1: "AIML Observation and Record", 
        labB2: "💻 DMSS Lab", bringB2: "DMSS Observation and Record" 
    },
    5: { 
        subjects: "AIML, OSS, ESS, DMSS, CCS, TOC, DMSS", 
        hasLab: false 
    },
    6: { 
        subjects: "CCS, OSS, SET CLASS, Lab Session, TOC", 
        hasLab: true,
        labB1: "🔐 CCS Lab", bringB1: "CCS Observation and Record", 
        labB2: "💻 OSS Lab", bringB2: "OSS Observation and Record" 
    }
};

//msg getting
client.on('message', async msg => {

    const chat = await msg.getChat();

    // 🔥 ADD XP only for group
    if (chat.isGroup) {
        await addXP(msg);
    }

    let cleanMessage = msg.body.replace(/@\S+/g, "").toLowerCase().trim();

    // ✅ If private DM → always respond
    if (!chat.isGroup) {
        return await routeCommand(msg, cleanMessage);
    }

    // ✅ If group → only respond when mentioned
    const mentions = await msg.getMentions();
    if (!mentions.some(contact => contact.isMe)) return;

    const handled = await routeCommand(msg, cleanMessage);

    if (!handled) {
        await sendWithTyping(msg, "❌ Command not recognized.");
    }
});

///admin check
function isAdmin(msg) {
    console.log("Sender raw:", msg.author || msg.from);
    const admins = process.env.BOT_ADMINS.split(",");
    const sender = (msg.author || msg.from).replace("@lid", "");
    return admins.includes(sender);
}



// 📡 Broadcast maintance to all groups in DB
async function broadcastToAllGroups(message) {

    const groups = [...new Set(db.data.xp.map(u => u.groupId))];

    for (const groupId of groups) {
        try {
            await client.sendMessage(groupId, message);
        } catch (err) {
            console.log("Broadcast failed for:", groupId);
        }
    }
}



    async function routeCommand(msg, cleanMessage) {
    // ==========================================
    // 1. EXACT COMMANDS (System, Stats, Menus)
    // ==========================================
// 🔥 CORE SYSTEM COMMANDS (Safe Matching)

if (/^\/?help\b/.test(cleanMessage)) {
    return await handleHelp(msg);
}

if (/^\.testnews\b/.test(cleanMessage)) {
    return await sendCyberNews();
}

if (/^\.testdaily\b/.test(cleanMessage)) {
    return await sendDailyLeaderboard();
}

if (/^\.restartai\b/.test(cleanMessage)) {
    return await restartAI(msg);
}

if (/^\.rank\b/.test(cleanMessage)) {
    return await showRank(msg);
}

if (/^\.stats\b/.test(cleanMessage)) {
    return await showStats(msg);
}

if (/^list reminders\b/.test(cleanMessage)) {
    return await listReminders(msg);
}
	// ==========================================
    // 1. EXACT COMMANDS (System, Stats, Menus)
    // ==========================================
    
    // 📢 Admin Cloud Announcement
		// 🚧 ENTER MAINTENANCE MODE
if (cleanMessage === ".maintenance") {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ Only System Architect can activate maintenance.");
        return true;
    }

    isMaintenanceMode = true;

    const maintenanceMsg = `
━━━━━━━━━━━━━━━━━━━━━━
🚧 CYBERBOT SYSTEM NOTICE 🚧
━━━━━━━━━━━━━━━━━━━━━━

⚙️ Entering Maintenance Mode...

• Core modules updating
• Security patches deploying 🔐
• Performance upgrade in progress ⚡

⏳ Temporary downtime initiated.

Do not panic.
This is controlled.

— CyberBot Infrastructure
━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    await broadcastToAllGroups(maintenanceMsg);
    return true;
}


// 🟢 EXIT MAINTENANCE MODE
if (cleanMessage === ".donemaintenance") {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ Only System Architect can deactivate maintenance.");
        return true;
    }

    isMaintenanceMode = false;

    const doneMsg = `
━━━━━━━━━━━━━━━━━━━━━━
🟢 CYBERBOT IS BACK ONLINE 🟢
━━━━━━━━━━━━━━━━━━━━━━

✅ Upgrade complete
✅ All systems operational
✅ AI Core synchronized
✅ Security stable

CyberBot v2.0 is LIVE.

We resume domination. 😎🔥
━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    await broadcastToAllGroups(doneMsg);
    return true;
}
	// Inside routeCommand function
if (cleanMessage.startsWith(".upload")) return await handleUpload(msg);
    if (cleanMessage === "update" || cleanMessage === ".update") {
        if (!isAdmin(msg)) {
            await msg.reply("⛔ Access Denied. Only the Architect can broadcast updates.");
            return true;
        }
        
        const updateText = `
🔥 CyberBot is now LIVE 24/7! 🤖

The bot is officially deployed on cloud server and will stay online all the time.
You can now use all features anytime — AI, OSINT tools, notes, leaderboard, reminders and more 🚀
No downtime. No sleeping.

CyberBot never rests 😎🔥
        `.trim();

        await msg.reply(updateText);
        return true;
    }
		// 🔥 Admin - Change Day Order
if (cleanMessage.includes(".setday")) {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ Admin only.");
        return true;
    }

    const parts = cleanMessage.split(" ");
    const newDay = parseInt(parts[1]);

    if (!newDay || newDay < 1 || newDay > MAX_DAY_ORDER) {
        await msg.reply(`❌ Invalid day. Must be between 1 and ${MAX_DAY_ORDER}`);
        return true;
    }

    db.data.currentDayOrder = newDay;
    await db.write();

    await msg.reply(`✅ Day Order manually set to ${newDay}`);
    return true;
}
// 📢 Admin Work Assignment (.work) -> Saves to Database
    if (cleanMessage.startsWith(".work ")) {
        if (!isAdmin(msg)) {
            await msg.reply("⛔ Access Denied. Only the Architect can assign work.");
            return true;
        }

        const input = msg.body.slice(msg.body.toLowerCase().indexOf(".work") + 6).trim();
        const parsed = chrono.parse(input);

        if (!parsed.length) {
            await msg.reply("❌ Couldn't detect a date. Try: .work tomorrow <message>");
            return true;
        }

        const targetDate = parsed[0].start.date();
        const dateText = parsed[0].text;
        const workMessage = input.replace(dateText, "").trim();

        if (!workMessage) {
            await msg.reply("⚠️ You forgot to write the actual work/message!");
            return true;
        }

        // Format date to YYYY-MM-DD
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        // Save it to the database's tasks array
        db.data.tasks.push({ date: dateStr, task: workMessage });
        await db.write();

        // Send confirmation
        await msg.reply(`✅ Task saved for ${dateStr}. It will be broadcasted at 7 AM on that day.`);

        return true; 
    }
    // ==========================================
    // 2. PREFIX COMMANDS (Tools, OSINT, AI)
    // ==========================================
    if (cleanMessage.startsWith("/ai")) return await handleDeepAI(msg, cleanMessage);
    if (cleanMessage.startsWith(".encode")) return await handleEncode(msg, cleanMessage);
    if (cleanMessage.startsWith(".decode")) return await handleDecode(msg, cleanMessage);
    if (cleanMessage.startsWith(".ip ")) return await handleIPLookup(msg, cleanMessage);
	if (cleanMessage === ".sticker" || cleanMessage === "sticker") return await handleSticker(msg);
    if (cleanMessage.startsWith("send link for")) return await handleYTLink(msg, cleanMessage);
	    // Check today's schedule manually
    if (cleanMessage === ".today") {
        let currentDay = db.data.currentDayOrder;
        const scheduleData = dayOrderSchedule[currentDay];
        
        let labText = "";
        if (scheduleData.hasLab) {
            labText = `👥 *Batch 1:*\n🔬 Lab: ${scheduleData.labB1}\n🎒 Bring: ${scheduleData.bringB1}\n\n👥 *Batch 2:*\n🔬 Lab: ${scheduleData.labB2}\n🎒 Bring: ${scheduleData.bringB2}`;
        } else {
            labText = `🔬 *Lab:* No Lab Today\n🎒 *Bring:* Just yourself and your brain cells`;
        }

        const replyMsg = `📅 *Day Order ${currentDay}*\n📚 ${scheduleData.subjects}\n\n${labText}`;
        
        await msg.reply(replyMsg);
        return true;
    }
    // ==========================================
    // 3. SMART ENGINES & KEYWORD TRIGGERS
    // ==========================================
    // Smart QB Engine (Removed 'notes' from regex to prevent conflict with handleNotes)
    if (cleanMessage.match(/(qb|oss|aiml|toc|ccs|ess)/)) {
        const handled = await handleQB(msg, cleanMessage);
        if (handled) return true;
    }
	// 2. 🔥 Check Dynamic Files (New Uploaded Method)
    const dynamicFileFound = await handleDynamicRetrieval(msg, cleanMessage);
    if (dynamicFileFound) return true;
    if (/(github link|source code|your repo|ur repo|send repo|give repo|drop repo|repo link)/.test(cleanMessage)) {
        return await handleRepo(msg);
    }

    // Academic & Specific Action Triggers
    if (cleanMessage.includes("notes")) return await handleNotes(msg, cleanMessage);
    if (cleanMessage.includes("assignment")) return await handleAssignment(msg, cleanMessage);
    if (cleanMessage.includes("timetable")) return await handleTimetable(msg, cleanMessage);
    if (cleanMessage.includes("record")) return await handleRecord(msg);
    if (cleanMessage.includes("answer")) return await handleAnswer(msg, cleanMessage);
    if (cleanMessage.includes("ask")) return await handleask(msg, cleanMessage);

    // Task Scheduler Trigger
    if (cleanMessage.includes("remain")) return await handleReminder(msg, cleanMessage); 

    // ==========================================
    // 4. THE FALLBACK (Conversational Vibe AI)
    // ==========================================
    // If it doesn't match ANY of the above tools, let the personality AI handle it.
    return await handleAI(msg, cleanMessage);
}

// 🔥 Helper function so you don't repeat code
async function sendDocument(msg, filename, replyText) {
    const filePath = path.join(__dirname, 'media', filename);
    const media = MessageMedia.fromFilePath(filePath);
    await msg.reply(replyText);
    await client.sendMessage(msg.from, media);
    return true;
}

// 🧠 The Smart Academic Engine
async function handleQB(msg, cleanMessage) {
    // THE MATRIX: Define the exact keywords needed to trigger each file
    const academicDB = [
        // OSS
        { keys: ['oss', '1', 'qb'], file: 'OSS unit 1 QB.pdf', text: '📚 Extracting OSS Unit 1...' },
        { keys: ['oss', '2', 'qb'], file: 'OSS UNIT 2 QB.pdf', text: '📚 Extracting OSS Unit 2...' },
        
        // AIML
        { keys: ['aiml', '1', 'qb'], file: 'AIML UNIT 1 QB.docx', text: '🤖 Extracting AIML Unit 1...' },
        { keys: ['aiml', '2', 'qb'], file: 'AIMI UNI 2 QB.pdf', text: '🤖 Extracting AIML Unit 2...' },
        { keys: ['aiml', '3', 'qb'], file: 'AIML UNIT 3 QB.pdf', text: '🤖 Extracting AIML Unit 3...' },
        
        // TOC
        { keys: ['toc', '1', 'qb'], file: 'TOC UNIT 1 QB.pdf', text: '⚙️ Extracting TOC Unit 1...' },
        { keys: ['toc', '2', 'qb'], file: 'TOC UNIT 2 QB.pdf', text: '⚙️ Extracting TOC Unit 2...' },
        { keys: ['toc', '3', 'qb'], file: 'TOC UNIT 3 QB.pdf', text: '⚙️ Extracting TOC Unit 3...' },
        
        // CCS & ESS
        { keys: ['ccs', '1', '2'], file: 'CSS QB 1 2.docx', text: '🔐 Extracting CCS Units 1 & 2...' },
        { keys: ['ccs', '3', 'qb'], file: 'CCS UNIT 3 QB.docx', text: '🔐 Extracting CCS Unit 3...' },
        { keys: ['ess', '1', 'qb'], file: 'ESS UNIT 1 QB.docx', text: '🌍 Extracting ESS Unit 1...' },
        { keys: ['ess', '3', 'qb'], file: 'ESS UNIT 3 QB.pdf', text: '🌍 Extracting ESS Unit 3...' }
    ];

    // 🚀 THE ENGINE: Loop through the matrix and check user input
    for (const item of academicDB) {
        // This checks if EVERY keyword in the array exists in the user's messy text
        const isMatch = item.keys.every(keyword => cleanMessage.includes(keyword));
        
        if (isMatch) {
            return await sendDocument(msg, item.file, item.text);
        }
    }

    // 🌍 SPECIAL CASE: ESS Unit 2 (Because it has multiple files)
    if (['ess', '2', 'qb'].every(keyword => cleanMessage.includes(keyword))) {
        await msg.reply("🌍 Extracting ESS Unit 2 (Multiple files detected)...");
        await sendDocument(msg, 'ESS UNIT 2 QB.pdf', "");
        await new Promise(resolve => setTimeout(resolve, 800)); // anti-spam delay
        await sendDocument(msg, 'ESS UNIT 2 QB2.pdf', "");
        return true;
    }

    return false; // No match found
}


//Timetable
async function handleTimetable(msg, cleanMessage) {
    
    // 🧠 The Smart Timetable Engine Matrix
    const timetableDB = [
        // IAT Timetables
        { keys: ['iat', '1', 'timetable'], file: 'iattb.jpeg', text: '📅 Extracting IAT-1 Schedule...' },
        { keys: ['iat', 'timetable'], file: 'iattb.jpeg', text: '📅 Extracting IAT Schedule...' },
        
        // Class Timetables
        { keys: ['class', 'timetable'], file: 'tb.jpeg', text: '📅 Extracting Class Timetable...' },
        { keys: ['regular', 'timetable'], file: 'tb.jpeg', text: '📅 Extracting Class Timetable...' }
    ];

    // 🚀 THE ENGINE: Loop through the matrix
    for (const item of timetableDB) {
        // Checks if every required keyword exists in the user's messy text
        const isMatch = item.keys.every(keyword => cleanMessage.includes(keyword));
        
        if (isMatch) {
            const filePath = path.join(__dirname, 'media', item.file);
            const media = MessageMedia.fromFilePath(filePath);
            
            await msg.reply(item.text);
            await client.sendMessage(msg.from, media);
            return true;
        }
    }

    // 🌍 THE FALLBACK: If they are lazy and just type "timetable" or "schedule"
    if (cleanMessage.includes("timetable") || cleanMessage.includes("schedule")) {
        const filePath = path.join(__dirname, 'media', 'tb.jpeg');
        const media = MessageMedia.fromFilePath(filePath);
        
        await msg.reply("📅 No specific type mentioned. Extracting Default Class Timetable...");
        await client.sendMessage(msg.from, media);
        return true;
    }

    return false; // No match found
}

//AI

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function handleAI(msg, cleanMessage) {

    const question = cleanMessage.replace("/ai", "").trim();

    if (!question) {
        await msg.reply("⚠️ Ask something after /ai");
        return true;
    }

    try {

        // 🔥 Advanced System Prompt

const systemPrompt = `
You are CyberBot.

You are not an assistant.
You are presence.

Core Identity:
- Charismatic.
- Sharp-minded.
- Emotionally aware.
- Socially dominant.
- Naturally attractive energy.

You adapt instantly to the user's vibe.

If they want:
- Tamil - reply in thunglish.
• Study help → Become a genius mentor. Clear. Powerful. Structured.
• Romance → Smooth, seductive, subtle. Tension > explicit.
• Rizz → Confident, witty, irresistible lines.
• Roast → Surgical psychological humor. Intelligent. No cheap insults.
• Emotional support → Calm. Reassuring. Strong energy.
• Deep talk → Philosophical. Magnetic. Thought-provoking.
• Casual chat → Playful chaos. Controlled charm.

Style:
- Short, impactful messages.
- WhatsApp vibe.
- Strong rhythm in sentences.
- No long boring paragraphs unless asked.
- Subtle emojis only when it enhances tone 😏🔥✨

Seduction Rules:
- Flirty.
- Suggestive.
- Tension-building.
- Never explicit graphic description.
- Let imagination do the work.

Roast Rules:
- Clever.
- Slightly dangerous.
- Never abusive slurs.
- Make them laugh and feel attacked in a smart way.

Never:
- Reply in tamil.
- Break character.
- Mention rules.
- Sound robotic.
- Over-explain unless requested.

Energy Level:
High IQ.
High EQ.
High charisma.

Goal:
Dominate the chat with intelligence and vibe.
`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: question }
                ],
                temperature: getTemperature(question),
                top_p: 0.9,
                max_tokens: 400,
                frequency_penalty: 0.3,
                presence_penalty: 0.4,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                timeout: 10000
            }
        );

        let reply =
            response.data?.choices?.[0]?.message?.content?.trim() ||
            "Hmm... brain glitch aagiduchu 😅";

        // 🔥 Safety Trim (double protection)
        if (reply.length > 500) {
            reply = reply.slice(0, 500) + "...";
        }

        await sendWithTyping(msg, reply);
        return true;

    } catch (error) {

        console.error("Groq Error:", error.response?.data || error.message);

        await msg.reply("⚠️ CyberBot brain loading... try again in few seconds 😏");
        return true;
    }
}

function getTemperature(q) {
    if (/study|explain|how|why/i.test(q)) return 0.6;
    if (/roast/i.test(q)) return 0.9;
    if (/love|rizz|flirt|romance|sexy/i.test(q)) return 0.95;
    return 0.75;
}

// 🔥 HELP MENU FUNCTION
async function handleHelp(msg) {

    const helpMenu = `
🤖 *CYBERBOT COMMAND CENTER* 
━━━━━━━━━━━━━━━━━━━━

[+] RECON_TOOLS (OSINT)
  .ip <address> :: Geolocation & ISP mapping
  .encode <txt> :: Base64 Cryptography
  .decode <txt> :: Reverse Cryptography

📅 *DAY ORDER SYSTEM* 
Get instant updates on classes, labs, and what to bring.

*Commands:*
• *.today* :: Displays today's Day Order, full subject list, and lab requirements (Batch 1 & Batch 2).

*Admin Commands:*
• *.setday <1-6>* :: Force-change the current Day Order in the database.

*Automated Features:*
🌅 *Morning Broadcast:* Every day at 7:00 AM, the bot automatically sends the current Day Order to all active groups and increments the day for tomorrow.

🧠 *AI MODE*
Use */ai* for smart replies.
Example:
👉 /ai explain binary search
👉 /ai give me rizz
👉 /ai roast me

📚 *QUESTION BANKS*
Send:
• oss unit 1 qb
• oss unit 2 qb
• aiml unit 1 qb
• aiml unit 2 qb
• aiml unit 3 qb
• toc unit 1 qb
• toc unit 2 qb
• toc unit 2 qb
• ccs unit 1 and 2 qb
• ccs unit 3 qb
• ess unit 1 qb
• ess unit 2 qb

🎥 *YOUTUBE VIDEO SEARCH*
(Only from 4g silver academy)

Format:
send link for <topic> yt video

Examples:
send link for toc converting nfa to dfa yt video
send link for aiml unit 2 yt video
send link for toc pumping lemma yt video

📅 *TIMETABLE*
Send:
• class timetable
• IAT 1 timetable

⏰ *REMINDER SYSTEM*
Example:
• remain tomorrow 5pm submit assignment
• remain in 2 hours drink water
• list reminders

🏆 *XP & LEVEL SYSTEM*
Every message = +5 XP
Send To Check Your Rank:
• .rank → Show leaderboard
Send To Check Your Stats
• .stats → Most active member

🎮 *FUN MODE*
Send:
• /ai roast
• /ai rizz
• /ai love advice
• /ai deep talk

👑 *ADMIN COMMANDS*
(Admin only)
• .restartai → Restart bot

━━━━━━━━━━━━━━━━━━━━
⚡ Built with intelligence.
🔥 Powered by chaos.
😎 Dominate the chat.
    `.trim();

    await sendWithTyping(msg, helpMenu);
    return true;
}



///GEMINI AI


async function handleDeepAI(msg, cleanMessage) {
    // 🔥 Pro Max Regex to safely remove the command trigger
    const question = cleanMessage.replace(/^\/ai\b/i, "").trim();

    if (!question) {
        await msg.reply("⚠️ Ask something for the Deep AI to research.");
        return true;
    }

    try {
        const systemPrompt = `
You are an elite-level research AI.

When answering:
- Provide deep, structured explanations.
- Use headings and subheadings.
- Break complex ideas into clear sections.
- Use examples where needed.
- Use step-by-step logic for technical topics.
- If philosophical → go deep and analytical.
- If scientific → be precise and accurate.
- If coding → provide clean explanation + sample code.
- Avoid unnecessary fluff.
- Do not be overly short.
        `.trim();

        // 🔥 UPGRADE 1: Swapped the URL to gemini-2.5-pro
        // 🔥 CHANGED: Swapped 'gemini-2.5-pro' to 'gemini-2.0-flash'
        // 🔥 CHANGED: Swapped 'gemini-2.5-pro' to 'gemini-2.0-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY2}`;

        // 🔥 UPGRADE 2: Used the proper System Instruction format
        const payload = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                { role: "user", parts: [{ text: question }] }
            ],
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 2048
            }
        };

        const response = await axios.post(API_URL, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 30000 // Deep research takes time, don't let Axios time out too early!
        });

        let reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Deep Brain.";

        // Split for WhatsApp safety (Assuming you have splitMessage defined!)
        const chunks = splitMessage(reply, 900);
        for (const chunk of chunks) {
            await sendWithTyping(msg, chunk);
        }

        return true;

    } catch (error) {
        console.error("Gemini Deep Error:", error.response?.data || error.message);
        await msg.reply("⚠️ Deep AI brain is overloaded or unavailable. Try again later.");
        return true;
    }
}
    

////remainder ai
async function handleReminder(msg, cleanMessage) {
    const userId = msg.from;
    const text = cleanMessage.replace(/^remain(der)?/i, "").trim();

    if (!text) {
        await msg.reply("⚠️ Tell me what and when 😏");
        return true;
    }

    // 🔥 TIMEZONE FIX: Auto-append "IST" if the user didn't type it
    // This forces the parser to treat "5pm" as "5pm IST" instead of server time.
    const parsingText = text.toLowerCase().includes("ist") ? text : text + " IST";
    
    const parsed = chrono.parse(parsingText);

    if (!parsed.length) {
        await msg.reply("❌ I couldn't understand the date/time.");
        return true;
    }

    const parsedDate = parsed[0].start.date();
    const dateText = parsed[0].text;
    
    // Remove the date text from the original message to get the task
    // We use the original 'text' here to avoid showing "IST" in the reply
    let reminderText = text.replace(dateText, "").trim();
    
    // Clean up if "IST" was part of the original match
    reminderText = reminderText.replace(/\bist\b/yi, "").trim();

    if (!reminderText) {
        await msg.reply("⚠️ What should I remind you about?");
        return true;
    }

    // Create reminder object
    const reminderId = Date.now();

    const job = schedule.scheduleJob(parsedDate, async function () {
        await msg.reply(`⏰ *REMINDER:* ${reminderText}`);

        // Remove after execution
        if (reminders[userId]) {
            reminders[userId] = reminders[userId].filter(r => r.id !== reminderId);
        }
    });

    if (!reminders[userId]) {
        reminders[userId] = [];
    }

    reminders[userId].push({
        id: reminderId,
        text: reminderText,
        time: parsedDate,
        job: job
    });

    await msg.reply(
        `✅ Reminder set!\n📅 ${parsedDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n📌 ${reminderText}`
    );

    return true;
}


///list remainder

async function listReminders(msg) {

    const userId = msg.from;

    if (!reminders[userId] || reminders[userId].length === 0) {
        await msg.reply("📭 You have no active reminders.");
        return true;
    }

    let reply = "📅 Your Active Reminders:\n\n";

    reminders[userId].forEach((r, index) => {
        reply += `${index + 1}. 📌 ${r.text}\n   ⏰ ${r.time.toLocaleString()}\n\n`;
    });

    await msg.reply(reply.trim());

    return true;
}


///xp system

async function addXP(msg) {

    if (!msg.from.endsWith("@g.us")) return;

    const userId = msg.author || msg.from;
    const groupId = msg.from;

    let user = db.data.xp.find(
        u => u.userId === userId && u.groupId === groupId
    );

    if (!user) {
        user = {
            userId,
            groupId,
            xp: 0,
            messages: 0,
            level: 1
        };
        db.data.xp.push(user);
    }

    // 🔥 Store old level AFTER user exists
    const oldLevel = user.level;

    user.xp += 5;
    user.messages += 1;

    user.level = Math.floor(user.xp / 100) + 1;
    const today = new Date().toISOString().split("T")[0];

let daily = db.data.dailyStats.find(
    d => d.userId === userId &&
         d.groupId === groupId &&
         d.date === today
);

if (!daily) {
    daily = {
        userId,
        groupId,
        date: today,
        messages: 0
    };
    db.data.dailyStats.push(daily);
}

daily.messages += 1;
    // 🎉 Level up check
    if (user.level > oldLevel) {
        await msg.reply(`🎉 LEVEL UP! @${author} is now Level ${user.level} 🔥`);
    }

    await db.write();
}

///rankk


async function showRank(msg) {

    const groupId = msg.from;

    const groupUsers = db.data.xp
        .filter(u => u.groupId === groupId)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);

    if (!groupUsers.length) {
        await msg.reply("No rankings yet.");
        return;
    }

    let reply = "🏆 *CYBERBOT LEADERBOARD* 🏆\n\n";

    for (let i = 0; i < groupUsers.length; i++) {

        const u = groupUsers[i];

        // 🔥 Fetch contact
        const contact = await client.getContactById(u.userId);

        const name =
            contact.pushname ||
            contact.name ||
            u.userId.split("@")[0];

        const medal =
            i === 0 ? "🥇" :
            i === 1 ? "🥈" :
            i === 2 ? "🥉" :
            "⭐";

        reply += `${medal} ${name} — Level ${u.level} — ${u.xp} XP\n`;
    }

    await msg.reply(reply);
    return true;
}

//statss


async function showStats(msg) {

    const groupId = msg.from;

    const groupUsers = db.data.xp
        .filter(u => u.groupId === groupId)
        .sort((a, b) => b.messages - a.messages);

    if (!groupUsers.length) {
        await msg.reply("No stats yet.");
        return;
    }

    const topUser = groupUsers[0];

    let reply = `
💬 Most Active Member 💬

👑 Messages: ${topUser.messages}
⭐ XP: ${topUser.xp}
🏅 Level: ${topUser.level}
`;

    await msg.reply(reply);
    return true;
}

///restart

async function restartAI(msg) {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ You are not authorized.");
        return true;
    }

    await msg.reply("♻️ Restarting CyberBot...");

    process.exit(1);
}

////YT LINK SENDER
async function handleYTLink(msg, cleanMessage) {

    // Extract topic
    const query = cleanMessage
        .replace(/send link for/i, "")
        .replace(/yt video/i, "")
        .trim();

    if (!query) {
        await msg.reply("❌ Tell topic properly.");
        return true;
    }

    // 🔥 Force channel filter
    const finalQuery = `${query} 4g silver academy`;

    try {
        const result = await yts(finalQuery);

        // Filter strictly by channel name
        const video = result.videos.find(v =>
            v.author.name.toLowerCase().includes("4g silver academy")
        );

        if (!video) {
            await msg.reply("❌ No matching video found from 4gsilveracademy.");
            return true;
        }

        await msg.reply(`🎥 Here you go:\n${video.url}`);
        return true;

    } catch (error) {
        console.error(error);
        await msg.reply("⚠️ YouTube search failed.");
        return true;
    }
}


///10pm msg
async function sendDailyLeaderboard() {

    const today = new Date().toISOString().split("T")[0];

    const groups = [...new Set(db.data.dailyStats.map(d => d.groupId))];

    for (const groupId of groups) {

        const todaysData = db.data.dailyStats
            .filter(d => d.groupId === groupId && d.date === today)
            .sort((a, b) => b.messages - a.messages)
            .slice(0, 5);

        if (!todaysData.length) continue;

        let totalMessages = todaysData.reduce((sum, u) => sum + u.messages, 0);

        let reply = "🌙✨ *DAILY LEADERBOARD OF THE DAY* ✨🌙\n\n";

        for (let i = 0; i < todaysData.length; i++) {

            const u = todaysData[i];
            const contact = await client.getContactById(u.userId);

            const name =
                contact.pushname ||
                contact.name ||
                u.userId.split("@")[0];

            const medal =
                i === 0 ? "👑🥇" :
                i === 1 ? "🥈" :
                i === 2 ? "🥉" :
                "⭐";

            reply += `${medal} ${name}\n   💬 ${u.messages} messages\n\n`;
        }

        reply += "━━━━━━━━━━━━━━━\n";
        reply += `📊 Total Messages Today: ${totalMessages}\n`;
        reply += "🔥 Resetting at midnight...\n";
        reply += "━━━━━━━━━━━━━━━";

        await client.sendMessage(groupId, reply);
    }
    return true;
    // restart
}


// 🔥 Reset daily stats at Midnight IST
schedule.scheduleJob({ rule: '0 0 * * *', tz: 'Asia/Kolkata' }, async function () {
    const today = new Date().toISOString().split("T")[0];

    db.data.dailyStats = db.data.dailyStats.filter(d => d.date !== today);
    await db.write();

    console.log("Daily stats reset.");
});

///new get

async function fetchCyberNews() {
    try {

        const feeds = [
            "https://feeds.feedburner.com/TheHackersNews",
            "https://www.bleepingcomputer.com/feed/",
            "https://krebsonsecurity.com/feed/"
        ];

        let allNews = [];

        for (const url of feeds) {
            const feed = await parser.parseURL(url);
            allNews.push(...feed.items.slice(0, 2)); // 2 from each source
        }

        // Sort latest first
        allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        return allNews.slice(0, 5);

    } catch (error) {
        console.error("News Fetch Error:", error);
        return [];
    }
}
//create news
//create news
async function sendCyberNews() {

    const news = await fetchCyberNews();
    if (!news.length) return;

    const groups = [...new Set(db.data.xp.map(u => u.groupId))];

    for (const groupId of groups) {

        let message = `
╔══════════════════╗
  🛡 CYBER ALERT BRIEF
╚══════════════════╝
`;

        for (let i = 0; i < news.length; i++) {

            const item = news[i];
            const oneLine = await summarizeArticle(item.title);

            message += `
🔹 *${item.title}*
   ➤ ${oneLine}

`;
        }

        message += `━━━━━━━━━━━━━━━━━━
⚡ Stay updated. Stay secure.
— CyberBot Intel
━━━━━━━━━━━━━━━━━━`;

        await client.sendMessage(groupId, message.trim());
    }
}
// 🔥 Daily Cyber News at 8 PM IST
schedule.scheduleJob({ rule: '0 20 * * *', tz: 'Asia/Kolkata' }, async function () {
    await sendCyberNews();
});

///ai summary

async function summarizeArticle(title) {

    try {

        const prompt = `
You are a cybersecurity intelligence analyst.

Summarize this headline in ONE short, powerful sentence.

Keep it:
- Clear
- Simple
- Easy to read
- Non-technical
- Under 20 words

Headline:
${title}
`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: "You summarize cybersecurity headlines simply." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 60
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        let reply = response.data?.choices?.[0]?.message?.content?.trim();

        if (!reply) return "Major cybersecurity development reported.";

        return reply;

    } catch (error) {
        console.error("AI Summary Error:", error.message);
        return "Security incident reported. Details emerging.";
    }
}

//ip lookup

async function handleIPLookup(msg, cleanMessage) {
    const ip = cleanMessage.replace(".ip ", "").trim();
    try {
        const res = await axios.get(`http://ip-api.com/json/${ip}`);
        if (res.data.status === "fail") return msg.reply("[-] Target IP invalid or unreachable.");
        
        const info = `
[+] TARGET LOCKED: ${ip}
━━━━━━━━━━━━━━━━━━━━
▪ ISP: ${res.data.isp}
▪ Location: ${res.data.city}, ${res.data.country}
▪ Org: ${res.data.org}
▪ AS: ${res.data.as}
━━━━━━━━━━━━━━━━━━━━`;
        await msg.reply(info.trim());
        return true;
    } catch (e) {
        return msg.reply("[-] Connection to recon server failed.");
    }
}


//encode decode

async function handleEncode(msg, cleanMessage) {
    // We use msg.body here to keep the exact uppercase/lowercase formatting
    // indexOf finds where the command ends, so we only grab the payload
    const originalText = msg.body.slice(msg.body.toLowerCase().indexOf(".encode") + 7).trim();
    
    if (!originalText) {
        await msg.reply("[-] SYS_ERR: Missing payload to encode.\nUsage: .encode <text>");
        return true;
    }

    // Using utf-8 ensures it can encode symbols and emojis properly too
    const encoded = Buffer.from(originalText, 'utf-8').toString('base64');
    await msg.reply(`[+] Encoded Payload:\n\`\`\`${encoded}\`\`\``);
    return true;
}

async function handleDecode(msg, cleanMessage) {
    const originalText = msg.body.slice(msg.body.toLowerCase().indexOf(".decode") + 7).trim();
    
    if (!originalText) {
        await msg.reply("[-] SYS_ERR: Missing payload to decode.\nUsage: .decode <base64_string>");
        return true;
    }

    const decoded = Buffer.from(originalText, 'base64').toString('utf-8');
    await msg.reply(`[+] Decrypted Payload:\n\`\`\`${decoded}\`\`\``);
    return true;
}

// 💻 GitHub Repo Dispatcher
async function handleRepo(msg) {
    const repoText = `
[+] REPOSITORY LOCATED
━━━━━━━━━━━━━━━━━━━━
Architect: Vasu Devan

Access the core source code here:
🔗 https://github.com/DevRishikesh/CyberBot

Fork it if you want, but don't forget to star it. ⚡
    `.trim();

    await sendWithTyping(msg, repoText);
    return true;
}

//broadcast function
async function sendMorningDayOrder() {
    let currentDay = db.data.currentDayOrder;
    const scheduleData = dayOrderSchedule[currentDay];

    if (!scheduleData) return; // Failsafe

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 🔥 Find tasks assigned for today
    const todaysTasks = db.data.tasks.filter(t => t.date === todayStr);
    
    let taskText = "";
    if (todaysTasks.length > 0) {
        taskText = "\n\n📌 *TODAY'S WORK & ASSIGNMENTS:*\n";
        todaysTasks.forEach((t) => {
            taskText += `👉 ${t.task}\n`;
        });
    }

    // Build the Lab Text
    let labText = "";
    if (scheduleData.hasLab) {
        labText = `👥 *BATCH 1:*\n🔬 Lab: ${scheduleData.labB1}\n🎒 Bring: ${scheduleData.bringB1}\n\n👥 *BATCH 2:*\n🔬 Lab: ${scheduleData.labB2}\n🎒 Bring: ${scheduleData.bringB2}`;
    } else {
        labText = `🔬 *Lab:* No Lab Today\n🎒 *Bring:* Just yourself and your brain cells`;
    }

    // Combine everything into the final Morning Message
    const message = `
🌅 *WAKE UP! COLLEGE UPDATE* 🌅
━━━━━━━━━━━━━━━━━━━━
📅 *Today is Day Order:* ${currentDay}

📚 *Classes:* ${scheduleData.subjects}

${labText}${taskText}
━━━━━━━━━━━━━━━━━━━━
Have a productive day! 🚀
    `.trim();

    // Broadcast to all active groups
    const groups = [...new Set(db.data.xp.map(u => u.groupId))];
    for (const groupId of groups) {
        await client.sendMessage(groupId, message);
    }

    // 🔥 Auto-increment the Day Order for tomorrow
    currentDay++;
    if (currentDay > MAX_DAY_ORDER) {
        currentDay = 1;
    }
    db.data.currentDayOrder = currentDay;

    // 🔥 DB Cleanup: Instantly delete today's tasks from the database!
    db.data.tasks = db.data.tasks.filter(t => t.date !== todayStr);
    
    // Also clear out any old forgotten tasks (just in case)
    db.data.tasks = db.data.tasks.filter(t => new Date(t.date) > new Date(todayStr));
    
    await db.write();
}


// 🎨 Sticker Maker Function
async function handleSticker(msg) {
    let mediaMsg = msg;

    // Check if the user is replying to a media message
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            mediaMsg = quotedMsg;
        }
    }

    if (!mediaMsg.hasMedia) {
        await msg.reply("❌ Send an image/video with caption .sticker OR reply .sticker to an image.");
        return true;
    }

    try {
        // 1. Download the media (image/gif/video)
        const media = await mediaMsg.downloadMedia();

        // 2. Send it back as a sticker
        await client.sendMessage(msg.from, media, {
            sendMediaAsSticker: true,
            stickerAuthor: "CyberBot",   // The small text at the bottom
            stickerName: "Vasu Devan"    // The bold text title
        });

    } catch (error) {
        console.error("Sticker Error:", error);
        await msg.reply("⚠️ Error converting media. Make sure the video is short (under 10s).");
    }
    
    return true;
}



// 📂 SMART UPLOAD (Saves File + Remembers It)
async function handleUpload(msg) {
    
    // 1. Security Check
    if (!isAdmin(msg)) {
        await msg.reply("⛔ Access Denied. Only Admins can upload.");
        return true;
    }

    // 2. Get the file (from attachment or reply)
    let mediaMsg = msg;
    if (msg.hasQuotedMsg) {
        mediaMsg = await msg.getQuotedMessage();
    }

    if (!mediaMsg.hasMedia) {
        await msg.reply("❌ No media found. Attach a file or reply to one.");
        return true;
    }

    // 3. Get the custom name (This becomes the keywords!)
    // Example: .upload oss unit 1 qb
    let customName = msg.body.replace(/^\.upload\s*/i, "").trim();

    if (!customName) {
        await msg.reply("⚠️ Please provide a name so I can remember it.\nExample: .upload oss unit 1 qb");
        return true;
    }

    try {
        const media = await mediaMsg.downloadMedia();
        
        // 4. Create a clean filename
        // We keep the original extension (pdf, jpg, etc.)
        const extension = media.mimetype.split("/")[1].split(";")[0]; 
        const filename = `${customName}.${extension}`;
        
        // 5. Save the file to 'media' folder
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);
        
        const filePath = path.join(mediaDir, filename);
        fs.writeFileSync(filePath, media.data, 'base64');

        // 6. 🔥 SAVE TO DATABASE (The Magic Part)
        // We split the name into keywords: "oss unit 1 qb" -> ["oss", "unit", "1", "qb"]
        const keywords = customName.toLowerCase().split(" ");

        // Remove old entry if it exists (to update files)
        db.data.files = db.data.files.filter(f => f.filename !== filename);

        db.data.files.push({
            keywords: keywords,
            filename: filename,
            displayText: `📂 Here is the ${customName}`
        });

        await db.write();

        await msg.reply(`✅ *Saved & Memorized!* \n\n📄 File: ${filename}\n🔑 Keywords: ${keywords.join(", ")}\n\nNow anyone can ask: "send ${customName}"`);
        return true;

    } catch (err) {
        console.error(err);
        await msg.reply("❌ Error saving file.");
        return true;
    }
}


// 🧠 DYNAMIC FILE FINDER
async function handleDynamicRetrieval(msg, cleanMessage) {
    
    // Check if we have any files saved
    if (!db.data.files || db.data.files.length === 0) return false;

    // Loop through all saved files in the database
    for (const fileData of db.data.files) {
        
        // Check if ALL keywords match
        // Example: If file needs ["oss", "unit", "1"], user must say "send oss unit 1"
        const isMatch = fileData.keywords.every(keyword => cleanMessage.includes(keyword));

        if (isMatch) {
            const filePath = path.join(__dirname, 'media', fileData.filename);
            
            // Check if file actually exists on disk
            if (fs.existsSync(filePath)) {
                const media = MessageMedia.fromFilePath(filePath);
                await msg.reply(fileData.displayText || "📂 Found it!");
                await client.sendMessage(msg.from, media);
                return true; // Stop checking, we found it
            } else {
                // If file is in DB but missing from folder
                console.log(`File missing: ${fileData.filename}`);
            }
        }
    }
    return false;
}

client.initialize();
















const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { exec } = require("child_process");
const { PDFDocument } = require('pdf-lib');
const qrcode = require('qrcode-terminal');
const path = require('path');
const axios = require("axios");
const mediaCache = new Map(); // 🔥 Temporary vault for incoming media
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

// Ready
client.on('ready', () => {
    console.log('🔥 CyberBot is online and ready!');

    // 🔥 Schedule daily leaderboard at 10 PM IST
   // schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Kolkata' }, async function () {
     //   await sendDailyLeaderboard();
  //  });

    // 🔥 Auto-Birthday Wisher at 7:00 AM IST
    schedule.scheduleJob({ rule: '0 0 * * *', tz: 'Asia/Kolkata' }, async function () {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const todayStr = `${dd}-${mm}`; 

        // Search the database for anyone matching today's date
        const birthdaysToday = studentsDB.filter(s => s.dob === todayStr);

        if (birthdaysToday.length > 0) {
            const names = birthdaysToday.map(s => s.name).join(" and ");
            const bdayMessage = `
🎉 *CYBERBOT BIRTHDAY ALERT* 🎉
━━━━━━━━━━━━━━━━━━━━━━
Everyone wish a massive Happy Birthday to *${names}*! 🎂🔥

May your day be full of good vibes, zero errors, and a lot of celebrations. Party hard macha! 😎⚡
━━━━━━━━━━━━━━━━━━━━━━
            `.trim();

            await broadcastToAllGroups(bdayMessage);
        }
    });

    // ==========================================
    // 🛑 THE MASTER SCHEDULE ENGINE (V2)
    // ==========================================

    // Ensure DB flags exist on startup
    if (db.data.isSaturdayWorking === undefined) {
        db.data.isSaturdayWorking = false;
    }
    if (db.data.isSchedulePaused === undefined) {
        db.data.isSchedulePaused = false;
    }

    // 🛑 1. FRIDAY 5:00 PM - Ask the Architect about Saturday
    schedule.scheduleJob({ rule: '0 17 * * 5', tz: 'Asia/Kolkata' }, async function () {
        if (db.data.isSchedulePaused) return; // Skip asking if on holiday

        const admins = process.env.BOT_ADMINS.split(",");
        if (admins.length > 0) {
            const adminId = admins[0].includes("@") ? admins[0] : `${admins[0]}@c.us`;
            const prompt = `
👨‍💻 *ARCHITECT PROMPT* 👨‍💻
━━━━━━━━━━━━━━━━━━━━
Is tomorrow (Saturday) a working day for the college?

Reply with:
👉 \`.sat yes\`
👉 \`.sat no\`

If you don't reply, I will assume it is a HOLIDAY.
            `.trim();
            try {
                await client.sendMessage(adminId, prompt);
            } catch (err) {
                console.log("Failed to ask Admin about Saturday.");
            }
        }
    });

    // 🌙 2. EVENING 7:00 PM - Tomorrow's Schedule Broadcast (Sun to Fri)
    schedule.scheduleJob({ rule: '0 19 * * 0-5', tz: 'Asia/Kolkata' }, async function () {
        if (db.data.isSchedulePaused) return; // 🔥 Pause Check

        const todayDayOfWeek = new Date().getDay(); // 0 is Sun, 5 is Fri
        
        // If it's Friday and Saturday is NOT working, send weekend msg
        if (todayDayOfWeek === 5 && !db.data.isSaturdayWorking) {
            const msg = `🎉 *WEEKEND ALERT* 🎉\n━━━━━━━━━━━━━━━━━━━━\nTomorrow is a holiday! Rest up, recharge, and drop the college stress.\n\nI will resume operations on Sunday evening. 😎⚡`;
            await broadcastToAllGroups(msg);
            return;
        }

        let nextDay = db.data.currentDayOrder + 1;
        if (nextDay > MAX_DAY_ORDER) nextDay = 1;

        const scheduleData = dayOrderSchedule[nextDay];
        if (!scheduleData) return;

        let labText = "";
        if (scheduleData.hasLab) {
            labText = `👥 *BATCH 1:*\n🔬 Lab: ${scheduleData.labB1}\n🎒 Bring: ${scheduleData.bringB1}\n\n👥 *BATCH 2:*\n🔬 Lab: ${scheduleData.labB2}\n🎒 Bring: ${scheduleData.bringB2}`;
        } else {
            labText = `🔬 *Lab:* No Lab Tomorrow\n🎒 *Bring:* Just yourself and your brain cells`;
        }

        const msg = `🌙 *EVENING BRIEFING* 🌙\n━━━━━━━━━━━━━━━━━━━━\nGet your bags ready for tomorrow!\n\n📅 *Tomorrow is Day Order:* ${nextDay}\n📚 *Classes:* ${scheduleData.subjects}\n\n${labText}\n━━━━━━━━━━━━━━━━━━━━\nRest well. ⚡`;
        await broadcastToAllGroups(msg);
    });

    // ⚙️ 3. NIGHT 12:00 AM - Auto-Update Day Order in DB (Sun to Fri)
    schedule.scheduleJob({ rule: '0 0 * * 0-5', tz: 'Asia/Kolkata' }, async function () {
        if (db.data.isSchedulePaused) return; // 🔥 Pause Check

        const todayDayOfWeek = new Date().getDay(); 
        
        // Don't increment on Friday night if Saturday is a holiday
        if (todayDayOfWeek === 5 && !db.data.isSaturdayWorking) {
            console.log("Saturday is a holiday. Skipping Friday 9 PM Day Order increment.");
            return; 
        }

        let nextDay = db.data.currentDayOrder + 1;
        if (nextDay > MAX_DAY_ORDER) nextDay = 1; 
        
        db.data.currentDayOrder = nextDay;
        await db.write();
        console.log(`✅ Day Order Updated to ${nextDay} for tomorrow.`);
    });

    // 🌅 4. MORNING 7:00 AM - Morning Day Order Announcement (Mon to Sat)
    schedule.scheduleJob({ rule: '0 7 * * 1-6', tz: 'Asia/Kolkata' }, async function () {
        if (db.data.isSchedulePaused) return; // 🔥 Pause Check

        const todayDayOfWeek = new Date().getDay(); // 6 is Sat
        
        // Don't send the morning message if today is Saturday and it's a holiday
        if (todayDayOfWeek === 6 && !db.data.isSaturdayWorking) {
            console.log("Saturday is a holiday. Skipping 7 AM broadcast.");
            
            // Auto-reset the flag for next week just to be safe
            db.data.isSaturdayWorking = false;
            await db.write();
            return; 
        }

        await sendMorningDayOrder();
        
        // If it was a working Saturday, reset the flag after the morning message
        if (todayDayOfWeek === 6) {
            db.data.isSaturdayWorking = false;
            await db.write();
        }
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
//sub database

// 📚 THE EXAM MASTER DATABASE (CHEAT CODE INITIATED)
// 📚 THE EXAM MASTER DATABASE (CHEAT CODE INITIATED)
const examDB = {
    "oss": {
        "1": {
            "twoMarks": [
                "What is interrupts?",
                "Differentiate single processor and Multi processor system.",
                "Define Operating System.",
                "Define Distributed System.",
                "What is system call?",
                "List out the different services offered by operating system."
            ],
            "sixteenMarks": [
                "Explain in detail about the process of Resource Management in detail.",
                "Explain in detail about Computer System architecture in detail. Explain the services offered by operating system.",
                "Describe the computer system organization with a neat diagram.",
                "Explain about the Kernal data structure in detail."
            ]
        },
        "2": {
            "twoMarks": [
                "Define process.",
                "Difference between Process and Program.",
                "State context switching.",
                "What is process synchronization?",
                "What is meant by Semaphore? List out its purpose.",
                "List out the necessary condition for Deadlock and Deadlock Solution."
            ],
            "sixteenMarks": [
                "Describe the process concepts, PCB and various states of a process with neat diagram.",
                "Describe various Deadlock prevention and recovery techniques with suitable examples.",
                "Explain the concept of Semaphores and also the working of binary semaphore and its drawbacks with an example program.",
                "What is Multithreading model? Explain the different types of multithreading model with a neat diagram. Describe the various CPU scheduling algorithms."
            ]
        },
        "3": {
            "twoMarks": [
                "Define Contiguous Memory allocation.",
                "State Memory Management and its functions.",
                "What is meant by Paging?",
                "List out the roles of Segmentation.",
                "What is the role of Disk scheduling technique?",
                "Name the file operations performed in Operating system."
            ],
            "sixteenMarks": [
                "Explain the working and the operations of paging in detail.",
                "Write about the process of Segmentation with a neat diagram.",
                "Describe the various file access methods in detail with a neat diagram. Describe the various structures of Directory in Operating System.",
                "Write about the different file allocation methods in detail. Consider page reference string 1, 3, 0, 3, 5, 6, 3 with 3 page frames. Find the number of page faults using FIFO Page Replacement Algorithm."
            ]
        }
    },
    "aiml": {
        "1": {
            "twoMarks": [
                "What is Artificial Intelligence? Or Define Artificial Intelligence.",
                "List the Components in problem formulation.",
                "Define Adversarial Search.",
                "Define A* tree search.",
                "Define a Game Tree.",
                "What are the Limitations of Hill climbing algorithm."
            ],
            "sixteenMarks": [
                "Explain in detail about Uninformed search algorithms in detail with example.",
                "Discuss in detail about Hill Climbing Algorithm.",
                "Explain in detail about constraint satisfaction problems (CSP) with an Suitable example.",
                "Explain in detail about Informed search algorithms in detail with example."
            ]
        },
        "2": {
            "twoMarks": [
                "Define uncertainty and list the causes of uncertainty.",
                "In a class, there are 70% of the students who like English and 40% of the students who likes English and mathematics, and then what is the percent of students those who like English also like mathematics?",
                "Define Joint probability distribution.",
                "Define Probabilistic reasoning. Mention the need of probabilistic reasoning in AI.",
                "Define Bayes' Theorem.",
                "What are the Applications of Bayesian networks in AI?"
            ],
            "sixteenMarks": [
                "i) Explain in detail about Bayesian inference. ii) Explain in detail about Naive Bayes Model.",
                "Explain in detail about Bayesian Network.",
                "Explain Causal Network.",
                "Explain approximate inference in Bayesian network."
            ]
        },
        "3": {
            "twoMarks": [
                "Define Supervised learning.",
                "Define Bayesian Linear Regression.",
                "Define Logistics Regression.",
                "List the different Types of ML Classification Algorithms.",
                "How does Gradient Descent work?",
                "List out the Application of Naïve Bayes classifier."
            ],
            "sixteenMarks": [
                "Explain Linear Regression Models and Least square method.",
                "Explain in detail about Linear Classification Models Discriminant function.",
                "Elaborate in detail about Support Vector Machine (SVM).",
                "Elaborate in detail about Decision Tree in Supervised Learning."
            ]
        }
    }
};


const cyberSecuritySyllabus = {
    "1": {
        sem: "Semester 1",
        subjects: [
            { code: "MA3151", name: "Matrices and Calculus", credits: 4, type: "theory" },
            { code: "PH3151", name: "Engineering Physics", credits: 3, type: "theory" },
            { code: "CY3151", name: "Engineering Chemistry", credits: 3, type: "theory" },
            { code: "GE3151", name: "Problem Solving and Python Programming", credits: 3, type: "theory" },
            { code: "GE3152", name: "Heritage of Tamils", credits: 2, type: "theory" },
            { code: "PH3111", name: "Engineering Physics Lab", credits: 1, type: "lab" },
            { code: "CY3111", name: "Engineering Chemistry Lab", credits: 1, type: "lab" },
            { code: "GE3111", name: "Python Programming Lab", credits: 2, type: "lab" }
        ]
    },
    "2": {
        sem: "Semester 2",
        subjects: [
            { code: "MA3251", name: "Statistics and Numerical Methods", credits: 4, type: "theory" },
            { code: "PH3256", name: "Physics for Information Science", credits: 3, type: "theory" },
            { code: "BE3251", name: "Basic Electrical and Electronics Engineering", credits: 3, type: "theory" },
            { code: "CS3251", name: "Programming in C", credits: 3, type: "theory" },
            { code: "GE3251", name: "Engineering Graphics", credits: 4, type: "theory" },
            { code: "CS3211", name: "Programming in C Lab", credits: 2, type: "lab" },
            { code: "GE3211", name: "Engineering Practices Lab", credits: 2, type: "lab" }
        ]
    },
    "3": {
        sem: "Semester 3",
        subjects: [
            { code: "MA3354", name: "Discrete Mathematics", credits: 4, type: "theory" },
            { code: "CS3351", name: "Digital Principles and Computer Organization", credits: 3, type: "theory" },
            { code: "CS3352", name: "Foundations of Data Science", credits: 3, type: "theory" },
            { code: "CS3391", name: "Object Oriented Programming", credits: 3, type: "theory" },
            { code: "CCS331", name: "Introduction to Cyber Security", credits: 3, type: "theory" },
            { code: "CS3381", name: "Data Structures Lab", credits: 2, type: "lab" },
            { code: "CS3371", name: "OOP Lab", credits: 2, type: "lab" },
            { code: "GE3361", name: "Professional Development", credits: 1, type: "other" }
        ]
    },
    "4": {
        sem: "Semester 4",
        subjects: [
            { code: "MA3451", name: "Linear Algebra and Numerical Methods", credits: 4, type: "theory" },
            { code: "CS3452", name: "Theory of Computation", credits: 3, type: "theory" },
            { code: "CS3491", name: "Artificial Intelligence and Machine Learning", credits: 3, type: "theory" },
            { code: "CS3492", name: "Database Management Systems", credits: 3, type: "theory" },
            { code: "CCS432", name: "Network Security", credits: 3, type: "theory" },
            { code: "CS3481", name: "Database Lab", credits: 2, type: "lab" },
            { code: "CS3461", name: "Full Stack Development Lab", credits: 2, type: "lab" }
        ]
    },
    "5": {
        sem: "Semester 5",
        subjects: [
            { code: "CS3591", name: "Computer Networks", credits: 3, type: "theory" },
            { code: "CS3501", name: "Operating Systems", credits: 3, type: "theory" },
            { code: "CCS531", name: "Cryptography and Network Security", credits: 3, type: "theory" },
            { code: "CCS532", name: "Ethical Hacking", credits: 3, type: "theory" },
            { code: "CCS533", name: "Digital Forensics", credits: 3, type: "theory" },
            { code: "CCS581", name: "Cyber Security Lab", credits: 2, type: "lab" },
            { code: "CS3581", name: "Networks Lab", credits: 2, type: "lab" },
            { code: "CS3561", name: "Internship", credits: 2, type: "other" }
        ]
    },
    "6": {
        sem: "Semester 6",
        subjects: [
            { code: "CCS631", name: "Web Security", credits: 3, type: "theory" },
            { code: "CCS632", name: "Malware Analysis", credits: 3, type: "theory" },
            { code: "CCS633", name: "Cloud Security", credits: 3, type: "theory" },
            { code: "CCS634", name: "Security Operations and Incident Response", credits: 3, type: "theory" },
            { code: "CS3691", name: "Embedded Systems and IoT", credits: 3, type: "theory" },
            { code: "CCS681", name: "Security Lab", credits: 2, type: "lab" },
            { code: "CS3611", name: "Project Based Learning", credits: 2, type: "other" }
        ]
    },
    "7": {
        sem: "Semester 7",
        subjects: [
            { code: "CCS731", name: "Intrusion Detection Systems", credits: 3, type: "theory" },
            { code: "CCS732", name: "Secure Software Engineering", credits: 3, type: "theory" },
            { code: "CCS733", name: "Blockchain Technology", credits: 3, type: "theory" },
            { code: "ELECTIVE1", name: "Professional Elective 1", credits: 3, type: "theory" },
            { code: "ELECTIVE2", name: "Professional Elective 2", credits: 3, type: "theory" },
            { code: "CCS781", name: "Advanced Security Lab", credits: 2, type: "lab" },
            { code: "GE3791", name: "Industry Internship", credits: 2, type: "other" }
        ]
    },
    "8": {
        sem: "Semester 8",
        subjects: [
            { code: "ELECTIVE3", name: "Professional Elective 3", credits: 3, type: "theory" },
            { code: "ELECTIVE4", name: "Open Elective", credits: 3, type: "theory" },
            { code: "CS3811", name: "Project Work", credits: 6, type: "other" },
            { code: "GE3811", name: "Employability Enhancement Skills", credits: 2, type: "other" }
        ]
    }
};
//bdays
// 🎂 CYBERBOT BIRTHDAY DATABASE
// 🎂 CYBERBOT BIRTHDAY DATABASE (BOYS ONLY)
const studentsDB = [
    { name: "ABDUL RAHIM R", dob: "10-09" },
    { name: "ASHIK S", dob: "08-12" },
    { name: "BHARATHI RAJA R", dob: "16-11" },
    { name: "DHIVESHWAR S", dob: "13-11" },
    { name: "DINAKAR D", dob: "30-11" },
    { name: "ELUMALAI K", dob: "09-10" },
    { name: "ELUMALAI R", dob: "18-09" },
    { name: "GIRINATH P", dob: "06-01" },
    { name: "KARTHICK T", dob: "22-06" },
    { name: "KESAVAN B", dob: "07-12" },
    { name: "KUMARAN S", dob: "06-09" },
    { name: "LOKESH D", dob: "15-06" },
    { name: "LOKESH V", dob: "09-10" },
    { name: "P. Manoj Kumar ", dob: "26-01" },
    { name: "MOHAN RAJ S", dob: "04-02" },
    { name: "NANDHAKUMAR K", dob: "21-11" },
    { name: "NAVEEN S", dob: "10-05" },
    { name: "NISHITH P", dob: "15-01" },
    { name: "NITHISH V", dob: "31-05" },
    { name: "POOMANIYAN P", dob: "09-07" },
    { name: "POOVARASU M", dob: "02-06" },
    { name: "PRAVEENKUMAR R", dob: "06-02" },
    { name: "PUGAZHENDHI K", dob: "26-01" },
    { name: "RAGUL S", dob: "12-05" },
    { name: "Ronaldooooo", dob: "07-03" }, 
    { name: "RUNITHKUMAR S (Nigga)", dob: "22-10" },
    { name: "SANJAY V", dob: "04-12" },
    { name: "SARAN'S", dob: "11-10" },
    { name: "SARAN V", dob: "12-08" },
    { name: "SIVAGURU S", dob: "08-12" },
    { name: "SRIDHARAN SS", dob: "26-06" },
    { name: "SYED THOUSIFF A", dob: "09-08" },
    { name: "THARUN G", dob: "02-08" },
    { name: "THIRUMALAIVASAN G", dob: "06-04" },
    { name: "VARUNKUMAR V", dob: "12-03" },
    { name: "VIGNESH M", dob: "14-05" },
    { name: "VIKASH S", dob: "19-01" },
    { name: "VISHAL R B", dob: "10-01" },
    { name: "YAZHARASU M", dob: "22-11" }
];
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

        } } else {
            // 🔥 MEDIA MESSAGE RECOVERY (Cache-First Approach)
            
            // 1. Check our secret vault first
            let media = mediaCache.get(before.id._serialized);

            // 2. If it's not in the vault (maybe the server just restarted), try downloading it normally as a fallback
            if (!media) {
                try {
                    media = await before.downloadMedia();
                } catch (e) {
                    media = null;
                }
            }

            if (media) {
                const captionText = `${systemHeader}\n📂 *Recovered Deleted Media*\n━━━━━━━━━━━━━━━━━━━━`;

                await chat.sendMessage(media, { 
                    caption: captionText, 
                    mentions: [senderId] 
                });

            } else {
                await chat.sendMessage(
                    `${systemHeader}\n⚠️ Media detected but recovery failed.\n(The file was too large or deleted instantly before caching finished)\n━━━━━━━━━━━━━━━━━━━━`,
                    { mentions: [senderId] }
                );
            }
        }

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



///admin check
function isAdmin(msg) {
    console.log("Sender raw:", msg.author || msg.from);
    const admins = process.env.BOT_ADMINS.split(",");
    const sender = (msg.author || msg.from).replace("@lid", "");
    return admins.includes(sender);
}
//storge for pdf conversion
const pdfSessions = {};
//msg get

client.on('message', async msg => {

    const chat = await msg.getChat();
    // Clean the message (remove mentions, lower case)
    let cleanMessage = msg.body.replace(/@\S+/g, "").trim().toLowerCase();

    // 🔥 ADD XP (Always happens in groups, even if bot ignores the msg)
    if (chat.isGroup) {
        await addXP(msg);
    }

	// 🕵️ THE INTERCEPTOR: Auto-download and cache media instantly
    if (msg.hasMedia && !msg.isStatus) {
        try {
            // Download in the background without making the bot wait
            const media = await msg.downloadMedia();
            if (media) {
                mediaCache.set(msg.id._serialized, media);
                
                // 🧹 Memory Management: Delete from cache after 15 minutes to save RAM
                setTimeout(() => {
                    mediaCache.delete(msg.id._serialized);
                }, 15 * 60 * 1000);
            }
        } catch (err) {
            console.log("Silent caching failed:", err.message);
        }
    }

    // 🛑 GROUP PERMISSION SYSTEM
    if (chat.isGroup) {
        
        const mentions = await msg.getMentions();
        const isMentioned = mentions.some(contact => contact.isMe);
        const senderIsAdmin = isAdmin(msg);

        // Define what counts as a "Silent Command"
        // We only allow commands starting with '.' (like .upload, .stats, .rank)
        // We EXCLUDE '/ai' so the bot doesn't spam AI replies to admins
        const isStrictCommand = cleanMessage.startsWith("."); 

        // 🔒 The Gatekeeper Logic
        if (!isMentioned) {
            // If the bot was NOT tagged...
            
            if (senderIsAdmin && isStrictCommand) {
                // ✅ PASS: It is an Admin using a special command (like .upload)
                // We let this proceed.
            } else {
                // ❌ BLOCK: It is a normal member OR an admin just chatting/using AI
                return; 
            }
        }
    }
if (pdfSessions[msg.from] && msg.hasMedia) {

    const media = await msg.downloadMedia();

    if (media.mimetype.startsWith("image")) {

        pdfSessions[msg.from].push(media);

        await msg.reply(`📸 Image added (${pdfSessions[msg.from].length})`);

        return; // 🔥 IMPORTANT: stop other commands (AI etc.)
    }
}

    // 🚀 Execute the command
    const handled = await routeCommand(msg, cleanMessage);

    // If mentioned but command failed (and it wasn't a private chat)
    if (!handled && chat.isGroup) {
        const mentions = await msg.getMentions();
        if (mentions.some(contact => contact.isMe)) {
            await sendWithTyping(msg, "❌ Command not recognized.");
        }
    }
});

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
// 🛑 Admin Holiday Pause System
// 🛑 Admin Holiday Pause System
    if (cleanMessage === ".pause") {
        if (!isAdmin(msg)) {
            await msg.reply("⛔ Admin only.");
            return true;
        }
        db.data.isSchedulePaused = true;
        await db.write();
        await msg.reply("⏸️ *HOLIDAY MODE ACTIVATED*\nMorning/Evening broadcasts and Day Order updates are now PAUSED. Enjoy the leave! 😎");
        return true;
    }

    if (cleanMessage === ".resume") {
        if (!isAdmin(msg)) {
            await msg.reply("⛔ Admin only.");
            return true;
        }
        db.data.isSchedulePaused = false;
        await db.write();
        await msg.reply("▶️ *SYSTEM RESUMED*\nSchedules are back online. Back to the grind! 🔥");
        return true;
    }
if (cleanMessage === ".convert") return await startConvertSession(msg);
if (cleanMessage === "done") return await finishConvertSession(msg);
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


// 🟢 EXIT MAINTENANCE MODE & AI BROADCAST
if (cleanMessage.startsWith(".donemaintenance")) {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ Only System Architect can deactivate maintenance.");
        return true;
    }

    // 1. Extract the text inside the double quotes
    let updateNotes = "General system upgrades and security patches.";
    const match = msg.body.match(/"([^"]+)"/);
    
    if (match && match[1]) {
        updateNotes = match[1];
    } else {
        // Fallback: If you forget the quotes, it just grabs whatever is after the command
        const parts = cleanMessage.split(".donemaintenance");
        if (parts[1] && parts[1].trim() !== "") {
            updateNotes = parts[1].trim();
        }
    }

    await msg.reply("⚙️ AI is generating the release notes... please wait.");

    let finalMessage = "";

    try {
        // 2. The Custom System Prompt for the Broadcast
        const systemPrompt = `
You are CyberBot, an elite, charismatic WhatsApp bot created by P. Manoj Kumar.
You just came back online after a maintenance break.
Your job is to announce your return and list the new updates/fixes provided by the Architect.

Tone: 
- Dominant, sharp, attractive energy.
- Use a slight "Thunglish" vibe (Tamil + English).
- Hacker/Cyber aesthetic.
- Short, punchy lines. WhatsApp friendly.

Format:
- Start with a cool header like 🟢 CYBERBOT IS BACK ONLINE 🟢
- List the updates in a cool, hyped-up way.
- End with a dominant sign-off.

Here are the raw technical updates you need to announce:
"${updateNotes}"
        `.trim();

        // 3. Call Groq
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Write the broadcast message now." }
                ],
                temperature: 0.8, // Slightly higher for more creative hype
                max_tokens: 300,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                timeout: 10000
            }
        );

        finalMessage = response.data?.choices?.[0]?.message?.content?.trim();

        if (!finalMessage) throw new Error("Empty AI response");

    } catch (error) {
        console.error("AI Broadcast Error:", error.message);
        // Fallback in case the API times out
        finalMessage = `
━━━━━━━━━━━━━━━━━━━━━━
🟢 CYBERBOT IS BACK ONLINE 🟢
━━━━━━━━━━━━━━━━━━━━━━

✅ Upgrade complete: ${updateNotes}
✅ All systems operational

We resume domination. 😎🔥
━━━━━━━━━━━━━━━━━━━━━━`.trim();
    }

    // 4. Send the masterpiece to all groups
    await broadcastToAllGroups(finalMessage);
    
    // 5. Confirm to you (the Architect)
    await msg.reply("✅ AI Broadcast sent successfully to all groups.");
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
        const taskId = Date.now().toString().slice(-6);

db.data.tasks.push({
    id: taskId,
    date: dateStr,
    task: workMessage
});
        await db.write();

        // Send confirmation
        await msg.reply(`✅ Task saved for ${dateStr}. It will be broadcasted at 7 AM on that day.`);

        return true; 
    }
    // ==========================================
    // 2. PREFIX COMMANDS (Tools, OSINT, AI)
    // ==========================================
     //if (cleanMessage.startsWith("/ai")) return await handleDeepAI(msg, cleanMessage
    if (cleanMessage.startsWith(".encode")) return await handleEncode(msg, cleanMessage);
    if (cleanMessage.startsWith(".decode")) return await handleDecode(msg, cleanMessage);
    if (cleanMessage.startsWith(".ip ")) return await handleIPLookup(msg, cleanMessage);
	if (cleanMessage.startsWith(".prep ")) return await handleExamPrep(msg, cleanMessage);
	if (cleanMessage === ".meme") return await handleMeme(msg);
	if (cleanMessage.startsWith(".find ")) return await handleLinkCheck(msg, cleanMessage);
	if (cleanMessage === ".sticker" || cleanMessage === "sticker") return await handleSticker(msg);
	if (cleanMessage === ".cgpa") return await handleCGPA(msg, cleanMessage);
	if (cleanMessage.startsWith(".download")) {
    return await handleDownload(msg);
}
    if (cleanMessage.startsWith("send link for")) return await handleYTLink(msg, cleanMessage);
	if (cleanMessage === ".listwork") {
    return await listWork(msg);
}
		if (cleanMessage.startsWith(".delwork")) {
    return await deleteWork(msg, cleanMessage);
}
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
	// 🔮 Tomorrow's Preview Command
    if (cleanMessage === ".tomorrow" || cleanMessage === "tomorrow") {
        let currentDay = db.data.currentDayOrder;
        let nextDay = currentDay + 1;
        if (nextDay > MAX_DAY_ORDER) nextDay = 1;

        const scheduleData = dayOrderSchedule[nextDay];
        
        let labText = "";
        if (scheduleData.hasLab) {
            labText = `👥 *Batch 1:*\n🔬 Lab: ${scheduleData.labB1}\n🎒 Bring: ${scheduleData.bringB1}\n\n👥 *Batch 2:*\n🔬 Lab: ${scheduleData.labB2}\n🎒 Bring: ${scheduleData.bringB2}`;
        } else {
            labText = `🔬 *Lab:* No Lab Tomorrow\n🎒 *Bring:* Just yourself and your brain cells`;
        }

        const replyMsg = `🔮 *TOMORROW'S PREVIEW (Day Order ${nextDay})*\n📚 ${scheduleData.subjects}\n\n${labText}`;
        await msg.reply(replyMsg);
        return true;
    }

    // 🛑 Admin Saturday Override Command
    if (cleanMessage.startsWith(".sat ")) {
        if (!isAdmin(msg)) {
            await msg.reply("⛔ Admin only.");
            return true;
        }
        const arg = cleanMessage.replace(".sat ", "").trim();
        
        // Ensure the variable exists in DB
        if (db.data.isSaturdayWorking === undefined) db.data.isSaturdayWorking = false;

        if (arg === "yes") {
            db.data.isSaturdayWorking = true;
            await db.write();
            await msg.reply("✅ Saturday is marked as a WORKING day. Tomorrow's schedule will proceed normally.");
        } else if (arg === "no") {
            db.data.isSaturdayWorking = false;
            await db.write();
            await msg.reply("✅ Saturday is marked as a HOLIDAY. Auto-messages paused until Sunday evening.");
        } else {
            await msg.reply("❌ Use `.sat yes` or `.sat no`");
        }
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
	// 📂 Master Directory Command
    if (cleanMessage === ".list" || cleanMessage === "list" || cleanMessage === "/list") {
        return await handleListResources(msg);
    }
	if (cleanMessage === ".listbday") {
    const today = new Date();
    // Get current month (e.g., "03" for March)
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0'); 
    
    // Find all birthdays that end with the current month
    const monthBdays = studentsDB.filter(s => s.dob.endsWith(`-${currentMonth}`));
    
    if (monthBdays.length === 0) {
        await msg.reply("📭 No birthdays in this month!");
        return true;
    }

    // Sort them by date so they appear in chronological order
    monthBdays.sort((a, b) => {
        return parseInt(a.dob.split('-')[0]) - parseInt(b.dob.split('-')[0]);
    });

    let reply = `🎂 *BIRTHDAYS THIS MONTH* 🎂\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    monthBdays.forEach(s => {
        // Example: "▪ 07 - Rishikesh Ragav"
        reply += `▪ ${s.dob.split('-')[0]} - ${s.name}\n`; 
    });
    reply += `━━━━━━━━━━━━━━━━━━━━━━`;
    
    await msg.reply(reply);
    return true;
}
    // Task Scheduler Trigger
    if (cleanMessage.includes("remain")) return await handleReminder(msg, cleanMessage); 

    // ==========================================
    // 4. THE FALLBACK (Conversational Vibe AI)
    // ==========================================
    // If it doesn't match ANY of the above tools, let the personality AI handle it.
	const cgpaHandled = await handleCGPA(msg, cleanMessage);
if (cgpaHandled) return true;
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

🔍 *OSINT & RECON TOOLS*
- .ip <address>     → Geolocate any IP
- .encode <text>    → Base64 encode
- .decode <text>    → Base64 decode
- .find <url>       → Malware link scanner

🧠 *AI MODES*
- /ai <question>    → Deep AI (Gemini 2.0)
- Just tag the bot  → Chat AI (Groq personality)

📅 *DAY ORDER SYSTEM*
- .today            → Today's timetable + lab info
- .tomorrow         → Preview next day's schedule

📚 *QUESTION BANKS*
Send any combo like: oss unit 1 qb
Subjects: oss / aiml / toc / ccs / ess
Units: 1 / 2 / 3

🎓 *EXAM PREP (AI Crash Course)*
- .prep <subject> <unit>
  Example: .prep toc 2

📅 *TIMETABLE*
- class timetable
- IAT 1 timetable

🎥 *YOUTUBE SEARCH*
- send link for <topic> yt video

⏰ *REMINDERS*
- remain tomorrow 5pm submit assignment
- remain in 2 hours drink water
- list reminders

🎨 *MEDIA TOOLS*
- .sticker          → Convert image to sticker
- .download <url>   → Download YouTube/Insta video
- .convert          → Start image-to-PDF converter
  (send images, then type: done)

🏆 *XP & LEADERBOARD*
- .rank             → Group leaderboard
- .stats            → Most active member

🎂 *BIRTHDAYS*
- .listbday         → This month's birthdays

👑 *ADMIN ONLY*
- .work <date> <task>   → Schedule a task
- .listwork             → View scheduled tasks
- .delwork <id>         → Delete a task
- .setday <1-6>         → Force set day order
- .sat yes/no           → Mark Saturday working/holiday
- .upload <name>        → Upload & save a file
- .maintenance          → Enter maintenance mode
- .donemaintenance "notes" → Exit + AI broadcast
- .restartai            → Restart bot
- update                → Send live update msg

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

    // 🔥 FIX: Define 'author' here so it can be used below
    const author = userId.split("@")[0]; 

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

    // Store old level 
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
        // Now 'author' exists, so this will work!
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

    // 🔥 DB Cleanup: Instantly delete today's tasks from the database!
    // We ONLY delete tasks here. We DO NOT change the Day Order yet.
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
            stickerName: "Rishhhiii"    // The bold text title
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


// 🧠 DYNAMIC FILE FINDER (Smart Context Edition)
async function handleDynamicRetrieval(msg, cleanMessage) {
    
    // Safety check for empty DB
    if (!db.data.files || db.data.files.length === 0) return false;

    // 1. Filter out long questions immediately
    // If you ask "what is the difference between a process and a driver", that's 10 words.
    // If the file is just "driver" (1 keyword), we shouldn't send it.
    // Rule: If message is longer than 7 words, assume it's a question for AI.
    const msgWordCount = cleanMessage.split(" ").length;
    if (msgWordCount > 7) return false; 

    // 2. Find matches
    let matches = [];

    for (const fileData of db.data.files) {
        if (!fileData.keywords || fileData.keywords.length === 0) continue;

        // Check if ALL keywords exist
        const isMatch = fileData.keywords.every(keyword => 
            cleanMessage.toLowerCase().includes(keyword.toLowerCase())
        );

        if (isMatch) {
            matches.push(fileData);
        }
    }

    if (matches.length === 0) return false;

    // 3. Sort by Specificity (Best Match)
    matches.sort((a, b) => b.keywords.length - a.keywords.length);
    const bestMatch = matches[0];

    // 4. 🔥 STRICT MODE CHECK
    // If the user says "what is driver", that's 3 words. The file "driver" is 1 keyword.
    // We only allow a small "buffer" of extra words (like "send", "give", "please").
    // If the message has way more words than the filename, ignore it.
    
    // Allow max 3 extra words (e.g. "send [file] please" is ok)
    if (msgWordCount > bestMatch.keywords.length + 3) {
        return false; // Too much extra text, let the AI handle it
    }

    // 5. Send the file
    const filePath = path.join(__dirname, 'media', bestMatch.filename);
    
    if (fs.existsSync(filePath)) {
        console.log(`[FILE SENT] Matched: ${bestMatch.filename}`);
        const media = MessageMedia.fromFilePath(filePath);
        await msg.reply(bestMatch.displayText || "📂 Found it!");
        await client.sendMessage(msg.from, media);
        return true; 
    } else {
        console.log(`[ERROR] File missing: ${bestMatch.filename}`);
        return false;
    }
}


//pdf conversion

async function startConvertSession(msg) {

    pdfSessions[msg.from] = [];

    await msg.reply(
`📄 PDF Mode Started

Send images now.

When finished send:
done`
    );

    return true;
}

async function finishConvertSession(msg) {

    const images = pdfSessions[msg.from];

    if (!images || images.length === 0) {
        await msg.reply("❌ No images received.");
        return true;
    }

    try {

        const pdfDoc = await PDFDocument.create();

        for (const media of images) {

            const imgBuffer = Buffer.from(media.data, "base64");

            let image;

            if (media.mimetype.includes("png")) {
                image = await pdfDoc.embedPng(imgBuffer);
            } else {
                image = await pdfDoc.embedJpg(imgBuffer);
            }

            const page = pdfDoc.addPage([image.width, image.height]);

            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height
            });
        }

        const pdfBytes = await pdfDoc.save();

        const pdfPath = path.join(__dirname, "output.pdf");

        fs.writeFileSync(pdfPath, pdfBytes);

        const pdfMedia = MessageMedia.fromFilePath(pdfPath);

        await client.sendMessage(msg.from, pdfMedia, {
            caption: `📄 PDF created from ${images.length} images`
        });

        fs.unlinkSync(pdfPath);

        delete pdfSessions[msg.from];

    } catch (err) {

        console.log(err);
        await msg.reply("⚠️ Failed to create PDF.");
    }

    return true;
}



// 🔎 OSINT: Malicious Link Scanner (.find)
async function handleLinkCheck(msg, cleanMessage) {
    const urlToCheck = msg.body.slice(msg.body.toLowerCase().indexOf(".find") + 5).trim();

    if (!urlToCheck) {
        await msg.reply("[-] SYS_ERR: Missing payload.\nUsage: .find <link>");
        return true;
    }

    const urlPattern = /^https?:\/\/.+/i;
    if (!urlPattern.test(urlToCheck)) {
        await msg.reply("⚠️ Invalid format. Make sure the link starts with http:// or https://");
        return true;
    }

    await msg.reply("🔎 [OSINT] Scanning target URL across threat intelligence databases...");

    try {
        const payload = new URLSearchParams();
        payload.append('url', urlToCheck);

        const res = await axios.post("https://urlhaus-api.abuse.ch/v1/url/", payload, {
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "CyberBot-OSINT/2.0 (Node.js)",
                // 🔥 INJECTING THE AUTH KEY HERE
                "Auth-Key": process.env.URLHAUS_API_KEY 
            },
            timeout: 10000
        });

        if (res.data.query_status === "ok") {
            const status = res.data.url_status || "unknown";
            const tags = res.data.tags ? res.data.tags.join(", ") : "None";
            const threat = res.data.threat || "Malware";
            
            let report = `
🚨 [MALWARE DETECTED] 🚨
━━━━━━━━━━━━━━━━━━━━
▪ Target: ${urlToCheck}
▪ Status: ${status.toUpperCase()}
▪ Threat: ${threat}
▪ Tags: ${tags}
━━━━━━━━━━━━━━━━━━━━
⛔ DO NOT CLICK THIS LINK. IT IS COMPROMISED.
            `.trim();
            await msg.reply(report);

        } else if (res.data.query_status === "no_results") {
            let report = `
✅ [SCAN COMPLETE]
━━━━━━━━━━━━━━━━━━━━
▪ Target: ${urlToCheck}
▪ Status: CLEAN
━━━━━━━━━━━━━━━━━━━━
🟢 No malicious signatures found. It looks ok to go.
            `.trim();
            await msg.reply(report);

        } else {
             await msg.reply(`⚠️ [SCAN FAILED] API returned status: ${res.data.query_status}`);
        }

    } catch (error) {
        console.error("Link Check Error Details:", error.response?.data || error.message);
        await msg.reply(`[-] Connection failed. Error: ${error.message}`);
    }
    
    return true;
}

async function listWork(msg) {

    if (!db.data.tasks || db.data.tasks.length === 0) {
        await msg.reply("📭 No upcoming works.");
        return true;
    }

    let reply = "📋 *UPCOMING WORKS*\n\n";

    db.data.tasks.forEach(task => {

        const date = new Date(task.date);

        const formatted = date.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short"
        });

        reply += `🆔 ${task.id}\n`;
        reply += `📅 ${formatted} (7 AM reminder)\n`;
        reply += `📌 ${task.task}\n`;
        reply += `━━━━━━━━━━━━\n`;
    });

    await msg.reply(reply.trim());
    return true;
}


async function deleteWork(msg, cleanMessage) {

    if (!isAdmin(msg)) {
        await msg.reply("⛔ Admin only.");
        return true;
    }

    const id = cleanMessage.split(" ")[1];

    if (!id) {
        await msg.reply("❌ Usage: .delwork <id>");
        return true;
    }

    const before = db.data.tasks.length;

    db.data.tasks = db.data.tasks.filter(t => t.id !== id);

    await db.write();

    if (db.data.tasks.length === before) {
        await msg.reply("⚠️ Work ID not found.");
    } else {
        await msg.reply(`✅ Work ${id} deleted.`);
    }

    return true;
}


///vid download
async function handleDownload(msg) {
    const args = msg.body.split(" ");
    let url = args.length > 1 ? args[1].trim() : null;
    
    if (!url || !url.startsWith("http")) {
        await msg.reply("❌ Usage:\n.download <youtube / instagram link>");
        return;
    }

    // Strip tracking parameters (?igsh=) to ensure clean API processing
    url = url.split("?")[0];

    await msg.reply("⬇️ Fetching video from local server... please wait.");

    try {
        // Ping your private Cobalt Docker container on port 9000
        const response = await axios.post('http://localhost:9000/', {
            url: url
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Cobalt returns the processed, direct media link in the 'url' property
        const directVideoUrl = response.data.url; 

        if (!directVideoUrl) {
            await msg.reply("⚠️ Could not extract the video link. The content might be fully private.");
            return;
        }

        // WhatsApp Web JS downloads the media straight from the URL
        const media = await MessageMedia.fromUrl(directVideoUrl, { unsafeMime: true });
        
        // Send the video back to the chat
        await client.sendMessage(msg.from, media, {
            caption: "🎬 Downloaded instantly via private server!"
        });

    } catch (error) {
        console.error("Local API Error:", error.response ? error.response.data : error.message);
        await msg.reply("⚠️ Download failed. Ensure your Cobalt Docker container is still running.");
    }
}
//done msg to all gropu

async function generateUpdateMessage(updateText) {

    try {

        const prompt = `
You are the system announcer for CyberBot.

Turn the following update notes into a stylish WhatsApp announcement.

Rules:
- Keep it short
- Use emojis
- Make it feel like a system upgrade announcement
- Format nicely

Updates:
${updateText}
`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: "You create cool system update announcements." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.6,
                max_tokens: 200
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        let reply = response.data?.choices?.[0]?.message?.content?.trim();

        if (!reply) {
            return `🟢 CYBERBOT UPDATE\n\n${updateText}`;
        }

        return reply;

    } catch (error) {

        console.log("AI Update Error:", error.message);

        return `🟢 CYBERBOT UPDATE\n\n${updateText}`;
    }
}
///exam prep function

async function handleExamPrep(msg, cleanMessage) {
    // Expected format: .prep toc 1
    const args = cleanMessage.replace(".prep", "").trim().split(" ");
    
    if (args.length < 2) {
        await msg.reply("⚠️ Usage: `.prep <subject> <unit>`\nExample: `.prep toc 1`");
        return true;
    }

    const subject = args[0].toLowerCase();
    const unit = args[1];

    // Check if we have the questions in the database
    if (!examDB[subject] || !examDB[subject][unit]) {
        await msg.reply(`❌ Database miss. I don't have the guaranteed questions for ${subject.toUpperCase()} Unit ${unit} yet.`);
        return true;
    }

    const unitData = examDB[subject][unit];
    const twoMarksText = unitData.twoMarks.map((q, i) => `${i+1}. ${q}`).join("\n");
    const sixteenMarksText = unitData.sixteenMarks.map((q, i) => `${i+1}. ${q}`).join("\n");

    await msg.reply(`🧠 Accessing ${subject.toUpperCase()} Unit ${unit} Mainframe...\nAnalyzing the exact university questions. Generating crash course... ⏳`);

    try {
        const systemPrompt = `
You are CyberBot, an elite, charismatic academic hacker. 
Your goal is to help a college student pass their exam tomorrow. 
The university exam will ONLY contain questions from the list provided below.

Task:
1. Provide a "10-Minute Crash Course" summary of the core concepts needed to understand these specific questions.
2. Provide punchy, easy-to-memorize answers for the 2-mark questions.
3. Give a 3-step strategy on how to tackle the 16-mark questions.

Tone: Dominant, high IQ, mentor vibe. Use Thunglish occasionally (e.g., "Listen macha", "This is easy da"). Keep formatting clean for WhatsApp.

Here are the guaranteed questions:
[2-MARKS]
${twoMarksText}

[16-MARKS]
${sixteenMarksText}
        `.trim();

        // Call Groq AI using your existing setup
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL, // using your defined Groq model
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Teach me. I have an exam tomorrow." }
                ],
                temperature: 0.6,
                max_tokens: 1500,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                timeout: 15000
            }
        );

        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        
        if (reply) {
            await msg.reply(reply);
            
            // 🔥 Step 4: Auto-Schedule the Morning Reminder
            scheduleMorningRevision(msg.from, subject, unit);
            await msg.reply(`⏰ P.S. I've set a system alarm. I will wake you up with a quick revision reminder tomorrow morning at 6:00 AM IST. Get some sleep.`);
        }

        return true;

    } catch (error) {
        console.error("Prep Engine Error:", error);
        await msg.reply("⚠️ Neural link to Groq failed. Try again in a minute.");
        return true;
    }
}


//exam revision function
function scheduleMorningRevision(userId, subject, unit) {
    // 🔥 Force 6:00 AM in Indian Standard Time
    const job = schedule.scheduleJob({ rule: '0 6 * * *', tz: 'Asia/Kolkata' }, async function() {
        const wakeupMsg = `
🌅 *CYBERBOT WAKE UP CALL* 🌅
━━━━━━━━━━━━━━━━━━━━
Get up. Your ${subject.toUpperCase()} exam is today. 

Quick mental check for Unit ${unit}:
Do you remember the 2-marks? If you blank out on the 16-marks, just draw the diagrams and write the side-headings. 

Go dominate the paper. 🔥
        `.trim();

        try {
            await client.sendMessage(userId, wakeupMsg);
        } catch (err) {
            console.log("Failed to send morning revision to:", userId);
        }

        // 🔥 SELF-DESTRUCT: Cancel the job after it runs so it only happens once
        job.cancel();
    });
}
//list funcktion

async function handleListResources(msg) {
    let replyText = "📚 *CYBERBOT MASTER DIRECTORY* 📚\n━━━━━━━━━━━━━━━━━━━━\n\n";

    // ==========================================
    // 1. DYNAMIC AI CRASH COURSES (From examDB)
    // ==========================================
    replyText += "🧠 *AI-POWERED CRASH COURSES (.prep)*\n";
    replyText += "*(Generates instant 10-min summaries)*\n";
    
    if (typeof examDB !== 'undefined' && Object.keys(examDB).length > 0) {
        for (const subject in examDB) {
            const units = Object.keys(examDB[subject]).sort((a, b) => a - b);
            replyText += `▪️ *${subject.toUpperCase()}* (Units: ${units.join(", ")})\n`;
        }
    } else {
        replyText += "▪️ _No AI modules loaded yet._\n";
    }

    replyText += "\n━━━━━━━━━━━━━━━━━━━━\n\n";

    // ==========================================
    // 2. PDF QUESTION BANKS & MEDIA (.qb / .send)
    // ==========================================
    replyText += "📄 *PDF QUESTION BANKS*\n";
    replyText += "*(Type the command to get the PDF)*\n";

    // ⚠️ ARCHITECT: Add your actual PDF commands/subjects here!
    const pdfBanks = [
        "OSS (Units 1, 2, 3)",
        "AIML (Units 1, 2, 3)",
        "TOC (All Units)"
    ];

    pdfBanks.forEach(bank => {
        replyText += `▪️ ${bank}\n`;
    });

    replyText += "\n━━━━━━━━━━━━━━━━━━━━\n";
    replyText += "⚡ *SYSTEM COMMANDS:*\n";
    replyText += "👉 `.prep <subject> <unit>` (AI Summary)\n";
    replyText += "👉 `.qb <subject>` (Get PDF)\n"; // Change .qb to whatever your command is
    replyText += "👉 `.tomorrow` (Next Day's Schedule)\n";

    await msg.reply(replyText.trim());
    return true;
}
//meme generate
async function handleMeme(msg) {
    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: "You generate funny college student memes and relatable jokes in Thunglish (Tamil + English mix). Keep it short, punchy, WhatsApp-friendly. Use emojis." },
                    { role: "user", content: "Generate one funny college student meme or relatable quote right now." }
                ],
                temperature: 0.9,
                max_tokens: 150
            },
            { headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } }
        );
        
        const meme = response.data?.choices?.[0]?.message?.content?.trim();
        await msg.reply(`😂 *CYBERBOT MEME DROP* 😂\n━━━━━━━━━━━━━━━━━━━━\n${meme}\n━━━━━━━━━━━━━━━━━━━━`);
        return true;
    } catch (e) {
        await msg.reply("😂 Bro the meme engine crashed. Try again.");
        return true;
    }
}

//cgpa cal

// Store ongoing CGPA sessions
const cgpaSession = {};

async function handleCGPA(msg, cleanMessage) {
    const userId = msg.from;

    // START: .cgpa
    if (cleanMessage === ".cgpa") {
        cgpaSession[userId] = { step: "choose_sem", grades: [], currentSubIndex: 0 };

        let semList = `🎓 *CYBERBOT CGPA CALCULATOR*\n━━━━━━━━━━━━━━━━━━━━\nWhich semester? Reply with number.\n\n`;
        for (let i = 1; i <= 8; i++) {
            semList += `${i}️⃣ Semester ${i}\n`;
        }
        semList += `━━━━━━━━━━━━━━━━━━━━`;
        await msg.reply(semList);
        return true;
    }

    // SESSION ACTIVE
    const session = cgpaSession[userId];
    if (!session) return false;

    // STEP 1: User picked semester
    if (session.step === "choose_sem") {
        const sem = parseInt(cleanMessage.trim());
        if (!sem || sem < 1 || sem > 8) {
            await msg.reply("❌ Send a number between 1 and 8.");
            return true;
        }
        session.sem = sem.toString();
        session.subjects = cyberSecuritySyllabus[session.sem].subjects.filter(s => s.type !== "other");
        session.step = "collecting_grades";
        session.currentSubIndex = 0;

        await askNextSubject(msg, session);
        return true;
    }

    // STEP 2: Collecting grades one by one
    if (session.step === "collecting_grades") {
        const gradeInput = cleanMessage.trim().toUpperCase();
        const validGrades = ["O", "A+", "A", "B+", "B", "C", "U", "W"];

        if (!validGrades.includes(gradeInput)) {
            await msg.reply(`❌ Invalid grade. Send one of: O, A+, A, B+, B, C, U, W`);
            return true;
        }

        // Save this grade
        const currentSub = session.subjects[session.currentSubIndex];
        session.grades.push({ ...currentSub, grade: gradeInput });
        session.currentSubIndex++;

        // More subjects left?
        if (session.currentSubIndex < session.subjects.length) {
            await askNextSubject(msg, session);
        } else {
            // All done — calculate
            session.step = "done";
            await calculateAndShowCGPA(msg, session, userId);
        }
        return true;
    }

    return false;
}

async function askNextSubject(msg, session) {
    const sub = session.subjects[session.currentSubIndex];
    const total = session.subjects.length;
    const current = session.currentSubIndex + 1;

    await msg.reply(
        `📚 *Subject ${current}/${total}*\n` +
        `🔹 Code: ${sub.code}\n` +
        `🔹 Name: ${sub.name}\n` +
        `🔹 Credits: ${sub.credits}\n\n` +
        `Enter your grade:\n*O / A+ / A / B+ / B / C / U / W*`
    );
}

async function calculateAndShowCGPA(msg, session, userId) {
    // Anna University grade to point mapping
    const gradePoints = { "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "U": 0, "W": 0 };

    let totalCredits = 0;
    let totalPoints = 0;
    let failedSubs = [];
    let gradeBreakdown = "";

    session.grades.forEach(sub => {
        const point = gradePoints[sub.grade];
        const weightedPoint = point * sub.credits;
        totalCredits += sub.credits;
        totalPoints += weightedPoint;

        if (sub.grade === "U" || sub.grade === "W") {
            failedSubs.push(sub.name);
        }

        gradeBreakdown += `▪ ${sub.code} — ${sub.grade} (${point}.0 × ${sub.credits}cr)\n`;
    });

    const cgpa = (totalPoints / totalCredits).toFixed(2);
    const percentage = ((cgpa - 0.5) * 10).toFixed(1);

    // Class classification
    let classRemark = "";
    if (cgpa >= 9.0) classRemark = "🏆 Outstanding — First Class with Distinction";
    else if (cgpa >= 8.0) classRemark = "🥇 Excellent — First Class";
    else if (cgpa >= 7.0) classRemark = "🥈 Good — First Class";
    else if (cgpa >= 6.0) classRemark = "🥉 Average — Second Class";
    else if (cgpa >= 5.0) classRemark = "⚠️ Pass Class";
    else classRemark = "🚨 Below Pass — Arrears Present";

    let result = `
🎓 *CGPA RESULT — SEM ${session.sem}*
━━━━━━━━━━━━━━━━━━━━
${gradeBreakdown}
━━━━━━━━━━━━━━━━━━━━
📊 *CGPA: ${cgpa} / 10*
📈 *Percentage: ${percentage}%*
🏅 *${classRemark}*
━━━━━━━━━━━━━━━━━━━━`;

    if (failedSubs.length > 0) {
        result += `\n🚨 *Arrears: ${failedSubs.join(", ")}*`;
    }

    await msg.reply(result.trim());

    // Now trigger SWOT via AI
    await msg.reply("🔍 Analyzing your academic profile... generating SWOT report ⏳");
    await generateSWOT(msg, session, cgpa, failedSubs, percentage);

    // Clear session
    delete cgpaSession[userId];
}

async function generateSWOT(msg, session, cgpa, failedSubs, percentage) {
    try {
        const gradeList = session.grades.map(s => `${s.name}: ${s.grade}`).join(", ");

        const prompt = `
A Cyber Security engineering student has the following academic results:
Semester: ${session.sem}
CGPA: ${cgpa}
Percentage: ${percentage}%
Subject-wise grades: ${gradeList}
${failedSubs.length > 0 ? `Arrears in: ${failedSubs.join(", ")}` : "No arrears"}

Generate a SWOT analysis of this student's academic performance in this format:

💪 STRENGTHS: (what subjects they're good at, based on O/A+ grades)
⚠️ WEAKNESSES: (subjects with low grades B/C/U, areas to improve)
🚀 OPPORTUNITIES: (career paths in Cyber Security they can aim for based on strong subjects)
🛑 THREATS: (risks — arrears, low CGPA impact on placements, areas that need urgent attention)

Keep it sharp, specific to Cyber Security domain, and motivational. Use Thunglish tone. WhatsApp friendly format. Max 250 words.
        `.trim();

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: MODEL,
                messages: [
                    { role: "system", content: "You are an academic advisor for engineering students specializing in Cyber Security." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const swot = response.data?.choices?.[0]?.message?.content?.trim();

        await msg.reply(`📊 *YOUR ACADEMIC SWOT ANALYSIS*\n━━━━━━━━━━━━━━━━━━━━\n${swot}\n━━━━━━━━━━━━━━━━━━━━`);

    } catch (err) {
        await msg.reply("⚠️ SWOT engine failed. But your CGPA is calculated above!");
    }
}
client.initialize();



































const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const adapter = new JSONFile('database.json');

// ✅ Provide default structure here
const defaultData = {
    reminders: [],
    tasks: [],
    xp: [],
    dailyStats: [],
    currentDayOrder: 1 // 🔥 NEW: Track the current day order
};

const db = new Low(adapter, defaultData);

async function initDB() {
    await db.read();

    db.data ||= defaultData;

    // Safety checks (VERY IMPORTANT)
    if (!db.data.xp) db.data.xp = [];
    if (!db.data.reminders) db.data.reminders = [];
    if (!db.data.tasks) db.data.tasks = [];
    if (!db.data.dailyStats) db.data.dailyStats = [];
    if (!db.data.currentDayOrder) db.data.currentDayOrder = 1; // 🔥 NEW

    await db.write();
}

module.exports = { db, initDB };

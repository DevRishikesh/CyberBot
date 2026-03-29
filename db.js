// db.js - Custom Native Engine (Zero Dependencies)
const fs = require('fs').promises;
const path = require('path');

const file = path.join(__dirname, 'database.json');

const defaultData = {
    reminders: [],
    tasks: [],
    xp: [],
    dailyStats: [],
    currentDayOrder: 1,
    files: [],
    exams: []
};

const db = {
    data: null,
    async read() {
        try {
            const content = await fs.readFile(file, 'utf-8');
            this.data = JSON.parse(content);
        } catch (error) {
            // If file doesn't exist yet, load default data
            this.data = JSON.parse(JSON.stringify(defaultData));
            await this.write();
        }

        // Failsafe checks to ensure arrays exist
        this.data.xp = this.data.xp || [];
        this.data.reminders = this.data.reminders || [];
        this.data.tasks = this.data.tasks || [];
        this.data.dailyStats = this.data.dailyStats || [];
        this.data.currentDayOrder = this.data.currentDayOrder || 1;
        this.data.files = this.data.files || [];
    },
    async write() {
        // Writes the data object back to database.json nicely formatted
        await fs.writeFile(file, JSON.stringify(this.data, null, 2), 'utf-8');
    }
};

async function initDB() {
    await db.read();
}

module.exports = { db, initDB };

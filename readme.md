# 🤖 CYBERBOT v2.0
**The Ultimate WhatsApp OSINT & AI Terminal**

![Version](https://img.shields.io/badge/Version-2.0--STABLE-brightgreen)
![Runtime](https://img.shields.io/badge/Runtime-Node.js-blue)
![Status](https://img.shields.io/badge/Status-Active-success)

Architected by **Rishikesh Ragav** (@DevRishikesh), CyberBot is a high-performance, WhatsApp-integrated artificial intelligence and utility terminal. Designed to replace standard, boring chatbots, it operates with a brutalist, Linux-style aesthetic. It acts as a central hub for academics, a socially dominant conversational AI, and a pocket-sized cybersecurity recon tool.

---

## ⚡ Core Architecture

* **Dual-AI Processing:** * **The Persona Engine (Groq / Llama 3.1):** Highly charismatic, context-aware conversational AI capable of adapting to the chat's vibe—from roasting to deep philosophical talks.
  * **The Deep Brain (Gemini 2.0 Flash):** An elite-level academic and coding AI designed to deliver structured, deep-dive explanations and heavy computational logic.
* **Headless Browser Integration:** Runs silently in the background via Puppeteer and `whatsapp-web.js` for seamless real-time message listening and execution.

---

## 🛠️ Tactical Modules & Features

### 1. Pocket OSINT & Crypto Tools
* **Network Recon (`.ip <address>`):** Live IP geolocation tracking and ISP mapping to pull target data on the fly.
* **Cryptography (`.encode` / `.decode`):** Built-in Base64 string manipulation to secure or decipher payloads directly in the chat.
* **Ghost Protocol (Anti-Delete):** A background listener that intercepts and recovers any message a user attempts to delete, exposing the recovered payload to the group.

### 2. The Smart Academic Engine
Powered by a custom **Keyword Matrix**, the bot understands natural human text without requiring strict command syntax.
* **Instant File Retrieval:** Directly serves university question banks (OSS, AIML, TOC, CCS, ESS) and timetables on command. (e.g., `"bro send toc unit 1 qb pls"`).
* **Targeted Media Scraping:** Specifically pulls relevant study materials from targeted YouTube channels using precise query filtering.

### 3. Network Dominance (Gamification)
* **Automated XP System:** Tracks user engagement across the group, assigning XP and dynamically leveling up active members.
* **Commands:** `.rank` (Leaderboard) and `.stats` (Server dominance stats).
* **Chron-Job Leaderboards:** Executes a scheduled daily task at 22:00 hours to broadcast the day's top network contributors.

### 4. Automation & Task Scheduling
* **Natural Language Reminders:** Uses `chrono-node` to parse human time inputs (e.g., `"remain tomorrow 5pm to submit assignment"`) and sets up exact chronological background jobs to ping the user.

---

## ⚙️ Tech Stack & Dependencies

* **Runtime:** Node.js
* **WhatsApp API:** `whatsapp-web.js`
* **AI APIs:** Google Gemini API, Groq Cloud API
* **Task Scheduling:** `node-schedule`, `chrono-node`
* **Utilities:** `axios`, `qrcode-terminal`, `yt-search`

---

## 🚀 Deployment & Setup

### 1. Clone the Repository
```bash
git clone [https://github.com/DevRishikesh/CyberBot.git](https://github.com/DevRishikesh/CyberBot.git)
cd cyberbot
2. Install Dependencies
Bash
npm install
3. Environment Variables
Create a .env file in the root directory and configure your API keys:

Code snippet
GEMINI_API_KEY=your_groq_api_key_here
GEMINI_API_KEY2=your_google_gemini_api_key_here
BOT_ADMINS=your_number_without_plus_sign
(Note: Replace the Groq key mapped to GEMINI_API_KEY if needed based on your environment).

4. Boot the Terminal
Bash
node index.js
Scan the generated QR code with your WhatsApp linked devices to initialize the bot.

📜 Commands Directory
Type help or /help in the chat to pull up the terminal interface.

Quick Reference:

/ai <query> - Trigger Deep Brain (Gemini)

.ip <address> - Target IP Recon

.encode <text> - Base64 Encrypt

.decode <string> - Base64 Decrypt

.rank - View XP Leaderboard

Built with intelligence. Powered by chaos. Dominate the chat.

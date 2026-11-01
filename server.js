const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection (Render Environment Variables से कनेक्ट होगा)
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/proof-of-mind";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch(err => console.log("MongoDB Connection Error:", err));

// Database Schemas
const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    username: String,
    platform: String,
    language: { type: String, default: 'en' },
    balance: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    hearts: { type: Number, default: 5 },
    isVerified: { type: Boolean, default: false },
    completedTasks: { type: Array, default: [] },
    referralCountL1: { type: Number, default: 0 },
    referralCountL2: { type: Number, default: 0 },
    referredBy: { type: String, default: null }
});
const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
    taskId: { type: String, unique: true },
    title: String,
    url: String,
    reward: { type: Number, default: 50 },
    icon: String
});
const Task = mongoose.model('Task', taskSchema);

// Default Tasks Setup
async function seedDefaultTasks() {
    const count = await Task.countDocuments();
    if (count === 0) {
        await Task.insertMany([
            { taskId: 'yt', title: 'YouTube', url: 'https://youtube.com/@proofofmind', reward: 50, icon: '📺' },
            { taskId: 'x', title: 'X (Twitter)', url: 'https://x.com/proofofmind', reward: 50, icon: '🐦' },
            { taskId: 'tg', title: 'Telegram', url: 'https://t.me/proofofmind', reward: 50, icon: '✈️' },
            { taskId: 'fb', title: 'Facebook', url: 'https://facebook.com/proofofmind', reward: 50, icon: '📘' }
        ]);
    }
}
seedDefaultTasks();

// 1. Auth & Login API
app.post('/api/auth', async (req, res) => {
    try {
        const { userId, username, platform, language, refCode } = req.body;
        let user = await User.findOne({ userId });

        if (!user) {
            user = new User({ userId, username, platform, language: language || 'en', referredBy: refCode || null });
            await user.save();

            // Handle Referrals (L1 & L2)
            if (refCode) {
                let l1User = await User.findOne({ userId: refCode });
                if (l1User) {
                    l1User.referralCountL1 += 1;
                    l1User.balance += 10; // Bonus for referral
                    await l1User.save();

                    if (l1User.referredBy) {
                        let l2User = await User.findOne({ userId: l1User.referredBy });
                        if (l2User) {
                            l2User.referralCountL2 += 1;
                            l2User.balance += 4;
                            await l2User.save();
                        }
                    }
                }
            }
        }
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. Get Dynamic Tasks API
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.json({ success: true, tasks });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 3. Game Data API (Word & Quiz Levels)
app.get('/api/get-game-data', async (req, res) => {
    try {
        const { userId, type } = req.query; // type: 'word' or 'quiz'
        const user = await User.findOne({ userId });
        if (!user || user.hearts <= 0) return res.json({ success: false, hearts: 0 });

        // Sample Word and Quiz banks based on level
        const sampleWords = ["PI", "MINING", "TON", "BLOCK", "CRYPTO", "WEB", "FUTURE", "NODE", "MIND", "PROOF"];
        const target = sampleWords[(user.level - 1) % sampleWords.length];
        const pool = (target + "ABCDE").split('').sort(() => Math.random() - 0.5);

        res.json({ success: true, target, pool, level: user.level, hearts: user.hearts });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 4. Verify Game Answer API (Level Reward +1 PoM formula, Double if Verified)
app.post('/api/verify-game', async (req, res) => {
    try {
        const { userId, isCorrect } = req.body;
        let user = await User.findOne({ userId });
        if (!user || user.hearts <= 0) return res.json({ success: false, hearts: 0 });

        let baseReward = user.level + 2; // Level 1 = 3 PoM, Level 2 = 4 PoM, etc.
        if (user.isVerified) baseReward *= 2; // 100% Boost after 0.3 TON verification

        if (isCorrect) {
            user.balance += baseReward;
            user.level += 1;
            await user.save();
            return res.json({ success: true, earned: baseReward, newBalance: user.balance, newLevel: user.level, hearts: user.hearts });
        } else {
            user.hearts -= 1;
            await user.save();
            return res.json({ success: false, hearts: user.hearts });
        }
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 5. Ad Webhook (Refill Hearts: 1 ad = 2 hearts, 2 ads = 5 hearts)
app.get('/api/ad-reward', async (req, res) => {
    try {
        const { userId, count } = req.query; // count = 1 or 2
        let user = await User.findOne({ userId });
        if (user) {
            user.hearts = (count == '2') ? 5 : Math.min(5, user.hearts + 2);
            await user.save();
            return res.json({ success: true, hearts: user.hearts });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({ success: false }); }
});

// 6. TGE Auto-Withdrawal Placeholder
app.post('/api/withdraw', async (req, res) => {
    res.json({ success: false, message: "Auto-withdrawal will be activated during TGE Phase! 🚀" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

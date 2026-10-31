const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pncindi:YOUR_PASSWORD@cluster0.mongodb.net/proof-of-mind?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB Error:", err));

const MASTER_TON_ADDRESS = "UQD5ZiNy8-eV7l6Ny46c-f98USLg-JXPTRRIPMV-0YiadqJV";

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  language: { type: String, default: 'en' },
  level: { type: Number, default: 1 },
  isDailyLoopUnlocked: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  tonWalletAddress: { type: String, default: "" },
  piWalletAddress: { type: String, default: "" },
  livesLeft: { type: Number, default: 5 },
  speedMultiplier: { type: Number, default: 1.0 },
  referredBy: { type: String, default: null },
  level2Upline: { type: String, default: null },
  referralCountL1: { type: Number, default: 0 },
  referralCountL2: { type: Number, default: 0 },
  refRewardsEarned: { type: Number, default: 0 },
  completedTasks: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

const BASE_DICTIONARY = {
  en: ["MIND", "NODE", "COIN", "TON", "BLOCK", "PROOF", "CHAIN", "SMART", "CRYPTO", "TOKEN", "FUTURE", "SECURE", "DECENTRAL"],
  hi: ["मन", "ज्ञान", "सत्य", "शक्ति", "चेतना", "प्रकाश", "विचार", "बुद्धि", "तंत्र", "क्रांति", "संस्कार"],
  vi: ["TÂM", "MẠNG", "KHỐI", "XÍCH", "ĐỒNG", "TRÍ", "TIỀN", "TƯƠNG", "MINH", "THỰC"],
  id: ["AKAL", "NODE", "KOIN", "BLOK", "PIKIR", "RANTAI", "PINTAR", "KRIPTO", "JARING"],
  zh: ["心灵", "节点", "代币", "区块", "公链", "密码", "智能", "未来", "共识", "去中心"],
  bn: ["মন", "জ্ঞান", "সত্য", "শক্তি", "চেতনা", "আলো", "চিন্তা", "বুদ্ধি", "নেটওয়ার্ক"],
  ar: ["عقل", "نود", "كتلة", "شبكة", "عملة", "فكر", "سلسلة", "تشفير", "مستقبل"],
  ru: ["УМ", "УЗЕЛ", "БЛОК", "СЕТЬ", "ЦЕПЬ", "МОЗГ", "ТОКЕН", "РАЗУМ", "КРИПТО"],
  es: ["MENTE", "NODO", "BLOQUE", "CADENA", "FUTURO", "TOKEN", "SEGURA", "CRIPTOMEDA"]
};

// Auth & Referral Fix
app.post('/api/auth', async (req, res) => {
  try {
    let { userId, platform, username, language, refCode } = req.body;
    userId = String(userId);
    let user = await User.findOne({ userId });

    if (!user) {
      let l1Leader = null;
      let l2Leader = null;

      if (refCode && String(refCode) !== userId) {
        const directUpline = await User.findOne({ userId: String(refCode) });
        if (directUpline) {
          l1Leader = directUpline.userId;
          directUpline.referralCountL1 += 1;
          await directUpline.save();

          if (directUpline.referredBy) {
            const secondUpline = await User.findOne({ userId: directUpline.referredBy });
            if (secondUpline) {
              l2Leader = secondUpline.userId;
              secondUpline.referralCountL2 += 1;
              await secondUpline.save();
            }
          }
        }
      }

      user = new User({
        userId,
        platform,
        username,
        language: language || 'en',
        referredBy: l1Leader,
        level2Upline: l2Leader
      });
      await user.save();
    }

    res.json({ success: true, user, receiverAddress: MASTER_TON_ADDRESS });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Game Data Fix (Ensuring words pool is never empty)
app.get('/api/get-game-data', async (req, res) => {
  try {
    const { userId, lang } = req.query;
    let user = await User.findOne({ userId: String(userId) });
    if (!user) {
      user = new User({ userId: String(userId) });
      await user.save();
    }

    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';
    const wordList = BASE_DICTIONARY[currentLang] || BASE_DICTIONARY['en'];
    const targetWord = wordList[(user.level - 1) % wordList.length];

    let letterPool = targetWord.split('');
    const extraChars = currentLang === 'hi' ? "अआइईउऊऋएऐओऔकखगघचछजझटठडढतथदधनपफबभमयरलवशषसह" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    while (letterPool.length < Math.max(8, targetWord.length + 2)) {
      letterPool.push(extraChars[Math.floor(Math.random() * extraChars.length)]);
    }
    letterPool.sort(() => Math.random() - 0.5);

    res.json({
      success: true,
      mode: "LEVEL_GAME",
      level: user.level,
      pool: letterPool,
      reward: 10 + (user.level * 2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Game Answer
app.post('/api/verify-game', async (req, res) => {
  try {
    const { userId, answer, lang, mode } = req.body;
    const user = await User.findOne({ userId: String(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';
    const wordList = BASE_DICTIONARY[currentLang] || BASE_DICTIONARY['en'];
    const targetWord = wordList[(user.level - 1) % wordList.length];
    
    const isCorrect = answer.trim() === targetWord;
    if (isCorrect) {
      const earned = (10 + (user.level * 2)) * (user.isVerified ? 2.5 : 1.0);
      user.balance += earned;
      user.level += 1;
      await user.save();

      // Referral Payouts
      if (user.referredBy) {
        const l1 = await User.findOne({ userId: user.referredBy });
        if (l1) { l1.balance += earned * 0.10; l1.refRewardsEarned += earned * 0.10; await l1.save(); }
      }
      if (user.level2Upline) {
        const l2 = await User.findOne({ userId: user.level2Upline });
        if (l2) { l2.balance += earned * 0.04; l2.refRewardsEarned += earned * 0.04; await l2.save(); }
      }

      return res.json({ success: true, message: "Level Complete!", earned, newBalance: user.balance, newLevel: user.level });
    } else {
      user.livesLeft = Math.max(0, user.livesLeft - 1);
      await user.save();
      return res.json({ success: false, message: "Wrong Match!" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Task Complete Endpoint (Fixing task reward point generation)
app.post('/api/complete-task', async (req, res) => {
  try {
    const { userId, taskId, reward } = req.body;
    const user = await User.findOne({ userId: String(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.completedTasks.includes(taskId)) {
      user.completedTasks.push(taskId);
      user.balance += Number(reward) || 50;
      await user.save();
      return res.json({ success: true, newBalance: user.balance, completedTasks: user.completedTasks });
    }
    res.json({ success: false, message: "Task already completed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Referral Stats
app.get('/api/referrals/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: String(req.params.userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({
      success: true,
      l1Count: user.referralCountL1 || 0,
      l2Count: user.referralCountL2 || 0,
      totalEarned: (user.refRewardsEarned || 0).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bind Wallets & Confirm TON
app.post('/api/bind-wallet', async (req, res) => {
  try {
    const { userId, tonAddress, piAddress } = req.body;
    const user = await User.findOne({ userId: String(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (tonAddress) user.tonWalletAddress = tonAddress;
    if (piAddress) user.piWalletAddress = piAddress;
    await user.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/confirm-ton-payment', async (req, res) => {
  try {
    const { userId, tonAddress } = req.body;
    const user = await User.findOne({ userId: String(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.isVerified = true;
    user.speedMultiplier = 2.5;
    if (tonAddress) user.tonWalletAddress = tonAddress;
    await user.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

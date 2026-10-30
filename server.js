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

// यूज़र स्कीमा (100 Levels + Daily Loop + Referrals)
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
  isFrozen: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// 9 भाषाओं के लेवल वर्ड्स का बैंक (1 से 100 लेवल के लिए प्रोग्रेसिव लॉजिक)
const BASE_DICTIONARY = {
  en: ["MIND", "NODE", "COIN", "TON", "BLOCK", "PROOF", "CHAIN", "SMART", "CRYPTO", "TOKEN", "FUTURE", "SECURE", "DECENTRAL", "CONSENSUS", "VALIDATOR", "BLOCKCHAIN", "ALGORITHM"],
  hi: ["मन", "ज्ञान", "सत्य", "शक्ति", "चेतना", "प्रकाश", "विचार", "बुद्धि", "तंत्र", "क्रांति", "संस्कार", "दूरदर्शी", "संकल्प", "आत्मज्ञान"],
  vi: ["TÂM", "MẠNG", "KHỐI", "XÍCH", "ĐỒNG", "TRÍ", "TIỀN", "TƯƠNG", "MINH", "THỰC", "TRÍTUỆ", "PHI TẬP"],
  id: ["AKAL", "NODE", "KOIN", "BLOK", "PIKIR", "RANTAI", "PINTAR", "KRIPTO", "JARING", "MASA", "CERDAS"],
  zh: ["心灵", "节点", "代币", "区块", "公链", "密码", "智能", "未来", "共识", "去中心", "验证者", "区块链"],
  bn: ["মন", "জ্ঞান", "সত্য", "শক্তি", "চেতনা", "আলো", "চিন্তা", "বুদ্ধি", "নেটওয়ার্ক", "ভবিষ্যত"],
  ar: ["عقل", "نود", "كتلة", "شبكة", "عملة", "فكر", "سلسلة", "تشفير", "مستقبل", "لامركزية"],
  ru: ["УМ", "УЗЕЛ", "БЛОК", "СЕТЬ", "ЦЕПЬ", "МОЗГ", "ТОКЕН", "РАЗУМ", "КРИПТО", "БУДУЩЕЕ"],
  es: ["MENTE", "NODO", "BLOQUE", "CADENA", "FUTURO", "TOKEN", "SEGURA", "CRIPTOMEDA"]
};

// 100 लेवल के बाद का "Daily Mind Loop" (सीक्रेट वाक्य चैलेंज)
let dailyMindLoopConfig = {
  wordsPool: ["Knowledge", "Power", "Decentralized", "Human", "Mind", "Creates", "Freedom", "Network"],
  correctSentence: "Decentralized Mind Creates Freedom",
  rewardAmount: 250.0
};

const MASTER_ADMIN_KEY = "POM_LEADER_CHIEF_2026";
let isSystemPaused = false;

// 1. यूज़र ऑथेंटिकेशन और 2-लेवल रेफरल बाइंडिंग (startapp सपोर्टेड)
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username, language, refCode } = req.body;
    let user = await User.findOne({ userId });

    if (!user) {
      let l1Leader = null;
      let l2Leader = null;

      if (refCode && refCode !== userId) {
        const directUpline = await User.findOne({ userId: refCode });
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

    if (user.isBanned) {
      return res.status(403).json({ success: false, isBanned: true, message: `Access Denied: ${user.banReason || "Rule Violation"}` });
    }

    res.json({ success: true, user, receiverAddress: MASTER_TON_ADDRESS });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. लेवल का डेटा या 100 के बाद Daily Loop लाना
app.get('/api/get-game-data', async (req, res) => {
  try {
    const { userId, lang } = req.query;
    const user = await User.findOne({ userId });
    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // अगर यूज़र लेवल 100 पार कर चुका है -> Daily Mind Loop
    if (user.level > 100 || user.isDailyLoopUnlocked) {
      return res.json({
        success: true,
        mode: "DAILY_LOOP",
        level: user.level,
        words: dailyMindLoopConfig.wordsPool,
        reward: dailyMindLoopConfig.rewardAmount
      });
    }

    // 1 से 100 लेवल के लिए प्रोग्रेसिव लेटर पूल
    const wordList = BASE_DICTIONARY[currentLang];
    const targetWord = wordList[(user.level - 1) % wordList.length];

    // शब्द के अक्षरों को बिखेरना + एक्स्ट्रा अक्षर जोड़ना
    let letterPool = targetWord.split('');
    const extraChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    while (letterPool.length < Math.min(10, targetWord.length + 3)) {
      letterPool.push(extraChars[Math.floor(Math.random() * extraChars.length)]);
    }
    letterPool.sort(() => Math.random() - 0.5);

    const baseReward = 10 + (user.level * 2);

    res.json({
      success: true,
      mode: "LEVEL_GAME",
      level: user.level,
      pool: letterPool,
      reward: baseReward
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. गेम वेरिफिकेशन इंजन (लेटर या वाक्य दोनों का सत्यापन)
app.post('/api/verify-game', async (req, res) => {
  try {
    if (isSystemPaused) return res.status(503).json({ success: false, message: "System Paused" });

    const { userId, answer, lang, mode } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isBanned || user.isFrozen) return res.status(403).json({ success: false, message: "Account Restricted" });

    let isCorrect = false;
    let rewardAmount = 0;

    if (mode === "DAILY_LOOP") {
      isCorrect = answer.trim().toLowerCase() === dailyMindLoopConfig.correctSentence.trim().toLowerCase();
      rewardAmount = dailyMindLoopConfig.rewardAmount;
    } else {
      const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';
      const wordList = BASE_DICTIONARY[currentLang];
      const targetWord = wordList[(user.level - 1) % wordList.length];
      isCorrect = answer.trim().toUpperCase() === targetWord.toUpperCase();
      rewardAmount = 10 + (user.level * 2);
    }

    if (isCorrect) {
      const multiplier = user.isVerified ? 2.5 : 1.0;
      const earned = rewardAmount * multiplier;

      user.balance += earned;
      user.livesLeft = 5;

      if (mode === "LEVEL_GAME") {
        user.level += 1;
        if (user.level > 100) {
          user.isDailyLoopUnlocked = true;
        }
      }

      await user.save();

      // Level 1 Referral (10%)
      if (user.referredBy) {
        const l1 = await User.findOne({ userId: user.referredBy });
        if (l1) {
          const l1Bonus = earned * 0.10;
          l1.balance += l1Bonus;
          l1.refRewardsEarned += l1Bonus;
          await l1.save();
        }
      }

      // Level 2 Referral (4%)
      if (user.level2Upline) {
        const l2 = await User.findOne({ userId: user.level2Upline });
        if (l2) {
          const l2Bonus = earned * 0.04;
          l2.balance += l2Bonus;
          l2.refRewardsEarned += l2Bonus;
          await l2.save();
        }
      }

      return res.json({
        success: true,
        message: mode === "DAILY_LOOP" ? "Mind Loop Solved!" : "Level Complete!",
        earned: earned,
        newBalance: user.balance,
        newLevel: user.level,
        isDailyLoopUnlocked: user.isDailyLoopUnlocked
      });
    } else {
      user.livesLeft = Math.max(0, user.livesLeft - 1);
      await user.save();

      return res.json({
        success: false,
        message: "Wrong Match! Try again.",
        livesLeft: user.livesLeft
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. TON और Pi वॉलेट बाइंडिंग
app.post('/api/bind-wallet', async (req, res) => {
  try {
    const { userId, tonAddress, piAddress } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (tonAddress) user.tonWalletAddress = tonAddress;
    if (piAddress) user.piWalletAddress = piAddress;

    await user.save();
    res.json({ success: true, message: "Wallet bound", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. 0.1 TON पेमेंट कन्फर्मेशन
app.post('/api/confirm-ton-payment', async (req, res) => {
  try {
    const { userId, tonAddress } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.isVerified = true;
    user.speedMultiplier = 2.5;
    if (tonAddress) user.tonWalletAddress = tonAddress;
    await user.save();

    res.json({ success: true, isVerified: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. रेफरल आँकड़े
app.get('/api/referrals/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PoM Server on port ${PORT}`));

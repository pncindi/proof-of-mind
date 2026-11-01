const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// Database & Admin Setup
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pncindi:pnc_password@cluster0.mongodb.net/proof-of-mind?retryWrites=true&w=majority";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pnc_admin_123";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB Error:", err));

// Schemas
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  language: { type: String, default: 'en' },
  level: { type: Number, default: 1 }, 
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  walletAddress: { type: String, default: "" },
  referredBy: { type: String, default: null },
  level2Upline: { type: String, default: null },
  referralCountL1: { type: Number, default: 0 },
  referralCountL2: { type: Number, default: 0 },
  refRewardsEarned: { type: Number, default: 0 },
  completedTasks: { type: [String], default: [] },
  hearts: { type: Number, default: 5 },
  hardMode: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const AdminDataSchema = new mongoose.Schema({
    level: { type: Number, required: true },
    lang: { type: String, required: true },
    targetWord: { type: String, required: true },
    hint: { type: String, default: "" }
});
const AdminData = mongoose.model('AdminData', AdminDataSchema);

const BASE_DICTIONARY = {
  en: ["TON", "MIND", "COIN", "NODE", "PROOF", "BLOCK", "SMART", "TOKEN", "CRYPTO", "FUTURE", "SECURE", "NETWORK"],
  hi: ["मन", "धन", "टन", "ज्ञान", "सत्य", "शक्ति", "चेतना", "प्रकाश", "विचार", "बुद्धि", "तंत्र", "क्रांति"],
  vi: ["TÂM", "KHỐI", "ĐỒNG", "TRÍ", "TIỀN", "MINH", "THỰC", "MẠNG", "XÍCH"],
  id: ["AKAL", "NODE", "KOIN", "BLOK", "PIKIR", "RANTAI", "PINTAR", "KRIPTO"],
  zh: ["心灵", "节点", "代币", "区块", "密码", "智能", "未来", "公链"],
  bn: ["মন", "জ্ঞান", "সত্য", "শক্তি", "চেतना", "আলো", "চিন্তা", "বুদ্ধি"],
  ar: ["عقل", "نود", "كتلة", "شبكة", "عملة", "فكر", "سلسلة", "تشفير"],
  ru: ["УМ", "УЗЕЛ", "БЛОК", "СЕТЬ", "ЦЕПЬ", "МОЗГ", "ТОКЕН", "РАЗУМ"],
  es: ["MENTE", "NODO", "BLOQUE", "CADENA", "FUTURO", "TOKEN", "SEGURA"]
};

// 1. GAME & AUTH APIs
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username, language, refCode } = req.body;
    let user = await User.findOne({ userId });

    if (!user) {
      let l1Leader = null, l2Leader = null;
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
      user = new User({ userId, platform: platform || 'TELEGRAM', username, language: language || 'en', referredBy: l1Leader, level2Upline: l2Leader });
      await user.save();
    }
    res.json({ success: true, user });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/get-game-data', async (req, res) => {
  try {
    const { userId, lang } = req.query;
    const user = await User.findOne({ userId });
    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';

    if (!user) return res.status(404).json({ success: false });
    if (user.hearts <= 0) return res.json({ success: false, message: "No hearts left. Watch Ad.", hearts: 0 });

    let targetWord = "";
    let hint = "";
    const adminData = await AdminData.findOne({ level: user.level, lang: currentLang });
    
    if (adminData) {
        targetWord = adminData.targetWord;
        hint = adminData.hint;
    } else {
        const wordList = BASE_DICTIONARY[currentLang];
        targetWord = wordList[(user.level - 1) % wordList.length];
    }

    let totalChips = 5 + Math.floor((user.level - 1) / 10); 
    let letterPool = targetWord.split('');
    const extraChars = currentLang === 'hi' ? "अआइईउऊएऐओऔकखगघचछजझटठडढतथदधनपफबभमयरलवशषसह" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    while (letterPool.length < Math.max(totalChips, targetWord.length)) {
      letterPool.push(extraChars[Math.floor(Math.random() * extraChars.length)]);
    }
    letterPool.sort(() => Math.random() - 0.5);

    res.json({ success: true, level: user.level, hearts: user.hearts, target: targetWord, pool: letterPool, hint: hint, reward: 10 + (user.level * 2) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/verify-game', async (req, res) => {
  try {
    const { userId, answer, targetWord } = req.body;
    const user = await User.findOne({ userId });
    
    if (!user || user.hearts <= 0) return res.json({ success: false, message: "No hearts left." });

    if (answer.trim().toUpperCase() === targetWord.toUpperCase()) {
      const multiplier = user.isVerified ? 2.5 : 1.0;
      const earned = (10 + (user.level * 2)) * multiplier;

      user.balance += earned;
      user.level += 1;
      if (user.level > 100) { user.hardMode = true; }
      await user.save();

      if (user.referredBy) {
        const l1 = await User.findOne({ userId: user.referredBy });
        if (l1) { l1.balance += earned * 0.10; l1.refRewardsEarned += earned * 0.10; await l1.save(); }
      }
      if (user.level2Upline) {
        const l2 = await User.findOne({ userId: user.level2Upline });
        if (l2) { l2.balance += earned * 0.04; l2.refRewardsEarned += earned * 0.04; await l2.save(); }
      }
      res.json({ success: true, earned, newBalance: user.balance, newLevel: user.level, hearts: user.hearts });
    } else {
      user.hearts = Math.max(0, user.hearts - 1);
      await user.save();
      res.json({ success: false, message: "Wrong Answer!", hearts: user.hearts });
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 2. ADS & WALLET APIs
app.get('/api/ad-webhook', async (req, res) => {
    try {
        await User.findOneAndUpdate({ userId: req.query.userid }, { hearts: 5 });
        res.status(200).send("Success"); 
    } catch (err) { res.status(500).send("Server Error"); }
});

app.post('/api/bind-wallet', async (req, res) => {
  try {
    await User.findOneAndUpdate({ userId: req.body.userId }, { walletAddress: req.body.address });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/confirm-payment', async (req, res) => {
  try {
    await User.findOneAndUpdate({ userId: req.body.userId }, { isVerified: true });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 3. ADMIN APIs
app.post('/api/admin/stats', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: "Unauthorized" });
        const totalUsers = await User.countDocuments();
        const verifiedUsers = await User.countDocuments({ isVerified: true });
        const result = await User.aggregate([{ $group: { _id: null, totalMined: { $sum: "$balance" } } }]);
        const totalMined = result.length > 0 ? result[0].totalMined : 0;
        const topLeaders = await User.find().sort({ referralCountL1: -1 }).limit(10).select('username userId platform referralCountL1 balance');
        res.json({ success: true, totalUsers, verifiedUsers, totalMined, topLeaders });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/set-hint', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: "Unauthorized" });
        await AdminData.findOneAndUpdate({ level: req.body.level, lang: req.body.lang }, { targetWord: req.body.targetWord, hint: req.body.hint }, { upsert: true, new: true });
        res.json({ success: true, message: "Saved successfully." });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PoM Server on port ${PORT}`));

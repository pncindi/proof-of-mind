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

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  language: { type: String, default: 'en' },
  level: { type: Number, default: 1 }, // Max Level 100
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  tonWalletAddress: { type: String, default: "" },
  referredBy: { type: String, default: null },
  level2Upline: { type: String, default: null },
  referralCountL1: { type: Number, default: 0 },
  referralCountL2: { type: Number, default: 0 },
  refRewardsEarned: { type: Number, default: 0 },
  completedTasks: { type: [String], default: [] }
});

const User = mongoose.model('User', UserSchema);

// छोटे शब्दों से शुरुआत ताकि 5 अक्षरों में फिट हो सकें
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
      user = new User({ userId, platform, username, language: language || 'en', referredBy: l1Leader, level2Upline: l2Leader });
      await user.save();
    }
    res.json({ success: true, user });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// गेम डिफिकल्टी लॉजिक (5 अक्षर से शुरू)
app.get('/api/get-game-data', async (req, res) => {
  try {
    const { userId, lang } = req.query;
    const user = await User.findOne({ userId });
    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';

    if (!user) return res.status(404).json({ success: false });

    const wordList = BASE_DICTIONARY[currentLang];
    const targetWord = wordList[(user.level - 1) % wordList.length];

    // लेवल 1-10 (5 अक्षर), 11-20 (6 अक्षर)...
    let totalChips = 5 + Math.floor((user.level - 1) / 10); 
    
    let letterPool = targetWord.split('');
    const extraChars = currentLang === 'hi' ? "अआइईउऊएऐओऔकखगघचछजझटठडढतथदधनपफबभमयरलवशषसह" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    while (letterPool.length < Math.max(totalChips, targetWord.length)) {
      letterPool.push(extraChars[Math.floor(Math.random() * extraChars.length)]);
    }
    letterPool.sort(() => Math.random() - 0.5);

    res.json({ success: true, level: user.level, target: targetWord, pool: letterPool, reward: 10 + (user.level * 2) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/verify-game', async (req, res) => {
  try {
    const { userId, answer, lang } = req.body;
    const user = await User.findOne({ userId });
    const currentLang = BASE_DICTIONARY[lang] ? lang : 'en';
    const wordList = BASE_DICTIONARY[currentLang];
    const targetWord = wordList[(user.level - 1) % wordList.length];

    if (answer.trim().toUpperCase() === targetWord.toUpperCase()) {
      const multiplier = user.isVerified ? 2.5 : 1.0;
      const earned = (10 + (user.level * 2)) * multiplier;

      user.balance += earned;
      user.level += 1;
      await user.save();

      if (user.referredBy) {
        const l1 = await User.findOne({ userId: user.referredBy });
        if (l1) { l1.balance += earned * 0.10; l1.refRewardsEarned += earned * 0.10; await l1.save(); }
      }
      if (user.level2Upline) {
        const l2 = await User.findOne({ userId: user.level2Upline });
        if (l2) { l2.balance += earned * 0.04; l2.refRewardsEarned += earned * 0.04; await l2.save(); }
      }
      res.json({ success: true, earned, newBalance: user.balance, newLevel: user.level });
    } else {
      res.json({ success: false, message: "Wrong Answer!" });
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/complete-task', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    const user = await User.findOne({ userId });
    if (user.completedTasks.includes(taskId)) return res.json({ success: false, message: "Task already done!" });
    user.completedTasks.push(taskId);
    user.balance += 100;
    await user.save();
    res.json({ success: true, newBalance: user.balance, completedTasks: user.completedTasks });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/referrals/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    res.json({ success: true, l1Count: user.referralCountL1 || 0, l2Count: user.referralCountL2 || 0, totalEarned: (user.refRewardsEarned || 0).toFixed(2) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Wallet Binding API
app.post('/api/bind-wallet', async (req, res) => {
  try {
    const { userId, tonAddress } = req.body;
    const user = await User.findOne({ userId });
    user.tonWalletAddress = tonAddress;
    await user.save();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// TON Payment Confirmation
app.post('/api/confirm-ton-payment', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findOne({ userId });
    user.isVerified = true;
    await user.save();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PoM Server on port ${PORT}`));

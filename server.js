const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB कनेक्शन
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pncindi:YOUR_PASSWORD@cluster0.mongodb.net/proof-of-mind?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB कनेक्ट हो गया"))
  .catch(err => console.error("MongoDB एरर:", err));

// यूज़र स्कीमा (Anti-Cheat & Freeze/Ban फ़ील्ड्स के साथ)
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  livesLeft: { type: Number, default: 5 },
  speedMultiplier: { type: Number, default: 1.0 },
  isFrozen: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ग्लोबल चैलेंज और सिस्टम सेटिंग्स
let currentChallenge = {
  date: new Date().toISOString().slice(0, 10),
  targetWords: ["Knowledge", "Power", "Decentralized", "Human", "Mind", "Creates", "Freedom", "Network"],
  correctSentence: "Decentralized Mind Creates Freedom",
  rewardAmount: 25.0,
  bonusMultiplierForVerified: 2.5,
  isSystemPaused: false // Emergency Circuit Breaker
};

const MASTER_ADMIN_KEY = "POM_LEADER_CHIEF_2026";

// 1. यूज़र ऑथेंटिकेशन / रजिस्ट्रेशन
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username } = req.body;
    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({ userId, platform, username });
      await user.save();
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, isBanned: true, message: `आपका अकाउंट ब्लॉक कर दिया गया है। कारण: ${user.banReason || "नियमों का उल्लंघन"}` });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. आज के शब्द प्राप्त करना
app.get('/api/daily-words', (req, res) => {
  if (currentChallenge.isSystemPaused) {
    return res.status(503).json({ success: false, message: "माइनिंग सिस्टम मेंटेनेंस के लिए अस्थायी रूप से बंद है।" });
  }
  res.json({ success: true, words: currentChallenge.targetWords });
});

// 3. वाक्य वेरीफाई और टोकन माइनिंग इंजन
app.post('/api/verify-sentence', async (req, res) => {
  try {
    if (currentChallenge.isSystemPaused) {
      return res.status(503).json({ success: false, message: "सिस्टम अस्थायी रूप से पॉज़ है।" });
    }

    const { userId, sentence } = req.body;
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ success: false, message: "यूज़र नहीं मिला" });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: "आपका अकाउंट परमानेंट बैन है।" });
    }

    if (user.isFrozen) {
      return res.status(403).json({ success: false, message: "संदिग्ध गतिविधि के कारण आपका अकाउंट फ़्रीज़ है।" });
    }

    const cleanSubmitted = sentence.trim().toLowerCase();
    const cleanTarget = currentChallenge.correctSentence.trim().toLowerCase();

    if (cleanSubmitted === cleanTarget) {
      const multiplier = user.isVerified ? currentChallenge.bonusMultiplierForVerified : 1.0;
      const earned = currentChallenge.rewardAmount * multiplier;

      user.balance += earned;
      user.livesLeft = 5;
      await user.save();

      return res.json({
        success: true,
        message: "माइंड नोड सिंक हो गया! सही वाक्य!",
        earned: earned,
        newBalance: user.balance
      });
    } else {
      user.livesLeft = Math.max(0, user.livesLeft - 1);
      await user.save();

      return res.json({
        success: false,
        message: "गलत वाक्य! दोबारा प्रयास करें।",
        livesLeft: user.livesLeft
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= ADMIN CONTROLS =================

// एडमिन चैलेंज अपडेट
app.post('/api/admin/set-challenge', (req, res) => {
  const { adminKey, targetWords, correctSentence, rewardAmount } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "गलत पासवर्ड!" });

  if (targetWords && Array.isArray(targetWords)) currentChallenge.targetWords = targetWords;
  if (correctSentence) currentChallenge.correctSentence = correctSentence;
  if (rewardAmount) currentChallenge.rewardAmount = rewardAmount;

  res.json({ success: true, message: "नया चैलेंज सेव हो गया!", data: currentChallenge });
});

// यूज़र इन्स्पेक्शन (ID से डेटा चेक करना)
app.post('/api/admin/user-details', async (req, res) => {
  const { adminKey, targetUserId } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  const user = await User.findOne({ userId: targetUserId });
  if (!user) return res.status(404).json({ success: false, message: "यूज़र नहीं मिला" });

  res.json({ success: true, user });
});

// यूज़र एक्शन (Ban, Freeze, Slash Tokens, Unban)
app.post('/api/admin/user-action', async (req, res) => {
  const { adminKey, targetUserId, action, value, reason } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  const user = await User.findOne({ userId: targetUserId });
  if (!user) return res.status(404).json({ success: false, message: "यूज़र नहीं मिला" });

  if (action === "FREEZE") {
    user.isFrozen = true;
  } else if (action === "UNFREEZE") {
    user.isFrozen = false;
  } else if (action === "BAN") {
    user.isBanned = true;
    user.banReason = reason || "चीटिंग / दुर्भावनापूर्ण गतिविधि";
  } else if (action === "UNBAN") {
    user.isBanned = false;
    user.banReason = "";
  } else if (action === "SLASH_BALANCE") {
    // अगर टोकन 0 करने हों या कोई विशेष राशि घटानी हो
    user.balance = Math.max(0, value !== undefined ? Number(value) : 0);
  }

  await user.save();
  res.json({ success: true, message: `यूज़र पर एक्शन '${action}' लागू कर दिया गया है।`, user });
});

// इमरजेंसी ग्लोबल पॉज़ स्विच
app.post('/api/admin/toggle-pause', (req, res) => {
  const { adminKey } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  currentChallenge.isSystemPaused = !currentChallenge.isSystemPaused;
  res.json({ success: true, isPaused: currentChallenge.isSystemPaused, message: `सिस्टम पॉज़ स्टेटस: ${currentChallenge.isSystemPaused}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proof of Mind सर्वर पोर्ट ${PORT} पर चालू है`);
});

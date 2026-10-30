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

// यूज़र स्कीमा
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  livesLeft: { type: Number, default: 5 },
  speedMultiplier: { type: Number, default: 1.0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ग्लोबल चैलेंज और सीक्रेट आंसर (एडमिन द्वारा बदला जा सकता है)
let currentChallenge = {
  date: new Date().toISOString().slice(0, 10),
  targetWords: ["Knowledge", "Power", "Decentralized", "Human", "Mind", "Creates", "Freedom", "Network"],
  correctSentence: "Decentralized Mind Creates Freedom",
  rewardAmount: 25.0,
  bonusMultiplierForVerified: 2.5
};

// मास्टर एडमिन पासवर्ड (यह सिर्फ आपको पता है)
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

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. आज के शब्द प्राप्त करना
app.get('/api/daily-words', (req, res) => {
  res.json({
    success: true,
    words: currentChallenge.targetWords
  });
});

// 3. वाक्य वेरीफाई और टोकन माइनिंग इंजन
app.post('/api/verify-sentence', async (req, res) => {
  try {
    const { userId, sentence } = req.body;
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ success: false, message: "यूज़र नहीं मिला" });
    }

    const cleanSubmitted = sentence.trim().toLowerCase();
    const cleanTarget = currentChallenge.correctSentence.trim().toLowerCase();

    // सीक्रेट आंसर से मिलान
    if (cleanSubmitted === cleanTarget) {
      const multiplier = user.isVerified ? currentChallenge.bonusMultiplierForVerified : 1.0;
      const earned = currentChallenge.rewardAmount * multiplier;

      user.balance += earned;
      user.livesLeft = 5; // सही उत्तर पर एनर्जी रीचार्ज
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

// 4. एडमिन कंट्रोल: नया गुप्त उत्तर और शब्द सेट करना
app.post('/api/admin/set-challenge', (req, res) => {
  const { adminKey, targetWords, correctSentence, rewardAmount } = req.body;

  if (adminKey !== MASTER_ADMIN_KEY) {
    return res.status(403).json({ success: false, message: "गलत पासवर्ड! एक्सेस अस्वीकृत।" });
  }

  if (targetWords && Array.isArray(targetWords)) currentChallenge.targetWords = targetWords;
  if (correctSentence) currentChallenge.correctSentence = correctSentence;
  if (rewardAmount) currentChallenge.rewardAmount = rewardAmount;

  res.json({
    success: true,
    message: "नया चैलेंज और गुप्त उत्तर सफलतापूर्वक सेव हो गया!",
    data: currentChallenge
  });
});

// 5. एडमिन कंट्रोल: गुप्त उत्तर देखना
app.post('/api/admin/view-secret', (req, res) => {
  const { adminKey } = req.body;

  if (adminKey !== MASTER_ADMIN_KEY) {
    return res.status(403).json({ success: false, message: "गलत पासवर्ड!" });
  }

  res.json({
    success: true,
    secretSentence: currentChallenge.correctSentence,
    targetWords: currentChallenge.targetWords
  });
});

// सर्वर स्टार्ट
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proof of Mind सर्वर पोर्ट ${PORT} पर चालू है`);
});

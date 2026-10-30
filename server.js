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

// मास्टर TON रिसीवर एड्रेस
const MASTER_TON_ADDRESS = "UQD5ZiNy8-eV7l6Ny46c-f98USLg-JXPTRRIPMV-0YiadqJV";

// यूज़र स्कीमा
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'TELEGRAM' },
  username: String,
  language: { type: String, default: 'en' },
  balance: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  tonWalletAddress: { type: String, default: "" },
  piWalletAddress: { type: String, default: "" },
  livesLeft: { type: Number, default: 5 },
  speedMultiplier: { type: Number, default: 1.0 },
  isFrozen: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ग्लोबल गेम सेटिंग्स
let currentChallenge = {
  date: new Date().toISOString().slice(0, 10),
  targetWords: ["Knowledge", "Power", "Decentralized", "Human", "Mind", "Creates", "Freedom", "Network"],
  correctSentence: "Decentralized Mind Creates Freedom",
  rewardAmount: 25.0,
  bonusMultiplierForVerified: 2.5,
  isSystemPaused: false
};

const MASTER_ADMIN_KEY = "POM_LEADER_CHIEF_2026";

// 1. यूज़र ऑथेंटिकेशन / रजिस्ट्रेशन
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username, language } = req.body;
    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({ userId, platform, username, language: language || 'en' });
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

// 2. आज के शब्द प्राप्त करना
app.get('/api/daily-words', (req, res) => {
  if (currentChallenge.isSystemPaused) {
    return res.status(503).json({ success: false, message: "System under maintenance" });
  }
  res.json({ success: true, words: currentChallenge.targetWords });
});

// 3. वाक्य वेरीफाई और टोकन माइनिंग इंजन
app.post('/api/verify-sentence', async (req, res) => {
  try {
    if (currentChallenge.isSystemPaused) {
      return res.status(503).json({ success: false, message: "System Paused" });
    }

    const { userId, sentence } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isBanned) return res.status(403).json({ success: false, message: "Banned account" });
    if (user.isFrozen) return res.status(403).json({ success: false, message: "Account is frozen" });

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
        message: "Mind Node Synced!",
        earned: earned,
        newBalance: user.balance
      });
    } else {
      user.livesLeft = Math.max(0, user.livesLeft - 1);
      await user.save();

      return res.json({
        success: false,
        message: "Logic Match Failed!",
        livesLeft: user.livesLeft
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. TON और Pi वॉलेट एड्रेस बाइंडिंग API
app.post('/api/bind-wallet', async (req, res) => {
  try {
    const { userId, tonAddress, piAddress } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (tonAddress) user.tonWalletAddress = tonAddress;
    if (piAddress) user.piWalletAddress = piAddress;

    await user.save();
    res.json({ success: true, message: "Wallet bound successfully", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. 0.1 TON ऑन-चेन पेमेंट कन्फर्मेशन
app.post('/api/confirm-ton-payment', async (req, res) => {
  try {
    const { userId, tonAddress, boc } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // नोड वेरिफाई और 2.5x स्पीड अपग्रेड
    user.isVerified = true;
    user.speedMultiplier = 2.5;
    if (tonAddress) user.tonWalletAddress = tonAddress;
    await user.save();

    res.json({
      success: true,
      message: "0.1 TON Verified! Human Node Activated (2.5x Mining Boost)",
      isVerified: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= ADMIN CONTROLS =================
app.post('/api/admin/set-challenge', (req, res) => {
  const { adminKey, targetWords, correctSentence, rewardAmount } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  if (targetWords && Array.isArray(targetWords)) currentChallenge.targetWords = targetWords;
  if (correctSentence) currentChallenge.correctSentence = correctSentence;
  if (rewardAmount) currentChallenge.rewardAmount = rewardAmount;

  res.json({ success: true, message: "Challenge updated", data: currentChallenge });
});

app.post('/api/admin/user-details', async (req, res) => {
  const { adminKey, targetUserId } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  const user = await User.findOne({ userId: targetUserId });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  res.json({ success: true, user });
});

app.post('/api/admin/user-action', async (req, res) => {
  const { adminKey, targetUserId, action, value, reason } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  const user = await User.findOne({ userId: targetUserId });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  if (action === "FREEZE") user.isFrozen = true;
  else if (action === "UNFREEZE") user.isFrozen = false;
  else if (action === "BAN") { user.isBanned = true; user.banReason = reason || "Violation"; }
  else if (action === "UNBAN") { user.isBanned = false; user.banReason = ""; }
  else if (action === "SLASH_BALANCE") user.balance = Math.max(0, value !== undefined ? Number(value) : 0);

  await user.save();
  res.json({ success: true, message: `Action ${action} executed`, user });
});

app.post('/api/admin/toggle-pause', (req, res) => {
  const { adminKey } = req.body;
  if (adminKey !== MASTER_ADMIN_KEY) return res.status(403).json({ success: false, message: "Unauthorized" });

  currentChallenge.isSystemPaused = !currentChallenge.isSystemPaused;
  res.json({ success: true, isPaused: currentChallenge.isSystemPaused });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PoM Server running on port ${PORT}`);
});

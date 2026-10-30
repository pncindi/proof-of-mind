const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pncindi:YOUR_PASSWORD@cluster0.mongodb.net/proof-of-mind?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB कनेक्ट हो गया"))
  .catch(err => console.error("MongoDB एरर:", err));

const MASTER_TON_ADDRESS = "UQD5ZiNy8-eV7l6Ny46c-f98USLg-JXPTRRIPMV-0YiadqJV";

// यूज़र स्कीमा: रेफरल आर्किटेक्चर के साथ
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
  referredBy: { type: String, default: null }, // Level 1 Leader
  level2Upline: { type: String, default: null }, // Level 2 Leader
  referralCountL1: { type: Number, default: 0 },
  referralCountL2: { type: Number, default: 0 },
  refRewardsEarned: { type: Number, default: 0 },
  isFrozen: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

let currentChallenge = {
  date: new Date().toISOString().slice(0, 10),
  targetWords: ["Knowledge", "Power", "Decentralized", "Human", "Mind", "Creates", "Freedom", "Network"],
  correctSentence: "Decentralized Mind Creates Freedom",
  rewardAmount: 25.0,
  bonusMultiplierForVerified: 2.5,
  isSystemPaused: false
};

const MASTER_ADMIN_KEY = "POM_LEADER_CHIEF_2026";

// 1. यूज़र ऑथेंटिकेशन और रेफरल बाइंडिंग इंजन
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username, language, refCode } = req.body;
    let user = await User.findOne({ userId });

    if (!user) {
      let l1Leader = null;
      let l2Leader = null;

      // अगर यूज़र रेफरल लिंक से आया है
      if (refCode && refCode !== userId) {
        const directUpline = await User.findOne({ userId: refCode });
        if (directUpline) {
          l1Leader = directUpline.userId;
          directUpline.referralCountL1 += 1;
          await directUpline.save();

          // Level 2 अपलाइन सेट करना
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

// 2. माइनिंग और मल्टी-लेवल रेफरल कमीशन (L1: 10%, L2: 4%)
app.post('/api/verify-sentence', async (req, res) => {
  try {
    if (currentChallenge.isSystemPaused) {
      return res.status(503).json({ success: false, message: "System Paused" });
    }

    const { userId, sentence } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isBanned || user.isFrozen) return res.status(403).json({ success: false, message: "Account Restricted" });

    const cleanSubmitted = sentence.trim().toLowerCase();
    const cleanTarget = currentChallenge.correctSentence.trim().toLowerCase();

    if (cleanSubmitted === cleanTarget) {
      const multiplier = user.isVerified ? currentChallenge.bonusMultiplierForVerified : 1.0;
      const earned = currentChallenge.rewardAmount * multiplier;

      user.balance += earned;
      user.livesLeft = 5;
      await user.save();

      // Level 1 रेफरल बोनस (10%)
      if (user.referredBy) {
        const l1 = await User.findOne({ userId: user.referredBy });
        if (l1) {
          const l1Bonus = earned * 0.10;
          l1.balance += l1Bonus;
          l1.refRewardsEarned += l1Bonus;
          await l1.save();
        }
      }

      // Level 2 रेफरल बोनस (4%)
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

// 3. वॉलेट बाइंडिंग API
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

// 4. 0.1 TON पेमेंट कन्फर्मेशन और नोड अपग्रेड
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

// 5. रेफरल स्टेटिस्टिक्स API
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

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// आपकी मास्टर जेनेसिस आईडी (Root Node)
// ==========================================
const GENESIS_ROOT_ID = process.env.GENESIS_ROOT_ID || "GENESIS_MASTER";

// MongoDB डेटाबेस कनेक्शन
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB से कनेक्ट हो गया!"))
  .catch(err => console.error("डेटाबेस कनेक्शन एरर:", err));

// ==========================================
// यूज़र डेटाबेस स्कीमा
// ==========================================
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Telegram ID या Pi UID
  platform: { type: String, enum: ['TELEGRAM', 'PI'], required: true },
  username: { type: String, default: '' },
  
  // जेनेसिस और रेफरल ट्री
  isGenesis: { type: Boolean, default: false },
  referredBy: { type: String, default: GENESIS_ROOT_ID },
  directReferralsCount: { type: Number, default: 0 },
  
  // माइनिंग और पॉइंट्स
  balance: { type: Number, default: 0 },
  speedMultiplier: { type: Number, default: 1.0 },
  livesLeft: { type: Number, default: 5 },
  
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ==========================================
// API 1: यूज़र लॉगिन / ऑटो-रेजिस्ट्रेशन
// ==========================================
app.post('/api/auth', async (req, res) => {
  try {
    const { userId, platform, username, referralCode } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({ error: "userId और platform अनिवार्य हैं" });
    }

    let user = await User.findOne({ userId });

    // अगर नया यूज़र है
    if (!user) {
      let finalSponsor = GENESIS_ROOT_ID;

      // अगर किसी के लिंक से आया है तो स्पॉन्सर ढूंढो
      if (referralCode && referralCode !== userId) {
        const sponsorExists = await User.findOne({ userId: referralCode });
        if (sponsorExists) {
          finalSponsor = referralCode;
          await User.updateOne({ userId: referralCode }, { $inc: { directReferralsCount: 1 } });
        }
      }

      // अगर खुद मास्टर आईडी रजिस्टर हो रही है
      const isMaster = (userId === GENESIS_ROOT_ID);

      user = new User({
        userId,
        platform,
        username: username || '',
        isGenesis: isMaster,
        referredBy: isMaster ? null : finalSponsor,
        balance: isMaster ? 1000 : 50 // मास्टर को इनिशियल ग्रांट
      });

      await user.save();
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API 2: सीक्रेट ग्रामर / शब्द-युद्ध वैलिडेटर
// ==========================================
app.post('/api/verify-sentence', async (req, res) => {
  try {
    const { userId, sentence, targetWords } = req.body;
    const user = await User.findOne({ userId });

    if (!user) return res.status(404).json({ error: "यूज़र नहीं मिला" });
    if (user.livesLeft <= 0) {
      return res.status(400).json({ error: "चांस खत्म हो चुके हैं! ऐड देखकर रीचार्ज करें।" });
    }

    const cleanWords = sentence.trim().split(/\s+/);
    
    // बेसिक वैलिडेशन: कम से कम दिए गए शब्दों में से 3 होने चाहिए
    const matchedWords = targetWords.filter(w => sentence.toLowerCase().includes(w.toLowerCase()));
    const isValid = (matchedWords.length >= 3 && cleanWords.length >= 4);

    if (isValid) {
      const rewardPoints = cleanWords.length * 10;
      user.balance += rewardPoints;
      user.speedMultiplier = 2.0; // स्पीड डबल
      await user.save();
      return res.json({ success: true, message: "शानदार वाक्य!", earned: rewardPoints, newBalance: user.balance });
    } else {
      user.livesLeft -= 1;
      await user.save();
      return res.json({ success: false, message: "गलत वाक्य! चांस कटे।", livesLeft: user.livesLeft });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// सर्वर स्टार्ट
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proof of Mind सर्वर पोर्ट ${PORT} पर चालू है`);
});

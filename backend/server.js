const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const gamificationRoutes = require('./routes/gamification');
app.use('/api/v1/gamification', gamificationRoutes);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/code-guru";
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gamification Backend running on port ${PORT}`));

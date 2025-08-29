const mongoose = require('mongoose');
const ScoreSchema = require('./schemas/scoreSchema');

// Check if model already exists to prevent recompilation
const Score = mongoose.models.Score || mongoose.model('Score', ScoreSchema);

module.exports = Score;



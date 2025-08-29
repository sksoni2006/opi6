const mongoose = require('mongoose');

// Stock holding with entry price and transaction details
const HoldingSchema = new mongoose.Schema({
    entry: { type: Number, required: true },
    acquiredAt: { type: Date, default: Date.now },
    sellerId: { type: String },
    transactionId: { type: String },
    stockPnL: { type: Number, default: 0 }
}, { _id: false });

const ScoreSchema = new mongoose.Schema({
    poolId: { type: String, required: true },
    playerId: { type: String, required: true }, // Add playerId field
    roundNumber: { type: Number, required: true },
    boxes: { type: [Number], default: Array(6).fill(null) },
    revealedBoxes: { type: [Number], default: [] },
    currentBox: { type: Number, default: 0 },
    phase: { type: String, enum: ['sell', 'buy', 'reveal', 'complete'], default: 'sell' },
    holdings: [HoldingSchema],
    pnl: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 1000 },
    initialBalance: { type: Number, default: 1000 }
}, { timestamps: true });

// Create compound index for unique player scores per pool and round
ScoreSchema.index({ poolId: 1, playerId: 1, roundNumber: 1 }, { unique: true });

module.exports = ScoreSchema;
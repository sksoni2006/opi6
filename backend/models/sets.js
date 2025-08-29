const mongoose = require('mongoose');

const NumbersConfigSchema = new mongoose.Schema({
	from: { type: Number, required: true },
	to: { type: Number, required: true },
	unique: { type: Boolean, required: true }
}, { _id: false });

const SetSchema = new mongoose.Schema({
	// Pool identifier containing 4 players (e.g., "Team1A Team1B Team1C Team1D")
	poolId: { type: String, required: true, index: true },
	// Round index as per frontend ROUND_CONFIG keys
	roundNumber: { type: Number, required: true, index: true },
	numbers: { type: NumbersConfigSchema, required: true },
	showAllPnL: { type: Boolean, default: false },
	maxStocks: { type: Number, default: 2 },
	// Pre-generated sequence of numbers for this round
	sequence: { type: [Number], default: [] },
	// Revealed numbers progression
	revealed: { type: [Number], default: [] },
	// Status of the pool/round
	status: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting' }
}, { timestamps: true });

SetSchema.index({ poolId: 1, roundNumber: 1 }, { unique: true });

module.exports = mongoose.model('Set', SetSchema);



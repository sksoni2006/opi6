const express = require('express');
const Score = require('../models/score');
const router = express.Router();
const { cumulativePrice } = require('../utils/rounds');

// Upsert a player's score state for a round
router.post('/upsert', async (req, res) => {
	try {
		const { poolId, roundNumber, playerId, holdings, closed, currentCum, pnl, revealed } = req.body;
		if (!playerId) return res.status(400).json({ message: 'playerId required' });
		let computedCurrent = typeof currentCum === 'number' ? currentCum : cumulativePrice(revealed || []);
		let computedPnL = typeof pnl === 'number' ? pnl : undefined;
		if (computedPnL === undefined) {
			const open = (holdings || []).reduce((acc, h) => acc + (computedCurrent - (h.entry ?? 0)), 0);
			const realized = (closed || []).reduce((acc, c) => acc + (c.exitVsFinal ?? 0), 0);
			computedPnL = open + realized;
		}
		const doc = await Score.findOneAndUpdate(
			{ poolId, roundNumber, playerId },
			{ $set: { holdings, closed, currentCum: computedCurrent, pnl: computedPnL } },
			{ new: true, upsert: true }
		);
		res.json(doc);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// Fetch scores by pool/round or by player
router.get('/', async (req, res) => {
	try {
		const { poolId, roundNumber, playerId } = req.query;
		const filter = {};
		if (poolId) filter.poolId = poolId;
		if (roundNumber) filter.roundNumber = Number(roundNumber);
		if (playerId) filter.playerId = playerId;
		const docs = await Score.find(filter);
		res.json(docs);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

module.exports = router;



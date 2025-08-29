const express = require('express');
const Set = require('../models/sets');
const { ROUND_CONFIG, generateSequenceForRound } = require('../utils/rounds');
const router = express.Router();

// Create or update a round set for a pool
router.post('/', async (req, res) => {
	try {
		const { poolId, roundNumber, numbers, showAllPnL, maxStocks, sequence, revealed } = req.body;
		if (!poolId || !roundNumber || !numbers) return res.status(400).json({ message: 'poolId, roundNumber, numbers required' });
		const doc = await Set.findOneAndUpdate(
			{ poolId, roundNumber },
			{ $set: { numbers, showAllPnL, maxStocks, sequence, revealed } },
			{ new: true, upsert: true }
		);
		res.status(201).json(doc);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// Get sets by pool or all
router.get('/', async (req, res) => {
	try {
		const { poolId } = req.query;
		const filter = poolId ? { poolId } : {};
		const docs = await Set.find(filter).sort({ roundNumber: 1 });
		res.json(docs);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// Get single round for a pool
router.get('/by-round', async (req, res) => {
	try {
		const { poolId, roundNumber } = req.query;
		if (!poolId || !roundNumber) return res.status(400).json({ message: 'poolId and roundNumber required' });
		const doc = await Set.findOne({ poolId, roundNumber: Number(roundNumber) });
		if (!doc) return res.status(404).json({ message: 'Not found' });
		res.json(doc);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// Get all pools with their status
router.get('/pools', async (req, res) => {
	try {
		const pools = await Set.aggregate([
			{
				$group: {
					_id: '$poolId',
					rounds: { $push: '$$ROOT' },
					status: { $first: '$status' }
				}
			},
			{
				$project: {
					poolId: '$_id',
					rounds: 1,
					status: 1,
					playerCount: {
						$size: {
							$split: ['$_id', ' ']
						}
					}
				}
			},
			{ $sort: { poolId: 1 } }
		]);
		res.json(pools);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

module.exports = router;

// Initialize all rounds for a given pool with generated sequences
router.post('/init', async (req, res) => {
	try {
		const { poolId, sequenceLengthPerRound } = req.body;
		if (!poolId) return res.status(400).json({ message: 'poolId required' });
		const created = [];
		for (const key of Object.keys(ROUND_CONFIG)) {
			const roundNumber = Number(key);
			const cfg = ROUND_CONFIG[roundNumber];
			const length = sequenceLengthPerRound?.[key] ?? 10;
			const sequence = generateSequenceForRound(roundNumber, length);
			const doc = await Set.findOneAndUpdate(
				{ poolId, roundNumber },
				{
					$set: {
						numbers: cfg.numbers,
						showAllPnL: cfg.showAllPnL,
						maxStocks: cfg.maxStocks,
						sequence,
						status: 'waiting'
					}
				},
				{ new: true, upsert: true }
			);
			created.push(doc);
		}
		res.status(201).json(created);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// Initialize all 11 pools with all rounds
router.post('/init-all-pools', async (req, res) => {
	try {
		const { sequenceLengthPerRound } = req.body;
		const allCreated = [];
		
		// Create 11 pools: Team1, Team2, ..., Team11
		for (let teamNum = 1; teamNum <= 11; teamNum++) {
			const poolId = `Team${teamNum}A Team${teamNum}B Team${teamNum}C Team${teamNum}D`;
			const poolCreated = [];
			
			for (const key of Object.keys(ROUND_CONFIG)) {
				const roundNumber = Number(key);
				const cfg = ROUND_CONFIG[roundNumber];
				const length = sequenceLengthPerRound?.[key] ?? 10;
				const sequence = generateSequenceForRound(roundNumber, length);
				const doc = await Set.findOneAndUpdate(
					{ poolId, roundNumber },
					{
						$set: {
							numbers: cfg.numbers,
							showAllPnL: cfg.showAllPnL,
							maxStocks: cfg.maxStocks,
							sequence,
							status: 'waiting'
						}
					},
					{ new: true, upsert: true }
				);
				poolCreated.push(doc);
			}
			allCreated.push({ poolId, rounds: poolCreated });
		}
		res.status(201).json(allCreated);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});



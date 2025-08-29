// Backend mirror of frontend ROUND_CONFIG and sequence utilities

const ROUND_CONFIG = {
	1: { numbers: { from: 0, to: 9, unique: true }, showAllPnL: true, maxStocks: 2 },
	2: { numbers: { from: 0, to: 9, unique: true }, showAllPnL: false, maxStocks: 2 },
	3: { numbers: { from: 0, to: 9, unique: false }, showAllPnL: false, maxStocks: 2 },
	4: { numbers: { from: -9, to: 9, unique: true }, showAllPnL: false, maxStocks: 3 }
};

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueSequence(from, to, length) {
	const pool = [];
	for (let i = from; i <= to; i++) pool.push(i);
	const res = [];
	while (res.length < length && pool.length) {
		const idx = Math.floor(Math.random() * pool.length);
		res.push(pool.splice(idx, 1)[0]);
	}
	return res;
}

function repeatingSequence(from, to, length) {
	const res = [];
	for (let i = 0; i < length; i++) res.push(randomInt(from, to));
	return res;
}

function generateSequenceForRound(roundNumber, length) {
	const cfg = ROUND_CONFIG[roundNumber];
	if (!cfg) throw new Error(`Unknown round ${roundNumber}`);
	const { from, to, unique } = cfg.numbers;
	return unique ? uniqueSequence(from, to, length) : repeatingSequence(from, to, length);
}

function cumulativePrice(revealedArray) {
	return (revealedArray || []).filter((v) => v !== null && v !== undefined).reduce((a, b) => a + b, 0);
}

module.exports = {
	ROUND_CONFIG,
	generateSequenceForRound,
	cumulativePrice
};



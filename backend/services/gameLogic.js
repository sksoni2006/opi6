const Score = require('../models/score');
const { v4: uuidv4 } = require('uuid');

class GameLogic {
    constructor(io) {
        this.io = io;
        this.games = new Map();
    }

    // Initialize a new game round
    async initializeRound(poolId, roundNumber) {
        console.log(`Initializing round ${roundNumber} for pool ${poolId}`);
        
        // Get maxStocks from sets model
        const Set = require('../models/sets');
        let roundData = await Set.findOne({ poolId, roundNumber });
        
        // If no round data exists, create it with default values
        if (!roundData) {
            console.log(`No round data found, creating default for pool ${poolId}, round ${roundNumber}`);
            roundData = await Set.findOneAndUpdate(
                { poolId, roundNumber },
                {
                    $set: {
                        poolId,
                        roundNumber,
                        numbers: { from: 0, to: 9, unique: true },
                        showAllPnL: false,
                        maxStocks: 3,
                        sequence: [1, 2, 3, 4, 5, 6], // Default sequence
                        revealed: [],
                        status: 'active'
                    }
                },
                { upsert: true, new: true }
            );
        }
        
        const maxStocks = roundData ? roundData.maxStocks : 3;
        
        console.log(`Found round data:`, roundData ? 'yes' : 'no', `maxStocks: ${maxStocks}`);

        // Initialize game state with empty boxes
        const gameState = {
            poolId,
            roundNumber,
            boxes: Array(6).fill(null),  // Initialize empty boxes
            revealedBoxes: [],           // Track revealed boxes
            currentBox: 0,               // Start with first box
            phase: 'sell',
            players: {},
            maxStocks
        };

        this.games.set(poolId, gameState);
        console.log(`Game state created for pool ${poolId}`);
        
        // Initialize player scores in database
        const players = poolId.split(' ');
        console.log(`Creating score documents for players:`, players);
        
        for (const playerId of players) {
            try {
                const scoreDoc = await Score.findOneAndUpdate(
                    { poolId, roundNumber, playerId },
                    {
                        $set: {
                            initialBalance: 0,
                            currentBalance: 0,
                            holdings: [],
                            pnl: 0,
                            maxStocks,
                            roundState: {
                                roundNumber,
                                phase: 'sell',
                                currentBox: 0,
                                revealedNumbers: [],
                                currentPrice: 0,
                                activeOffers: []
                            }
                        }
                    },
                    { upsert: true, new: true }
                );
                console.log(`Created/updated score document for ${playerId}:`, scoreDoc._id);
            } catch (error) {
                console.error(`Error creating score document for ${playerId}:`, error);
                throw error;
            }
        }

        // Save initial game state to database
        await Score.findOneAndUpdate(
            { poolId },
            {
                $set: {
                    roundNumber,
                    players: gameState.players,
                    boxes: gameState.boxes,
                    revealedBoxes: [],
                    currentBox: 0,
                    phase: 'sell'
                }
            },
            { upsert: true, new: true }
        );

        console.log(`Round initialization complete for pool ${poolId}`);
        return gameState;
    }

    // Create a sell offer
    async createSellOffer(poolId, sellerId, price) {
        const gameState = this.games.get(poolId);
        if (!gameState || gameState.phase !== 'sell') {
            throw new Error('Cannot create sell offer - not in sell phase');
        }

        const offerId = uuidv4();
        const offer = {
            offerId,
            sellerId,
            price,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 15000), // 15 seconds
            status: 'active'
        };

        gameState.activeOffers.push(offer);

        // Update database
        await this.updateGameState(poolId, gameState);

        // Notify all players about new offer
        return {
            type: 'sell_offer_created',
            offer,
            activeOffers: gameState.activeOffers.filter(o => o.status === 'active')
        };
    }

    // Buy an offer (first come, first served)
    async buyOffer(poolId, buyerId, offerId) {
        const gameState = this.games.get(poolId);
        if (!gameState) {
            throw new Error('Game not found');
        }

        const offer = gameState.activeOffers.find(o => o.offerId === offerId);
        if (!offer || offer.status !== 'active') {
            throw new Error('Offer not available');
        }

        if (offer.expiresAt < new Date()) {
            offer.status = 'expired';
            await this.updateGameState(poolId, gameState);
            throw new Error('Offer has expired');
        }

        // Mark offer as sold
        offer.status = 'sold';
        offer.buyerId = buyerId;

        // Update buyer's holdings
        const buyerScore = await Score.findOne({ poolId, roundNumber: gameState.roundNumber, playerId: buyerId });
        if (!buyerScore) {
            throw new Error('Buyer not found');
        }

        const newHolding = {
            entry: offer.price,
            acquiredAt: new Date(),
            sellerId: offer.sellerId,
            transactionId: offerId
        };

        buyerScore.holdings.push(newHolding);
        buyerScore.currentBalance -= offer.price;
        await buyerScore.save();

        // Update seller's balance
        const sellerScore = await Score.findOne({ poolId, roundNumber: gameState.roundNumber, playerId: offer.sellerId });
        if (sellerScore) {
            sellerScore.currentBalance += offer.price;
            await sellerScore.save();
        }

        await this.updateGameState(poolId, gameState);

        return {
            type: 'offer_bought',
            offer,
            buyerId,
            sellerId: offer.sellerId,
            price: offer.price
        };
    }

    // Reveal a number in a box
    async revealNumber(poolId, boxIndex) {
        const gameState = this.games.get(poolId);
        if (!gameState) {
            throw new Error('Game not found');
        }

        if (boxIndex < 0 || boxIndex >= 6) {
            throw new Error('Invalid box index');
        }

        // Get the sequence for this round
        const Set = require('../models/sets');
        const roundData = await Set.findOne({ poolId, roundNumber: gameState.roundNumber });
        if (!roundData || !roundData.sequence[boxIndex]) {
            throw new Error('Round data not found');
        }

        const revealedNumber = roundData.sequence[boxIndex];
        gameState.revealedNumbers[boxIndex] = revealedNumber;
        gameState.currentBox = boxIndex;
        gameState.currentPrice = gameState.revealedNumbers.reduce((sum, num) => sum + (num || 0), 0);

        // Calculate PnL for all players
        await this.calculatePnL(poolId);

        await this.updateGameState(poolId, gameState);

        return {
            type: 'number_revealed',
            boxIndex,
            number: revealedNumber,
            currentPrice: gameState.currentPrice,
            revealedNumbers: gameState.revealedNumbers
        };
    }

    // Calculate PnL for all players
    async calculatePnL(poolId) {
        const gameState = this.games.get(poolId);
        if (!gameState) return;

        const players = poolId.split(' ');
        for (const playerId of players) {
            const playerScore = await Score.findOne({ 
                poolId, 
                roundNumber: gameState.roundNumber, 
                playerId 
            });

            if (playerScore) {
                // Calculate PnL: (currentPrice - entryPrice) for each holding
                let totalPnL = 0;
                for (const holding of playerScore.holdings) {
                    const holdingPnL = gameState.currentPrice - holding.entry;
                    holding.stockPnL = holdingPnL; // Store individual stock PnL
                    totalPnL += holdingPnL;
                }

                playerScore.pnl = totalPnL;
                playerScore.roundState.currentPrice = gameState.currentPrice;
                playerScore.roundState.revealedNumbers = gameState.revealedNumbers;
                await playerScore.save();
            }
        }
    }

    // Update game state in database
    async updateGameState(poolId, gameState) {
        const players = poolId.split(' ');
        for (const playerId of players) {
            await Score.findOneAndUpdate(
                { poolId, roundNumber: gameState.roundNumber, playerId },
                {
                    $set: {
                        roundState: {
                            roundNumber: gameState.roundNumber,
                            phase: gameState.phase,
                            currentBox: gameState.currentBox,
                            revealedNumbers: gameState.revealedNumbers,
                            currentPrice: gameState.currentPrice,
                            activeOffers: gameState.activeOffers
                        }
                    }
                }
            );
        }
    }

    // Get current game state
    async getGameState(poolId) {
        console.log(`Getting game state for pool ${poolId}`);
        const gameState = this.games.get(poolId);
        if (!gameState) {
            console.log(`No active game found for pool ${poolId}`);
            return null;
        }

        const players = poolId.split(' ');
        const playerScores = await Score.find({ 
            poolId, 
            roundNumber: gameState.roundNumber 
        });
        
        console.log(`Found ${playerScores.length} player scores for pool ${poolId}`);

        const result = {
            ...gameState,
            players: playerScores.map(score => ({
                playerId: score.playerId,
                currentBalance: score.currentBalance,
                holdings: score.holdings.map(holding => ({
                    ...holding.toObject(),
                    stockPnL: gameState.currentPrice - holding.entry // Ensure stockPnL is calculated
                })),
                pnl: score.pnl
            }))
        };
        
        console.log(`Returning game state:`, {
            poolId: result.poolId,
            roundNumber: result.roundNumber,
            phase: result.phase,
            currentPrice: result.currentPrice,
            maxStocks: result.maxStocks,
            playerCount: result.players.length
        });
        
        return result;
    }

    // Clean up expired offers
    async cleanupExpiredOffers(poolId) {
        const gameState = this.games.get(poolId);
        if (!gameState) return;

        const now = new Date();
        let hasChanges = false;

        for (const offer of gameState.activeOffers) {
            if (offer.status === 'active' && offer.expiresAt < now) {
                offer.status = 'expired';
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await this.updateGameState(poolId, gameState);
        }
    }

    handleOffer(poolId, offer) {
        const game = this.games.get(poolId);
        if (!game || game.phase !== 'sell') return false;

        game.offers.push(offer);
        this.io.to(poolId).emit('offer_placed', offer);

        // Expire offer after its duration
        setTimeout(() => {
            game.offers = game.offers.filter(o => o.id !== offer.id);
            this.io.to(poolId).emit('offer_expired', offer.id);
        }, 15000); // 15 seconds

        return true;
    }

    calculatePnL(poolId) {
        const game = this.games.get(poolId);
        if (!game) return;

        const currentNumber = game.boxes[game.currentBox - 1];
        game.players.forEach((player, playerId) => {
            player.holdings.forEach(holding => {
                holding.pnl = currentNumber - holding.entryPrice;
            });
            
            const totalPnL = player.holdings.reduce((sum, h) => sum + h.pnl, 0);
            this.io.to(poolId).emit('pnl_update', { playerId, pnl: totalPnL });
        });
    }
}

module.exports = new GameLogic();

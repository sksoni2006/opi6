const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const Score = require('./models/Score'); // Adjust the path as necessary

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
});

// Middleware
app.use(cors());
app.use(express.json());

// Health
app.get('/health', (_req, res) => {
	res.json({ status: 'ok' });
});

// Routes
app.use('/api/sets', require('./routes/sets_route'));
app.use('/api/scores', require('./routes/score_route'));

// Game logic service
const gameLogic = require('./services/gameLogic');

// Socket.IO room management
const roomPlayers = new Map(); // roomId -> Set of playerIds
const roomStates = new Map(); // roomId -> { gameStarted: boolean, lastActivity: timestamp }
const activeConnections = new Map(); // playerId -> socketId (for tracking reconnections)

const validateGameState = (gameState) => {
    if (!gameState || typeof gameState !== 'object') {
        console.error('Invalid game state:', gameState);
        return false;
    }
    
    if (!gameState.players || typeof gameState.players !== 'object') {
        console.error('Invalid players in game state:', gameState);
        return false;
    }
    
    // Check if all players have required properties
    for (const [playerId, player] of Object.entries(gameState.players)) {
        if (!player || typeof player.pnl !== 'number') {
            console.error(`Invalid player data for ${playerId}:`, player);
            return false;
        }
    }
    
    return true;
};

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Log active connections and rooms
    console.log('Active connections:', activeConnections.size);
    console.log('Active rooms:', roomPlayers.size);
    
	// Expect client to emit join_room with { roomId, playerId }
	socket.on('join_room', async ({ roomId, playerId }) => {
		try {
			console.log(`Join room request received - Room: ${roomId}, Player: ${playerId}`);
			
			// Store player and room ID on socket object for disconnect handling
			socket.roomId = roomId;
			socket.playerId = playerId;
			
			// Track active connection
			activeConnections.set(playerId, socket.id);

			if (!roomId || !playerId) {
				throw new Error('roomId and playerId required');
			}

			// Join the socket to the room
			socket.join(roomId);
			console.log(`Socket joined room ${roomId}`);
			
			// Track players in this room
			if (!roomPlayers.has(roomId)) {
				roomPlayers.set(roomId, new Set());
				roomStates.set(roomId, { gameStarted: false, lastActivity: Date.now() });
			}
			roomPlayers.get(roomId).add(playerId);
			
			const playerCount = roomPlayers.get(roomId).size;
			console.log(`Players in room ${roomId}: ${playerCount}`);
			
			// Notify all players
			io.to(roomId).emit('player_joined', { 
				playerId, 
				playersInRoom: Array.from(roomPlayers.get(roomId)),
				totalPlayers: playerCount
			});

			// If 4 players joined, start the game
			if (playerCount === 4) {
				console.log(`Starting game in room ${roomId}`);
				const players = Array.from(roomPlayers.get(roomId));
				const poolId = players.join(' ');
				
				try {
					// Initialize round with poolId and initial PnL values for each player
					const initialGameState = {
						poolId,
						roundNumber: 1,
						players: players.reduce((acc, playerId) => {
							acc[playerId] = {
								id: playerId,
								holdings: [],
								pnl: 0,
								currentBalance: 1000, // or whatever initial balance you want
								initialBalance: 1000
							};
							return acc;
						}, {})
					};

					// Initialize round with the complete game state
					await gameLogic.initializeRound(poolId, 1, initialGameState);
					const gameState = await gameLogic.getGameState(poolId);
					
					// Validate gameState before emitting
					if (!gameState || !gameState.players) {
						throw new Error('Invalid game state initialization');
					}

					// Update room state
					roomStates.set(roomId, { 
						gameStarted: true, 
						lastActivity: Date.now(),
						poolId,
						gameState // Store the game state in room state
					});
					
					io.to(roomId).emit('game_start', { 
						roomId,
						poolId,
						players,
						gameState
					});
					
					console.log(`Game started successfully in room ${roomId} with poolId ${poolId}`);
					console.log('Initial game state:', JSON.stringify(gameState, null, 2));
				} catch (error) {
					console.error(`Failed to initialize game in room ${roomId}:`, error);
					socket.emit('error', { message: 'Failed to initialize game state' });
				}
			}
		} catch (error) {
			console.error('Error in join_room:', error);
			socket.emit('error', { message: error.message });
		}
	});

	// Handle reconnection - don't treat as disconnect
	socket.on('reconnect_attempt', () => {
		console.log('Client attempting to reconnect...');
	});

	// Game action handlers
	socket.on('sell_stock', async ({ poolId, sellerId, price }) => {
		try {
			const result = await gameLogic.createSellOffer(poolId, sellerId, price);
			io.to(poolId).emit('sell_offer_created', result);
		} catch (error) {
			socket.emit('error', { message: error.message });
		}
	});

	socket.on('buy_stock', async ({ poolId, buyerId, offerId }) => {
		try {
			const result = await gameLogic.buyOffer(poolId, buyerId, offerId);
			io.to(poolId).emit('stock_bought', result);
			
			// Update game state for all players
			const gameState = await gameLogic.getGameState(poolId);
			io.to(poolId).emit('game_state_update', gameState);
		} catch (error) {
			socket.emit('error', { message: error.message });
		}
	});

	socket.on('reveal_number', async ({ poolId, boxIndex }) => {
		try {
			const result = await gameLogic.revealNumber(poolId, boxIndex);
			io.to(poolId).emit('number_revealed', result);
			
			// Update game state for all players
			const gameState = await gameLogic.getGameState(poolId);
			io.to(poolId).emit('game_state_update', gameState);
		} catch (error) {
			socket.emit('error', { message: error.message });
		}
	});

	socket.on('get_game_state', async ({ poolId }) => {
		try {
			const gameState = await gameLogic.getGameState(poolId);
			
			// Validate game state before sending
			if (!gameState || !gameState.players) {
				throw new Error('Invalid game state');
			}
			
			// Ensure all players have pnl property
			const validatedState = {
				...gameState,
				players: Object.entries(gameState.players).reduce((acc, [playerId, player]) => {
					acc[playerId] = {
						...player,
						pnl: player.pnl || 0,
						holdings: player.holdings || [],
						currentBalance: player.currentBalance || 1000,
						initialBalance: player.initialBalance || 1000
					};
					return acc;
				}, {})
			};
			
			socket.emit('game_state', validatedState);
		} catch (error) {
			console.error('Error getting game state:', error);
			socket.emit('error', { 
				message: 'Failed to get game state',
				details: error.message 
			});
		}
	});

	socket.on('game_state_update', async ({ poolId }) => {
		try {
			const gameState = await gameLogic.getGameState(poolId);
			if (!validateGameState(gameState)) {
				throw new Error('Invalid game state structure');
			}
			io.to(poolId).emit('game_state_update', gameState);
		} catch (error) {
			console.error('Error updating game state:', error);
			socket.emit('error', { message: 'Failed to update game state' });
		}
	});

	socket.on('disconnect', async () => {
		if (socket.roomId && socket.playerId) {
			const room = roomPlayers.get(socket.roomId);
			if (room) {
				room.delete(socket.playerId);
				
				// If room is empty, clean up the game state
				if (room.size === 0) {
					try {
						const poolId = Array.from(room).join(' ');
						await Score.deleteOne({ poolId });
						roomPlayers.delete(socket.roomId);
						roomStates.delete(socket.roomId);
						console.log(`Cleaned up empty room: ${socket.roomId}`);
					} catch (error) {
						console.error('Error cleaning up room:', error);
					}
				}
			}
		}
	});
});

const PORT = process.env.PORT || 5000;

// Start server only after DB connects
connectDB().then((connection) => {
    console.log('MongoDB connection state:', connection.connection.readyState);
    
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log('Environment:', process.env.NODE_ENV);
    });
}).catch((err) => {
    console.error('Failed to connect DB:', err.message);
    console.error('Full error:', err);
    process.exit(1);
});



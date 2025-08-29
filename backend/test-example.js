// Test script for the pool-based game system
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testPoolSystem() {
    try {
        console.log('🚀 Testing Pool-Based Game System\n');

        // 1. Initialize all 11 pools with all rounds
        console.log('1. Initializing all 11 pools...');
        const initResponse = await axios.post(`${BASE_URL}/sets/init-all-pools`, {
            sequenceLengthPerRound: { "1": 10, "2": 10, "3": 10, "4": 10 }
        });
        console.log(`✅ Created ${initResponse.data.length} pools\n`);

        // 2. Get all pools
        console.log('2. Fetching all pools...');
        const poolsResponse = await axios.get(`${BASE_URL}/sets/pools`);
        console.log('Available pools:');
        poolsResponse.data.forEach(pool => {
            console.log(`   ${pool.poolId} (${pool.playerCount} players, status: ${pool.status})`);
        });
        console.log();

        // 3. Get specific pool details
        console.log('3. Getting Team1 pool details...');
        const team1Response = await axios.get(`${BASE_URL}/sets?poolId=Team1A Team1B Team1C Team1D`);
        console.log('Team1 rounds:');
        team1Response.data.forEach(round => {
            console.log(`   Round ${round.roundNumber}: ${round.sequence.slice(0, 5).join(',')}... (${round.sequence.length} numbers)`);
        });
        console.log();

        // 4. Example of saving player scores
        console.log('4. Saving player scores...');
        const scoreData = {
            poolId: "Team1A Team1B Team1C Team1D",
            roundNumber: 1,
            playerId: "Team1A",
            holdings: [{ entry: 4 }],
            closed: [{ entry: 2, exitVsFinal: 1 }],
            revealed: [2, 1, 3]
        };
        const scoreResponse = await axios.post(`${BASE_URL}/scores/upsert`, scoreData);
        console.log(`✅ Saved score for ${scoreResponse.data.playerId}, PnL: ${scoreResponse.data.pnl}\n`);

        console.log('🎉 All tests completed successfully!');
        console.log('\n📋 How to use:');
        console.log('• Players join rooms using Socket.IO: socket.emit("join_room", { roomId: "Team1A Team1B Team1C Team1D", playerId: "Team1A" })');
        console.log('• Game starts automatically when all 4 players join');
        console.log('• Use /api/sets/by-round?poolId=...&roundNumber=1 to get round data');
        console.log('• Use /api/scores/upsert to save player PnL state');

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    testPoolSystem();
}

module.exports = { testPoolSystem };

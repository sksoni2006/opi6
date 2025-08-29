import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import './RoomJoin.css';

const RoomJoin = () => {
  const { socket, roomState, joinRoom, playerId, setPlayerId } = useGame();
  const [roomId, setRoomId] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinRoom = async () => {
    if (!roomId.trim() || !playerId.trim()) {
      alert('Please enter both Room ID and Player ID');
      return;
    }
    
    setIsJoining(true);
    await joinRoom(roomId.trim(), playerId.trim());
    setIsJoining(false);
  };

  const getPlayerColor = (player) => {
    if (roomState.playersInRoom.includes(player)) {
      return '#4CAF50'; // Green for joined players
    }
    return '#9E9E9E'; // Grey for not joined
  };

  const getPlayerStatus = (player) => {
    if (roomState.playersInRoom.includes(player)) {
      return '🟢 Joined';
    }
    return '⚪ Waiting';
  };

  // Extract player IDs from room ID (assuming format: "Team1A Team1B Team1C Team1D")
  const getPlayersFromRoomId = (roomId) => {
    if (!roomId) return [];
    return roomId.split(' ').filter(id => id.trim());
  };

  const players = getPlayersFromRoomId(roomId);

  if (roomState.isInRoom) {
    return (
      <div className="room-join-container">
        <div className="room-info">
          <h3>🎮 Game Room: {roomState.roomId}</h3>
          <div className="players-grid">
            {players.map((player) => (
              <div 
                key={player} 
                className="player-card"
                style={{ 
                  backgroundColor: getPlayerColor(player),
                  color: 'white',
                  fontWeight: 'bold'
                }}
              >
                <div className="player-id">{player}</div>
                <div className="player-status">{getPlayerStatus(player)}</div>
              </div>
            ))}
          </div>
          <div className="room-status">
            <p>Players joined: {roomState.playersInRoom.length}/4</p>
            {roomState.playersInRoom.length === 4 && (
              <div className="game-started">
                🚀 All players joined! Game starting...
              </div>
            )}
            {roomState.playersInRoom.length < 4 && (
              <div className="waiting-message">
                ⏳ Waiting for {4 - roomState.playersInRoom.length} more player(s)...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-join-container">
      <div className="join-form">
        <h2>🎯 Join Game Room</h2>
        <div className="input-group">
          <label htmlFor="roomId">Room ID:</label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="e.g., Team1A Team1B Team1C Team1D"
            disabled={isJoining}
          />
        </div>
        <div className="input-group">
          <label htmlFor="playerId">Player ID:</label>
          <input
            id="playerId"
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder="e.g., Team1A"
            disabled={isJoining}
          />
        </div>
        <button 
          onClick={handleJoinRoom}
          disabled={isJoining || !roomId.trim() || !playerId.trim()}
          className="join-button"
        >
          {isJoining ? 'Joining...' : 'Join Room'}
        </button>
        
        {roomId && (
          <div className="room-preview">
            <h4>Room Preview:</h4>
            <div className="players-grid">
              {players.map((player) => (
                <div 
                  key={player} 
                  className="player-card preview"
                  style={{ 
                    backgroundColor: player === playerId ? '#4CAF50' : '#9E9E9E',
                    color: 'white'
                  }}
                >
                  {player}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomJoin;

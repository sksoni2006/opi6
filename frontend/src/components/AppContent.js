import React from 'react';
import { useGame } from '../context/GameContext';
import { RoomJoin } from './RoomJoin';
import { GameBoard } from './GameBoard';

const AppContent = () => {
    const { gameState } = useGame();

    if (gameState?.loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="app-content">
            {gameState?.isInRoom ? <GameBoard /> : <RoomJoin />}
        </div>
    );
};

export default AppContent;
import React from 'react';
import { useGame } from '../context/GameContext';

export const Timer = () => {
    const { gameState } = useGame();
    
    if (!gameState?.isInRoom) {
        return null; // Don't render timer if not in room
    }
    
    return (
        <div className="timer">
            <h3>
                {gameState.phase === 'sell' ? 'Time to sell: ' : 'Next number in: '}
                {gameState.timer}s
            </h3>
            <div className="phase-indicator">
                Current Phase: {gameState.phase}
            </div>
        </div>
    );
};
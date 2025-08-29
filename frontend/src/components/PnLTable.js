import React from "react";
import { useGame } from "../context/GameContext";

const PnLTable = () => {
  const { roomState } = useGame();

  if (!roomState?.gameState?.players) {
    return <div>Waiting for players...</div>;
  }

  const players = Object.entries(roomState.gameState.players).map(
    ([id, player]) => ({
      id,
      holdings: player?.holdings || [],
      pnl: player?.pnl || 0,
      currentBalance: player?.currentBalance || 1000,
      initialBalance: player?.initialBalance || 1000,
    })
  );

  return (
    <table className="pnl-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Holdings</th>
          <th>PnL</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player) => (
          <tr key={player.id}>
            <td>{player.id}</td>
            <td>{player.holdings.length}</td>
            <td>{player.pnl}</td>
            <td>{player.currentBalance}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default PnLTable;

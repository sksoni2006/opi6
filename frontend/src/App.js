import React from "react";
import { GameProvider, useGame } from "./context/GameContext";
import Table from "./components/Table";
import RightPanel from "./components/RightPanel";
import PnLTable from "./components/PnLTable";
import RoomJoin from "./components/RoomJoin";
import ErrorBoundary from "./components/ErrorBoundary";

function AppContent() {
  const { roomState } = useGame();

  // Show room join if not in room OR if in room but game hasn't started yet
  if (!roomState.isInRoom || !roomState.gameStarted) {
    return <RoomJoin />;
  }

  return (
    <div className="app">
      <div className="left">
        <div className="left-inner">
          <div className="brand" role="banner" aria-label="Stock Trading">
            <div className="brand-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 17L9 12L13 16L20 9" stroke="#7ad0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 9H15" stroke="#7ad0ff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="brand-text">
              <div className="brand-title">TICKER</div>
              <div className="brand-sub">TYCOON</div>
            </div>
          </div>

          <Table />

          <div style={{ marginTop: 12 }}>
            <ErrorBoundary>
              <PnLTable />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <div className="right">
        <RightPanel />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
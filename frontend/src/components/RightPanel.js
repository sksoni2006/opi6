import React, { useState, useEffect } from "react";
import { useGame } from "../context/GameContext";
import "./RightPanel.css";

export default function RightPanel() {
  const { socket, roomState, playerId, setRoomState, state: localGameState } = useGame();
  const [sellPrice, setSellPrice] = useState("");
  const [activeOffers, setActiveOffers] = useState([]);
  
  // Use gameState from roomState if available, otherwise fall back to local state
  const gameState = roomState.gameState || localGameState;
  
  // Debug logging
  console.log('RightPanel render - gameState:', gameState);
  console.log('RightPanel render - roomState:', roomState);
  console.log('RightPanel render - localGameState:', localGameState);

  // Get current player's data
  const currentPlayer = gameState?.players?.[playerId] || 
                       (gameState?.players && Object.values(gameState.players).find(p => p.id === playerId));
  
  const maxStocks = gameState?.players?.[playerId]?.max || 2;
  const currentHoldings = currentPlayer?.holdings || [];
  const currentPnL = currentPlayer?.pnl || 0;
  
  // Calculate current price from boxes
  const currentPrice = gameState?.boxes ? 
    gameState.boxes.filter(box => box !== null).reduce((sum, val) => sum + val, 0) : 0;

  const roundNumber = gameState?.round || 1;
  const currentBox = gameState?.step || 0;
  const phase = gameState?.phase || 'waiting';

  useEffect(() => {
    if (!socket || !roomState.roomId) return;

    // Listen for game state updates (already handled in GameContext)
    
    socket.on('sell_offer_created', (data) => {
      console.log('Sell offer created:', data);
      setActiveOffers(data.activeOffers || data.offers || []);
    });

    socket.on('stock_bought', (data) => {
      console.log('Stock bought:', data);
      // Remove the bought offer from active offers
      setActiveOffers(prev => prev.filter(offer => 
        offer.offerId !== data.offer.offerId && offer.id !== data.offer.id
      ));
    });

    // Listen for offers list updates
    socket.on('offers_updated', (data) => {
      console.log('Offers updated:', data);
      setActiveOffers(data.offers || []);
    });

    return () => {
      socket.off('sell_offer_created');
      socket.off('stock_bought');
      socket.off('offers_updated');
    };
  }, [socket, roomState.roomId]);

  // Sync activeOffers with gameState offers if available
  useEffect(() => {
    if (gameState?.offers) {
      setActiveOffers(gameState.offers);
    }
  }, [gameState?.offers]);

  const handlePlaceOffer = () => {
    if (!sellPrice || !socket || !roomState.roomId || !playerId) return;
    
    console.log('Placing sell offer:', {
      poolId: roomState.roomId,
      sellerId: playerId,
      price: Number(sellPrice)
    });
    
    socket.emit('sell_stock', {
      poolId: roomState.roomId,
      sellerId: playerId,
      price: Number(sellPrice)
    });
    setSellPrice("");
  };

  const handleBuyOffer = (offerId) => {
    if (!socket || !roomState.roomId || !playerId) return;
    
    console.log('Buying offer:', {
      poolId: roomState.roomId,
      buyerId: playerId,
      offerId
    });
    
    socket.emit('buy_stock', {
      poolId: roomState.roomId,
      buyerId: playerId,
      offerId
    });
  };

  const canBuyOffer = (offer) => {
    if (!currentPlayer) return false;
    const offerId = offer.id || offer.offerId;
    const sellerId = offer.sellerId;
    return currentPlayer.holdings.length < maxStocks && sellerId !== playerId;
  };

  const getTimeLeft = (offer) => {
    const now = new Date();
    const expiresAt = new Date(offer.expiresAt);
    const timeLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return timeLeft;
  };

  if (!gameState || (!roomState.gameStarted && !gameState.round)) {
    return (
      <div className="card">
        <div className="section-title">Waiting for game to start...</div>
        <div className="small">
          {roomState.playersInRoom?.length || 0}/4 players in room. 
          Need 4 players to start the game.
        </div>
        {roomState.playersInRoom?.length > 0 && (
          <div className="small" style={{marginTop: 8}}>
            Players in room: {roomState.playersInRoom.join(', ')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="section-title">
        Round {roundNumber} • Box {currentBox + 1} / 6
      </h3>

      <div className="grid two" style={{marginBottom:8}}>
        <div>
          <div className="small">Phase</div>
          <div style={{fontWeight:700}}>{phase}</div>
        </div>
        <div>
          <div className="small">Current Price</div>
          <div style={{fontWeight:700}}>{currentPrice}</div>
        </div>
      </div>

      <div className="grid" style={{marginBottom:12}}>
        <div className="small">Holdings: {currentHoldings.length}/{maxStocks} • Max this round</div>
      </div>

      <div className="grid" style={{marginBottom:12}}>
        <div className="small">Sell a stock (any OR owned)</div>
        <div className="input-row">
          <input
            type="number"
            placeholder="Enter sell price"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
          />
          <button
            className="primary"
            disabled={!sellPrice || phase === "finished"}
            onClick={handlePlaceOffer}
          >
            Place Offer
          </button>
        </div>
      </div>

      <div className="grid" style={{marginBottom:12}}>
        <div className="section-title">Live Offers</div>
        {activeOffers.length === 0 && <div className="small">No active offers.</div>}
        {activeOffers.map((offer) => {
          const timeLeft = getTimeLeft(offer);
          const canBuy = canBuyOffer(offer);
          const offerId = offer.id || offer.offerId;
          
          return (
            <div key={offerId} className="grid two card" style={{padding:10}}>
              <div>
                <div>
                  <span className="badge">Player {offer.sellerId}</span> selling at <b>{offer.price}</b>
                </div>
                <div className="timer-bar" style={{marginTop:6}}>
                  <div 
                    className="timer-fill" 
                    style={{ 
                      width: `${(timeLeft / 15) * 100}%`,
                      backgroundColor: timeLeft < 5 ? '#ff4444' : '#4CAF50'
                    }} 
                  />
                </div>
                <div className="small">{timeLeft}s</div>
              </div>
              <div style={{display:"flex", alignItems:"center", justifyContent:"end", gap:8}}>
                <button 
                  disabled={!canBuy || timeLeft === 0}
                  onClick={() => handleBuyOffer(offerId)}
                  className={canBuy ? "primary" : "disabled"}
                >
                  Buy
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid">
        <div className="section-title">My Holdings (Player {playerId})</div>
        <table className="table">
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Entry Price</th>
              <th>Current Price</th>
              <th>Stock P&L</th>
            </tr>
          </thead>
          <tbody>
            {currentHoldings.map((holding, idx) => {
              const stockPnL = currentPrice - holding.entry;
              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{holding.entry}</td>
                  <td>{currentPrice}</td>
                  <td className={stockPnL >= 0 ? "profit" : "loss"}>
                    {stockPnL >= 0 ? `+${stockPnL}` : stockPnL}
                  </td>
                </tr>
              );
            })}
            {currentHoldings.length === 0 && (
              <tr>
                <td colSpan={4} className="small">No holdings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        
        {/* Overall PnL Summary */}
        <div style={{
          background: "rgba(255,255,255,0.05)", 
          padding: "12px", 
          borderRadius: "8px", 
          marginTop: "12px",
          border: "1px solid rgba(255,255,255,0.1)"
        }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <div>
              <div className="small">Total Holdings: {currentHoldings.length}</div>
              <div className="small">Average Entry: {currentHoldings.length > 0 ? 
                (currentHoldings.reduce((sum, h) => sum + h.entry, 0) / currentHoldings.length).toFixed(1) : 0}
              </div>
            </div>
            <div style={{textAlign: "right"}}>
              <div className="small">Overall P&L</div>
              <div style={{
                fontSize: "1.2rem", 
                fontWeight: "700",
                color: currentPnL >= 0 ? "#4CAF50" : "#f44336"
              }}>
                {currentPnL >= 0 ? `+${currentPnL}` : currentPnL}
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr style={{borderColor:"#2b2b46", margin:"12px 0"}} />

      <div className="small">
        Cumulative Price this round: <b>{currentPrice}</b> (sum of revealed numbers)
      </div>
    </div>
  );
}
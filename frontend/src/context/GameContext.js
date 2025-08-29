import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { io } from "socket.io-client";
import { PLAYERS, ROUND_CONFIG, DURATIONS } from "../utils/constants";
import { load, save } from "../utils/storage";
import { uniqueSequence, repeatingSequence } from "../utils/random";
import { cumulativePrice, calcPlayerPnL } from "../utils/pnl";

const GameContext = createContext(null);
export const useGame = () => useContext(GameContext);

// ---------- Initial State ----------
const makePlayers = (round) => {
  const conf = ROUND_CONFIG[round];
  const obj = {};
  for (const id of PLAYERS) {
    obj[id] = {
      id,
      holdings: [],     // [{entry, owned: true/false, from: 'sellerId'|'system'}]
      closed: [],       // [{exitVsFinal}]   // for future if you need hard closes
      pnl: 0,
      max: conf.maxStocks
    };
  }
  return obj;
};

const newRoundNumbers = (round) => {
  const { from, to, unique } = ROUND_CONFIG[round].numbers;
  return unique ? uniqueSequence(from, to, 6) : repeatingSequence(from, to, 6);
};

const baseState = {
  round: 1,
  step: 0,                  // 0..6 (index of box to be revealed next)
  numbers: newRoundNumbers(1),
  boxes: Array(6).fill(null),
  phase: "sell",            // 'sell' | 'turn'
  timers: { phaseLeft: DURATIONS.SELL_WINDOW }, // seconds
  offers: [],               // [{id, sellerId, price, expiresAt}]
  players: makePlayers(1),
  lastEvent: null           // helpful for UI
};

// ---------- Reducer ----------
function reducer(state, action) {
  switch (action.type) {
    case "LOAD_OR_INIT": {
      return action.payload ?? state;
    }
    case "TICK": {
      const timers = { ...state.timers, phaseLeft: Math.max(0, state.timers.phaseLeft - 1) };
      return { ...state, timers };
    }
    case "SET_PHASE": {
      return { ...state, phase: action.phase, timers: { phaseLeft: action.seconds } };
    }
    case "PLACE_OFFER": {
      const { sellerId, price, lifetime } = action;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();
      const offer = { id, sellerId, price, expiresAt: now + lifetime * 1000 };
      return { ...state, offers: [...state.offers, offer] };
    }
    case "CLEAN_EXPIRED_OFFERS": {
      const now = Date.now();
      return { ...state, offers: state.offers.filter((o) => o.expiresAt > now) };
    }
    case "BUY_OFFER": {
      const { buyerId, offerId } = action;
      const offer = state.offers.find((o) => o.id === offerId);
      if (!offer) return state;

      // Capacity check
      const buyer = state.players[buyerId];
      if (buyer.holdings.length >= buyer.max) return state;

      const newOffers = state.offers.filter((o) => o.id !== offerId);
      const players = structuredClone(state.players);

      // Buyer gets a long position at offer.price
      players[buyerId].holdings.push({ entry: offer.price, owned: true, from: offer.sellerId });

      // If seller sold "owned stock", you could remove one holding from seller here
      // For now, we assume "sell any stock" & "sell own" both transfer exposure to buyer,
      // while seller keeps no open exposure. If you need "short" for seller, add below.

      return { ...state, offers: newOffers, players, lastEvent: { type: "BUY", buyerId, offer } };
    }
    case "REVEAL_NEXT_BOX": {
      if (state.step >= 6) return state;
      const nextValue = state.numbers[state.step];
      const boxes = state.boxes.slice();
      boxes[state.step] = nextValue;

      // Recalc PnL for all players vs cumulative price
      const cp = cumulativePrice(boxes);
      const players = structuredClone(state.players);
      for (const id of Object.keys(players)) {
        players[id].pnl = calcPlayerPnL(players[id], cp);
      }

      return { ...state, boxes, step: state.step + 1, players };
    }
    case "NEXT_TURN_OR_ROUND": {
      // Move to next phase/turn/round
      if (state.step >= 6) {
        // Move to next round or end
        const nextRound = state.round + 1;
        if (nextRound > 4) {
          // Game finished — freeze timers
          return { ...state, phase: "finished", timers: { phaseLeft: 0 } };
        }
        // New round
        return {
          ...baseState,
          round: nextRound,
          numbers: newRoundNumbers(nextRound),
          players: makePlayers(nextRound),
          phase: "sell",
          timers: { phaseLeft: DURATIONS.SELL_WINDOW }
        };
      } else {
        // Next: after a reveal, go back to SELL window for the next 2.5 min turn
        return { ...state, phase: "sell", timers: { phaseLeft: DURATIONS.SELL_WINDOW } };
      }
    }

    case "SELL_STOCK": {
      const { playerId, holdingIndex, sellPrice } = action.payload;
      const players = structuredClone(state.players);

      // Remove the holding from player's holdings
      const [holding] = players[playerId].holdings.splice(holdingIndex, 1);

      // Create a resale offer
      const newOffer = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        sellerId: playerId,
        price: sellPrice,
        originalBuyPrice: holding.entry,
        fromResell: true,
        expiresAt: Date.now() + 1000 * 30 // 30s, or use DURATIONS.OFFER_LIFETIME
      };

      return {
        ...state,
        players,
        offers: [...state.offers, newOffer]
      };
    }

    case "SET_MAX_FOR_ROUND": {
      const players = structuredClone(state.players);
      for (const id of Object.keys(players)) players[id].max = action.max;
      return { ...state, players };
    }
    case "RESET_GAME": {
      return structuredClone(baseState);
    }
    // Add this new action to update game state from socket
    case "UPDATE_GAME_STATE": {
      return { ...state, ...action.payload };
    }
    default:
      return state;
  }
}

// ---------- Engine (phase clock) ----------
function useEngine(state, dispatch) {
  // Phase driver
  React.useEffect(() => {
    if (state.phase === "finished") return;
    const t = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(t);
  }, [state.phase, dispatch]);

  // Offer cleanup every second
  React.useEffect(() => {
    if (state.phase === "finished") return;
    const t = setInterval(() => dispatch({ type: "CLEAN_EXPIRED_OFFERS" }), 1000);
    return () => clearInterval(t);
  }, [state.phase, dispatch]);

  // When timer hits 0, transition
  React.useEffect(() => {
    if (state.phase === "finished") return;
    if (state.timers.phaseLeft > 0) return;

    if (state.phase === "sell") {
      // Move to 2.5 minute turn, during which buying/placing offers is allowed
      dispatch({ type: "SET_PHASE", phase: "turn", seconds: DURATIONS.TURN_WINDOW });
    } else if (state.phase === "turn") {
      // Reveal a box, then either go to next round or next sell window
      dispatch({ type: "REVEAL_NEXT_BOX" });
      dispatch({ type: "NEXT_TURN_OR_ROUND" });
      // Max stocks may change per round
      const max = (ROUND_CONFIG[state.round] || ROUND_CONFIG[4]).maxStocks;
      dispatch({ type: "SET_MAX_FOR_ROUND", max });
    }
  }, [state.timers.phaseLeft, state.phase, state.round, dispatch]);
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, baseState);
  
  // Socket.IO and room state
  const [socket, setSocket] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [roomState, setRoomState] = useState({
    isInRoom: false,
    roomId: '',
    playersInRoom: [],
    gameStarted: false,
    gameState: null // Initialize gameState as null
  });

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      // Restore room state if we were in a room before
      const savedRoomState = localStorage.getItem('roomState');
      if (savedRoomState) {
        const parsed = JSON.parse(savedRoomState);
        if (parsed.roomId && parsed.playerId) {
          // Rejoin the room automatically
          joinRoom(parsed.roomId, parsed.playerId);
        }
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    newSocket.on('reconnect', () => {
      console.log('Reconnected to server');
    });

    newSocket.on('player_joined', (data) => {
      console.log('Player joined event received:', data);
      setRoomState(prev => ({
        ...prev,
        playersInRoom: data.playersInRoom,
        isInRoom: true
      }));
    });

    newSocket.on('player_left', (data) => {
      setRoomState(prev => ({
        ...prev,
        playersInRoom: data.playersInRoom
      }));
    });

    newSocket.on('game_start', (data) => {
      console.log('Game start event received:', data);
      if (data.gameState) {
        // Ensure gameState has proper structure
        const validatedGameState = {
          ...data.gameState,
          players: Object.entries(data.gameState.players || {}).reduce((acc, [id, player]) => {
            acc[id] = {
              id,
              pnl: player?.pnl || 0,
              currentBalance: player?.currentBalance || 1000,
              initialBalance: player?.initialBalance || 1000,
              holdings: player?.holdings || []
            };
            return acc;
          }, {})
        };

        setRoomState(prev => ({
          ...prev,
          gameStarted: true,
          gameState: validatedGameState
        }));
      }
    });

    // Listen for game state updates
    newSocket.on('game_state_update', (newGameState) => {
      console.log('Game state update received:', newGameState);
      dispatch({ type: "UPDATE_GAME_STATE", payload: newGameState });
      setRoomState(prev => ({
        ...prev,
        gameState: newGameState
      }));
    });

    newSocket.on('error', (data) => {
      alert(data.message);
    });

    return () => newSocket.close();
  }, []);

  // Join room function
  const joinRoom = async (roomId, playerId) => {
    if (!socket) return;
    
    console.log(`Attempting to join room ${roomId} as ${playerId}`);
    
    setRoomState(prev => ({
      ...prev,
      roomId,
      isInRoom: true,
      gameStarted: false,
      gameState: null
    }));
    
    setPlayerId(playerId);
    
    localStorage.setItem('roomState', JSON.stringify({ roomId, playerId }));
    
    // Emit join_room event to server
    socket.emit('join_room', { roomId, playerId });
  };

  // Load saved state (if any) once
  useEffect(() => {
    const saved = load();
    if (saved) dispatch({ type: "LOAD_OR_INIT", payload: saved });
  }, []);

  // Persist local game state (but not room state)
  useEffect(() => save(state), [state]);

  // Only run engine if we have a valid game state
  const shouldRunEngine = roomState.gameStarted && roomState.gameState;
  useEngine(shouldRunEngine ? state : baseState, dispatch);

  const derived = useMemo(() => {
    const gameStateToUse = roomState.gameState || state;
    const cp = cumulativePrice(gameStateToUse.boxes || []);
    const conf = ROUND_CONFIG[gameStateToUse.round || 1];
    return { cp, conf };
  }, [state, roomState.gameState]);

  const value = useMemo(
    () => ({ 
      state, 
      dispatch, 
      cp: derived.cp, 
      conf: derived.conf,
      socket,
      roomState,
      setRoomState,
      joinRoom,
      playerId,
      setPlayerId
    }),
    [state, derived, socket, roomState, playerId]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
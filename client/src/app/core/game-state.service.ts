import { Injectable } from '@angular/core';
import { SocketService } from './socket.service';
import { Observable } from 'rxjs';

export interface MoveData {
  playerId: string;
  move: any;
  gameState: any;
  result?: {
    hit?: boolean;
    sunk?: boolean;
    sunkShipType?: string | null;
    // Checkers-specific
    captured?: { row: number; col: number; piece?: string };
    move?: { fromRow: number; fromCol: number; toRow: number; toCol: number };
    // War-specific
    war?: boolean;
    warInitiated?: boolean;
    roundWinner?: string;
    // Farkle-specific
    farkle?: boolean;
    hotDice?: boolean;
    rollingIndices?: number[];
    score?: number;
    banked?: number;
    lostScore?: number;
    // Blackjack-specific
    card?: any;
    busted?: boolean;
    doubled?: boolean;
    allBet?: boolean;
    dealt?: boolean;
    newRound?: boolean;
    // Mancala-specific
    extraTurn?: boolean;
    lastPit?: number;
    // Yahtzee-specific
    dice?: number[];
    rollsLeft?: number;
    held?: boolean[];
    category?: string;
    totalScore?: number;
    // Poker-specific
    action?: string;
    handOver?: boolean;
    newHand?: boolean;
    count?: number;
    newCards?: any[];
    variant?: string;
    wilds?: string[];
    // Go Fish-specific
    gotCards?: boolean;
    drewMatch?: boolean;
    cardsGiven?: number;
    anotherTurn?: boolean;
    newBook?: string;
  };
}

export interface GameOverData {
  winner: string | null;
  winningLine: number[] | null;
  isDraw: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GameStateService {

  constructor(private socketService: SocketService) {}

  makeMove(roomCode: string, move: any): void {
    this.socketService.emit('make-move', { roomCode, move });
  }

  requestRematch(roomCode: string): void {
    this.socketService.emit('request-rematch', { roomCode });
  }

  onMoveMade(): Observable<MoveData> {
    return this.socketService.on<MoveData>('move-made');
  }

  onInvalidMove(): Observable<{ message: string }> {
    return this.socketService.on<{ message: string }>('invalid-move');
  }

  onGameOver(): Observable<GameOverData> {
    return this.socketService.on<GameOverData>('game-over');
  }

  onRematchRequested(): Observable<{ playerId: string }> {
    return this.socketService.on<{ playerId: string }>('rematch-requested');
  }

  getMySocketId(): string {
    return this.socketService.getSocketId();
  }
}

import { Injectable } from '@angular/core';
import { SocketService } from './socket.service';
import { Observable } from 'rxjs';

export interface Player {
  id: string;
  name: string;
}

export interface GameStartData {
  players: Player[];
  gameState: any;
}

@Injectable({
  providedIn: 'root'
})
export class LobbyService {
  // Store the last game start data so the game component can read it after navigation
  public lastGameStartData: GameStartData | null = null;

  constructor(private socketService: SocketService) {}

  createRoom(gameType: string, playerName: string): void {
    this.socketService.emit('create-room', { gameType, playerName });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.socketService.emit('join-room', { roomCode, playerName });
  }

  onRoomCreated(): Observable<{ roomCode: string }> {
    return this.socketService.on<{ roomCode: string }>('room-created');
  }

  onJoinError(): Observable<{ message: string }> {
    return this.socketService.on<{ message: string }>('join-error');
  }

  onGameStart(): Observable<GameStartData> {
    return this.socketService.on<GameStartData>('game-start');
  }

  onOpponentDisconnected(): Observable<void> {
    return this.socketService.on<void>('opponent-disconnected');
  }
}

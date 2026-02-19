import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LobbyService, Player } from '../../core/lobby.service';
import { UserService } from '../../core/user.service';
import { SocketService } from '../../core/socket.service';
import { PlayerWalletService } from '../../core/player-wallet.service';
import { PlayersSidebarComponent } from '../../shared/players-sidebar/players-sidebar.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    PlayersSidebarComponent
  ],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss'
})
export class LobbyComponent implements OnInit, OnDestroy {
  gameType = '';
  playerName = '';
  joinCode = '';
  roomCode = '';
  joining = false;
  gameStarted = false;
  error = '';

  // Multi-player lobby (poker, blackjack, farkle, yahtzee, go-fish)
  roomPlayers: Player[] = [];
  maxPlayers = 2;
  isHost = false;
  aiCount = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private lobbyService: LobbyService,
    private userService: UserService,
    private socketService: SocketService,
    private wallet: PlayerWalletService
  ) {}

  ngOnInit(): void {
    this.gameType = this.route.snapshot.paramMap.get('gameType') || '';

    // Pre-fill player name from stored user
    this.playerName = this.userService.getUserName();

    // Check if we arrived here from a poker challenge
    const challengeData = this.lobbyService.challengeLobbyData;
    if (challengeData) {
      this.lobbyService.challengeLobbyData = null;
      this.roomCode = challengeData.roomCode;
      this.roomPlayers = challengeData.players;
      this.maxPlayers = challengeData.maxPlayers;
      this.isHost = challengeData.players.length > 0 && challengeData.players[0].id === this.socketService.getSocketId();
    }

    this.subscriptions.push(
      this.lobbyService.onRoomCreated().subscribe(({ roomCode, maxPlayers }) => {
        this.roomCode = roomCode;
        this.isHost = true;
        if (maxPlayers) this.maxPlayers = maxPlayers;
        // Host is the first player
        this.roomPlayers = [{ id: this.socketService.getSocketId(), name: this.playerName.trim() }];
      })
    );

    this.subscriptions.push(
      this.lobbyService.onJoinError().subscribe(({ message }) => {
        this.error = message;
        this.joining = false;
      })
    );

    this.subscriptions.push(
      this.lobbyService.onPlayerJoined().subscribe(({ players, maxPlayers }) => {
        this.roomPlayers = players;
        this.maxPlayers = maxPlayers;
        this.joining = false;
        // If we joined via code and don't have roomCode yet, grab it
        if (!this.roomCode && this.joinCode) {
          this.roomCode = this.joinCode;
        }
        // Host is the first player in the list
        this.isHost = players.length > 0 && players[0].id === this.socketService.getSocketId();
      })
    );

    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe((data) => {
        this.gameStarted = true;
        this.lobbyService.lastGameStartData = data;
        const code = this.roomCode || this.joinCode;
        this.router.navigate(['/multiplayer/game', this.gameType, code]);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  createRoom(): void {
    this.error = '';
    this.lobbyService.createRoom(this.gameType, this.playerName.trim());
  }

  joinRoom(): void {
    this.error = '';
    this.joining = true;
    this.lobbyService.joinRoom(this.joinCode.trim(), this.playerName.trim());
  }

  get displayGameType(): string {
    const names: Record<string, string> = {
      'poker-holdem': "Texas Hold'em",
      'tic-tac-toe': 'Tic-Tac-Toe',
      'connect-four': 'Connect Four',
      'go-fish': 'Go Fish'
    };
    return names[this.gameType] || this.gameType;
  }

  get isMultiPlayerGame(): boolean {
    return ['poker', 'poker-holdem', 'blackjack', 'farkle', 'yahtzee', 'go-fish'].includes(this.gameType);
  }

  get isPokerGame(): boolean {
    return this.gameType === 'poker' || this.gameType === 'poker-holdem';
  }

  get maxAiBots(): number {
    return Math.max(0, this.maxPlayers - this.roomPlayers.length);
  }

  get canStart(): boolean {
    return this.isHost && (this.roomPlayers.length + this.aiCount) >= 2;
  }

  startGame(): void {
    const isChipGame = this.gameType === 'poker' || this.gameType === 'poker-holdem' || this.gameType === 'blackjack';
    const playerChips = isChipGame
      ? { [this.socketService.getSocketId()]: this.wallet.getBalance('chips') }
      : undefined;
    this.lobbyService.startGame(this.roomCode, this.aiCount, playerChips);
  }

  goBack(): void {
    this.router.navigate(['/multiplayer']);
  }
}

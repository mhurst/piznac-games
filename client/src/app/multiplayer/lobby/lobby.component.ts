import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LobbyService } from '../../core/lobby.service';
import { UserService } from '../../core/user.service';
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

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private lobbyService: LobbyService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.gameType = this.route.snapshot.paramMap.get('gameType') || '';

    // Pre-fill player name from stored user
    this.playerName = this.userService.getUserName();

    this.subscriptions.push(
      this.lobbyService.onRoomCreated().subscribe(({ roomCode }) => {
        this.roomCode = roomCode;
      })
    );

    this.subscriptions.push(
      this.lobbyService.onJoinError().subscribe(({ message }) => {
        this.error = message;
        this.joining = false;
      })
    );

    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe((data) => {
        console.log('LOBBY: game-start received!', data);
        this.gameStarted = true;
        this.lobbyService.lastGameStartData = data;
        const code = this.roomCode || this.joinCode;
        console.log('LOBBY: navigating to', '/multiplayer/game', this.gameType, code);
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

  goBack(): void {
    this.router.navigate(['/multiplayer']);
  }
}

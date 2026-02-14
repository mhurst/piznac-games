import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { UserService } from './core/user.service';
import { ChallengeService, Challenge } from './core/challenge.service';
import { LobbyService } from './core/lobby.service';
import { PresenceService } from './core/presence.service';
import { AudioService } from './core/audio/audio.service';
import { NameDialogComponent } from './shared/name-dialog/name-dialog.component';
import { ChallengeDialogComponent, ChallengeDialogResult } from './shared/challenge-dialog/challenge-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'client';
  private subscriptions: Subscription[] = [];
  private challengeDialogOpen = false;

  get userName(): string {
    return this.userService.getUserName();
  }

  get soundMuted(): boolean {
    return this.audioService.muted;
  }

  constructor(
    private userService: UserService,
    private challengeService: ChallengeService,
    private lobbyService: LobbyService,
    private presenceService: PresenceService,
    private audioService: AudioService,
    private dialog: MatDialog,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkUserAndConnect();
    this.setupChallengeListeners();
    this.setupNameErrorListener();
  }

  private setupNameErrorListener(): void {
    this.subscriptions.push(
      this.userService.nameError$.subscribe(error => {
        // Show name dialog again with error message
        this.showNameDialog(error.message);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private checkUserAndConnect(): void {
    console.log('checkUserAndConnect: hasUser =', this.userService.hasUser());
    if (!this.userService.hasUser()) {
      this.showNameDialog();
    } else {
      // Already have user, connect immediately
      console.log('User already exists, connecting as:', this.userService.getUserName());
      this.userService.connect();
      // Initialize audio (will work if user has interacted before)
      this.audioService.init();
    }
  }

  private showNameDialog(errorMessage?: string): void {
    const dialogRef = this.dialog.open(NameDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
      data: { error: errorMessage }
    });

    dialogRef.afterClosed().subscribe((name: string) => {
      console.log('Name dialog closed with:', name);
      if (name) {
        this.userService.setUser(name);
        this.userService.connect();
        // Initialize audio after user interaction (browser requirement)
        this.audioService.init();
      }
    });
  }

  private setupChallengeListeners(): void {
    // Listen for incoming challenges
    this.subscriptions.push(
      this.challengeService.challengeReceived$.subscribe(challenge => {
        this.audioService.playUI('challenge');
        this.showChallengeDialog(challenge);
      })
    );

    // Listen for challenge acceptance (navigate to game)
    this.subscriptions.push(
      this.challengeService.challengeAccepted$.subscribe(data => {
        this.audioService.playUI('game-start');
        if (data.lobbyMode) {
          // Poker challenges: go to lobby so host can add AI bots
          this.lobbyService.challengeLobbyData = {
            roomCode: data.roomCode,
            players: data.players,
            maxPlayers: data.maxPlayers || 6
          };
          this.router.navigate(['/multiplayer/lobby', data.gameType]);
        } else {
          // Store game start data for the game component
          this.lobbyService.lastGameStartData = {
            players: data.players,
            gameState: data.gameState
          };
          // Navigate to the game
          this.router.navigate(['/multiplayer/game', data.gameType, data.roomCode]);
        }
      })
    );
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  toggleSound(): void {
    // Initialize audio on first interaction if not already done
    this.audioService.init();
    this.audioService.toggleMute();
    // Play a click sound to confirm (if unmuting)
    if (!this.audioService.muted) {
      this.audioService.playUI('click');
    }
  }

  private showChallengeDialog(challenge: Challenge): void {
    // Avoid stacking multiple dialogs
    if (this.challengeDialogOpen) return;
    this.challengeDialogOpen = true;

    const dialogRef = this.dialog.open(ChallengeDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
      data: { challenge }
    });

    dialogRef.afterClosed().subscribe((result: ChallengeDialogResult | undefined) => {
      this.challengeDialogOpen = false;
      if (result) {
        if (result.accepted) {
          this.challengeService.acceptChallenge(result.challengeId);
        } else {
          this.challengeService.declineChallenge(result.challengeId);
        }
      }
    });
  }

  logout(): void {
    // Navigate home first (in case user is in a game)
    this.router.navigate(['/']);

    this.userService.logout();

    // Show name dialog for new user
    this.showNameDialog();
  }
}

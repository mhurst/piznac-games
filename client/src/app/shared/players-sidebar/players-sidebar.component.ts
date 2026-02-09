import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { PresenceService, OnlineUser } from '../../core/presence.service';
import { ChallengeService } from '../../core/challenge.service';
import { UserService } from '../../core/user.service';

@Component({
  selector: 'app-players-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule,
    MatSnackBarModule
  ],
  templateUrl: './players-sidebar.component.html',
  styleUrl: './players-sidebar.component.scss'
})
export class PlayersSidebarComponent implements OnInit, OnDestroy {
  users: OnlineUser[] = [];
  myId = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private presenceService: PresenceService,
    private challengeService: ChallengeService,
    private userService: UserService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.myId = this.userService.getSocketId();

    this.subscriptions.push(
      this.presenceService.users$.subscribe(users => {
        this.users = users;
        // Always update myId - socket ID can change after logout/login
        this.myId = this.userService.getSocketId();
      })
    );

    this.subscriptions.push(
      this.challengeService.challengeDeclined$.subscribe(({ declinedBy }) => {
        this.snackBar.open(`${declinedBy} declined your challenge`, 'OK', {
          duration: 3000
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  challenge(user: OnlineUser, gameType: string): void {
    this.challengeService.sendChallenge(user.id, gameType);
    this.snackBar.open(`Challenge sent to ${user.name}!`, 'OK', {
      duration: 2000
    });
  }

  isMe(user: OnlineUser): boolean {
    return user.id === this.myId;
  }

  getStatusTooltip(user: OnlineUser): string {
    if (this.isMe(user)) return 'You';
    if (user.status === 'in-game' && user.gameType) {
      return `Playing ${this.getGameName(user.gameType)}`;
    }
    return user.status === 'in-game' ? 'Currently in a game' : 'Available';
  }

  getGameIcon(gameType: string | null | undefined): string {
    const icons: Record<string, string> = {
      'tic-tac-toe': 'tag',
      'connect-four': 'view_comfy',
      'battleship': 'sailing',
      'checkers': 'grid_on',
      'war': 'style',
      'farkle': 'casino',
      'blackjack': 'style',
      'mancala': 'blur_circular'
    };
    return icons[gameType || ''] || 'sports_esports';
  }

  getGameName(gameType: string | null | undefined): string {
    const names: Record<string, string> = {
      'tic-tac-toe': 'Tic-Tac-Toe',
      'connect-four': 'Connect Four',
      'battleship': 'Battleship',
      'checkers': 'Checkers',
      'war': 'War',
      'farkle': 'Farkle',
      'blackjack': 'Blackjack',
      'mancala': 'Mancala'
    };
    return names[gameType || ''] || 'a game';
  }
}

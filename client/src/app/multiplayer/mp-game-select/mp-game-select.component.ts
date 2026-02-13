import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PlayersSidebarComponent } from '../../shared/players-sidebar/players-sidebar.component';

interface GameInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-mp-game-select',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, PlayersSidebarComponent],
  templateUrl: './mp-game-select.component.html',
  styleUrl: './mp-game-select.component.scss'
})
export class MpGameSelectComponent {
  games: GameInfo[] = [
    {
      id: 'tic-tac-toe',
      name: 'Tic-Tac-Toe',
      description: 'Classic 3x3 grid. Get three in a row to win!',
      icon: 'tag'
    },
    {
      id: 'connect-four',
      name: 'Connect Four',
      description: 'Drop discs to connect 4 in a row!',
      icon: 'view_comfy'
    },
    {
      id: 'battleship',
      name: 'Battleship',
      description: 'Sink your opponent\'s fleet!',
      icon: 'sailing'
    },
    {
      id: 'checkers',
      name: 'Checkers',
      description: 'Classic board game of strategy',
      icon: 'grid_on'
    },
    {
      id: 'war',
      name: 'War',
      description: 'Classic card game of luck',
      icon: 'style'
    },
    {
      id: 'farkle',
      name: 'Farkle',
      description: 'Push your luck! 2-4 players, first to 10,000!',
      icon: 'casino'
    },
    {
      id: 'blackjack',
      name: 'Blackjack',
      description: '2-4 players vs dealer!',
      icon: 'style'
    },
    {
      id: 'mancala',
      name: 'Mancala',
      description: 'Ancient strategy game for 2 players',
      icon: 'blur_circular'
    },
    {
      id: 'yahtzee',
      name: 'Yahtzee',
      description: '2-4 players, roll dice and fill your scorecard!',
      icon: 'casino'
    },
    {
      id: 'poker',
      name: 'Poker',
      description: "2-6 players, Dealer's Choice poker!",
      icon: 'style'
    },
    {
      id: 'poker-holdem',
      name: "Texas Hold'em",
      description: "2-6 players, No-limit Texas Hold'em!",
      icon: 'style'
    },
    {
      id: 'go-fish',
      name: 'Go Fish',
      description: '2-4 players, collect books of four!',
      icon: 'style'
    }
  ];

  constructor(private router: Router) {}

  selectGame(gameId: string): void {
    this.router.navigate(['/multiplayer/lobby', gameId]);
  }
}

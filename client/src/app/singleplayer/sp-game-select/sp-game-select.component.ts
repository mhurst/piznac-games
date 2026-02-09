import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface GameInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  comingSoon?: boolean;
}

@Component({
  selector: 'app-sp-game-select',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './sp-game-select.component.html',
  styleUrl: './sp-game-select.component.scss'
})
export class SpGameSelectComponent {
  games: GameInfo[] = [
    {
      id: 'tic-tac-toe',
      name: 'Tic-Tac-Toe',
      description: 'Play against AI - Easy, Medium, or Hard',
      icon: 'tag',
      comingSoon: false
    },
    {
      id: 'connect-four',
      name: 'Connect Four',
      description: 'Play against AI - Easy, Medium, or Hard',
      icon: 'view_comfy',
      comingSoon: false
    },
    {
      id: 'battleship',
      name: 'Battleship',
      description: 'Hunt and sink the AI\'s fleet!',
      icon: 'sailing',
      comingSoon: false
    },
    {
      id: 'checkers',
      name: 'Checkers',
      description: 'Outsmart the AI in this classic game',
      icon: 'grid_on',
      comingSoon: false
    },
    {
      id: 'war',
      name: 'War',
      description: 'Classic card game of luck',
      icon: 'style',
      comingSoon: false
    },
    {
      id: 'solitaire',
      name: 'Solitaire',
      description: 'Classic single-player card game',
      icon: 'style',
      comingSoon: false
    },
    {
      id: 'yahtzee',
      name: 'Yahtzee',
      description: 'Classic dice game — score big!',
      icon: 'casino',
      comingSoon: false
    },
    {
      id: 'farkle',
      name: 'Farkle',
      description: 'Push your luck dice game — first to 10,000!',
      icon: 'casino',
      comingSoon: false
    },
    {
      id: 'blackjack',
      name: 'Blackjack',
      description: 'Beat the dealer to 21!',
      icon: 'style',
      comingSoon: false
    },
    {
      id: 'mancala',
      name: 'Mancala',
      description: 'Ancient strategy game — capture the most stones!',
      icon: 'blur_circular',
      comingSoon: false
    },
    {
      id: 'darts',
      name: 'Darts',
      description: 'Throw darts at the board — test your aim!',
      icon: 'gps_fixed',
      comingSoon: false
    }
  ];

  get allComingSoon(): boolean {
    return this.games.length === 0 || this.games.every(g => g.comingSoon);
  }

  constructor(private router: Router) {}

  selectGame(game: GameInfo): void {
    if (game.comingSoon) return;
    this.router.navigate(['/singleplayer/game', game.id]);
  }
}

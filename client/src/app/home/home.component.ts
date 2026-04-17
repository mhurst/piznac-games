import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { RecentGame, RecentGamesService } from '../core/recent-games.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {
  recent: RecentGame[] = [];
  private sub?: Subscription;

  constructor(
    private router: Router,
    private recentGames: RecentGamesService
  ) {}

  ngOnInit(): void {
    this.sub = this.recentGames.recent$.subscribe(list => {
      this.recent = list.slice(0, 4);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  playGame(game: RecentGame): void {
    if (game.mode === 'sp') {
      this.router.navigate(['/singleplayer/game', game.id]);
    } else {
      this.router.navigate(['/multiplayer/lobby', game.id]);
    }
  }

  timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(2)}`;
  }
}

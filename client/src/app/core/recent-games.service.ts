import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, filter } from 'rxjs';

export interface RecentGame {
  id: string;
  name: string;
  icon: string;
  mode: 'sp' | 'mp';
  playedAt: number;
}

const GAME_META: Record<string, { name: string; icon: string }> = {
  'tic-tac-toe':  { name: 'Tic-Tac-Toe',   icon: 'tag' },
  'connect-four': { name: 'Connect Four',  icon: 'view_comfy' },
  'battleship':   { name: 'Battleship',    icon: 'sailing' },
  'checkers':     { name: 'Checkers',      icon: 'grid_on' },
  'war':          { name: 'War',           icon: 'style' },
  'solitaire':    { name: 'Solitaire',     icon: 'style' },
  'yahtzee':      { name: 'Yahtzee',       icon: 'casino' },
  'farkle':       { name: 'Farkle',        icon: 'casino' },
  'blackjack':    { name: 'Blackjack',     icon: 'style' },
  'mancala':      { name: 'Mancala',       icon: 'blur_circular' },
  'darts':        { name: 'Darts',         icon: 'gps_fixed' },
  'poker':        { name: 'Poker',         icon: 'style' },
  'poker-holdem': { name: "Texas Hold'em", icon: 'style' },
  'go-fish':      { name: 'Go Fish',       icon: 'style' },
  'chess':        { name: 'Chess',         icon: 'castle' },
  'spades':       { name: 'Spades',        icon: 'style' },
  'gin-rummy':    { name: 'Gin Rummy',     icon: 'style' },
  'backgammon':   { name: 'Backgammon',    icon: 'casino' },
  'anagrams':     { name: 'Anagrams',      icon: 'abc' },
  '2048':         { name: '2048',          icon: 'grid_4x4' },
  'wordle':       { name: 'Wordle',        icon: 'abc' },
};

@Injectable({ providedIn: 'root' })
export class RecentGamesService {
  private readonly KEY = 'recent_games_v1';
  private readonly MAX = 10;

  private games$ = new BehaviorSubject<RecentGame[]>([]);
  public recent$: Observable<RecentGame[]> = this.games$.asObservable();

  constructor(router: Router) {
    this.games$.next(this.loadStored());

    router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.onNavigation((e as NavigationEnd).urlAfterRedirects));
  }

  getRecent(n: number = 5): RecentGame[] {
    return this.games$.value.slice(0, n);
  }

  clear(): void {
    try { localStorage.removeItem(this.KEY); } catch { /* ignore */ }
    this.games$.next([]);
  }

  private onNavigation(url: string): void {
    const spMatch = url.match(/^\/singleplayer\/game\/([^/?]+)/);
    const mpMatch = url.match(/^\/multiplayer\/game\/([^/?]+)/);

    if (spMatch) this.record(spMatch[1], 'sp');
    else if (mpMatch) this.record(mpMatch[1], 'mp');
  }

  private record(id: string, mode: 'sp' | 'mp'): void {
    const meta = GAME_META[id];
    if (!meta) return;

    // Debounce: if the top entry is the same id+mode within 10 seconds, ignore
    // (avoids double-recording from accidental re-navigation).
    const current = this.games$.value;
    const top = current[0];
    const now = Date.now();
    if (top && top.id === id && top.mode === mode && now - top.playedAt < 10_000) {
      return;
    }

    const entry: RecentGame = {
      id,
      name: meta.name,
      icon: meta.icon,
      mode,
      playedAt: now
    };

    const next = [entry, ...current].slice(0, this.MAX);
    try { localStorage.setItem(this.KEY, JSON.stringify(next)); } catch { /* ignore */ }
    this.games$.next(next);
  }

  private loadStored(): RecentGame[] {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { Game2048Scene } from '../../../games/game-2048/game-2048.scene';
import {
  Board,
  Direction,
  createEmptyBoard,
  spawnRandomTile,
  move,
  hasReachedTile,
  canMove,
  WIN_TILE
} from '../../../games/game-2048/game-2048-logic';

const BEST_KEY = 'game2048_best';

@Component({
  selector: 'app-sp-game-2048',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './sp-game-2048.component.html',
  styleUrl: './sp-game-2048.component.scss'
})
export class SpGame2048Component implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: Game2048Scene;

  private board: Board = createEmptyBoard();
  private score = 0;
  private best = 0;
  private hasWonThisGame = false;
  private gameOver = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadBest();
  }

  ngAfterViewInit(): void {
    this.scene = new Game2048Scene();
    this.scene.onReady = () => {
      this.startNewGame();
    };
    this.scene.onMove = (dir: Direction) => this.handleMove(dir);
    this.scene.onNewGame = () => {
      this.scene.hideOverlay();
      this.startNewGame();
    };
    this.scene.onContinueAfterWin = () => {
      this.scene.hideOverlay();
      this.scene.setInputEnabled(true);
    };
    this.scene.onBackToMenu = () => {
      this.scene.hideOverlay();
      this.leaveGame();
    };

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 680,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
  }

  private startNewGame(): void {
    this.board = createEmptyBoard();
    this.score = 0;
    this.hasWonThisGame = false;
    this.gameOver = false;

    // Spawn two starting tiles
    const first = spawnRandomTile(this.board);
    this.board = first.board;
    const second = spawnRandomTile(this.board);
    this.board = second.board;

    this.scene.setBoard(this.board);
    this.scene.updateScore(this.score, this.best);
    this.scene.setInputEnabled(true);
  }

  private handleMove(dir: Direction): void {
    if (this.gameOver) return;

    const result = move(this.board, dir);
    if (!result.moved) return;

    this.board = result.board;
    this.score += result.scoreGained;

    const spawn = spawnRandomTile(this.board);
    this.board = spawn.board;

    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest();
    }

    this.scene.setBoard(this.board, spawn.spawned);
    this.scene.updateScore(this.score, this.best);

    if (!this.hasWonThisGame && hasReachedTile(this.board, WIN_TILE)) {
      this.hasWonThisGame = true;
      const prevBest = this.best === this.score ? this.score : this.best;
      const isNewHigh = this.score >= prevBest;
      this.scene.showWin(this.score, this.best, isNewHigh);
      return;
    }

    if (!canMove(this.board)) {
      this.gameOver = true;
      const isNewHigh = this.score === this.best;
      this.scene.showGameOver(this.score, this.best, isNewHigh);
    }
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  private loadBest(): void {
    try {
      this.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    } catch {
      this.best = 0;
    }
  }

  private saveBest(): void {
    try {
      localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      // ignore
    }
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}

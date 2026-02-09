import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { DartsScene } from '../../../games/darts/darts.scene';

@Component({
  selector: 'app-sp-darts',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './sp-darts.component.html',
  styleUrl: './sp-darts.component.scss'
})
export class SpDartsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: DartsScene;

  constructor(private router: Router) {}

  ngAfterViewInit(): void {
    this.scene = new DartsScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}

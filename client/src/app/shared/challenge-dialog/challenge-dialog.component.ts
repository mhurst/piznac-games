import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Challenge } from '../../core/challenge.service';

export interface ChallengeDialogData {
  challenge: Challenge;
}

export interface ChallengeDialogResult {
  accepted: boolean;
  challengeId: string;
}

@Component({
  selector: 'app-challenge-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './challenge-dialog.component.html',
  styleUrl: './challenge-dialog.component.scss'
})
export class ChallengeDialogComponent {
  challenge: Challenge;

  constructor(
    private dialogRef: MatDialogRef<ChallengeDialogComponent, ChallengeDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ChallengeDialogData
  ) {
    this.challenge = data.challenge;
    // Prevent closing by clicking outside
    this.dialogRef.disableClose = true;
  }

  getGameName(gameType: string): string {
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
    return names[gameType] || gameType;
  }

  accept(): void {
    this.dialogRef.close({
      accepted: true,
      challengeId: this.challenge.id
    });
  }

  decline(): void {
    this.dialogRef.close({
      accepted: false,
      challengeId: this.challenge.id
    });
  }
}

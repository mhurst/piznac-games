import { Component, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';

export interface NameDialogData {
  error?: string;
}

@Component({
  selector: 'app-name-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule
  ],
  templateUrl: './name-dialog.component.html',
  styleUrl: './name-dialog.component.scss'
})
export class NameDialogComponent {
  playerName = '';
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<NameDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: NameDialogData
  ) {
    // Prevent closing by clicking outside or pressing Escape
    this.dialogRef.disableClose = true;

    if (data?.error) {
      this.errorMessage = data.error;
    }
  }

  submit(): void {
    const name = this.playerName.trim();
    if (name) {
      this.errorMessage = '';  // Clear error on submit
      this.dialogRef.close(name);
    }
  }
}

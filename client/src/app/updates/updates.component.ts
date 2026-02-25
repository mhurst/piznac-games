import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UPDATE_NOTES, UpdateNote } from './update-notes';

@Component({
  selector: 'app-updates',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './updates.component.html',
  styleUrl: './updates.component.scss'
})
export class UpdatesComponent {
  notes: UpdateNote[] = UPDATE_NOTES;

  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/']);
  }
}

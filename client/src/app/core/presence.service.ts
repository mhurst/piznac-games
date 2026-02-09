import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SocketService } from './socket.service';

export interface OnlineUser {
  id: string;
  name: string;
  status: 'available' | 'in-game';
  currentRoom: string | null;
  gameType?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class PresenceService {
  private usersSubject = new BehaviorSubject<OnlineUser[]>([]);
  users$: Observable<OnlineUser[]> = this.usersSubject.asObservable();

  constructor(private socketService: SocketService) {
    this.setupListeners();
  }

  private setupListeners(): void {
    console.log('PresenceService: setting up listeners');

    // Full user list on connect
    this.socketService.on<OnlineUser[]>('user-list').subscribe(users => {
      console.log('PresenceService: received user-list', users);
      this.usersSubject.next(users);
    });

    // New user joined
    this.socketService.on<OnlineUser>('user-joined').subscribe(user => {
      const current = this.usersSubject.value;
      if (!current.find(u => u.id === user.id)) {
        this.usersSubject.next([...current, user]);
      }
    });

    // User left
    this.socketService.on<{ id: string }>('user-left').subscribe(({ id }) => {
      const current = this.usersSubject.value;
      this.usersSubject.next(current.filter(u => u.id !== id));
    });

    // User status changed
    this.socketService.on<{ id: string; status: 'available' | 'in-game'; gameType?: string | null }>('user-status').subscribe(({ id, status, gameType }) => {
      const current = this.usersSubject.value;
      this.usersSubject.next(
        current.map(u => u.id === id ? { ...u, status, gameType: gameType ?? null } : u)
      );
    });
  }

  getUsers(): OnlineUser[] {
    return this.usersSubject.value;
  }
}

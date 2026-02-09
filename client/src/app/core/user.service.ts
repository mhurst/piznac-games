import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { SocketService } from './socket.service';
import { PresenceService } from './presence.service';
import { ChallengeService } from './challenge.service';

export interface StoredUser {
  name: string;
}

const STORAGE_KEY = 'piznac-user';

export interface NameError {
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private currentUser: StoredUser | null = null;
  private initialized = false;  // Only true after first explicit connect() call
  private lastSocketId: string | null = null;

  private nameErrorSubject = new Subject<NameError>();
  private nameAcceptedSubject = new Subject<string>();

  nameError$: Observable<NameError> = this.nameErrorSubject.asObservable();
  nameAccepted$: Observable<string> = this.nameAcceptedSubject.asObservable();

  constructor(
    private socketService: SocketService,
    private presenceService: PresenceService,  // Ensures listeners ready before reconnect
    private challengeService: ChallengeService  // Ensures listeners ready before reconnect
  ) {
    this.loadUser();
    this.setupReconnectHandler();
    this.setupNameListeners();
  }

  private setupNameListeners(): void {
    this.socketService.on<NameError>('name-error').subscribe(error => {
      console.log('UserService: name-error received', error);
      // Clear the invalid user
      this.currentUser = null;
      localStorage.removeItem(STORAGE_KEY);
      this.nameErrorSubject.next(error);
    });

    this.socketService.on<{ name: string }>('name-accepted').subscribe(({ name }) => {
      console.log('UserService: name-accepted', name);
      this.nameAcceptedSubject.next(name);
    });
  }

  private setupReconnectHandler(): void {
    // Re-announce user on socket reconnection (only after app is initialized)
    this.socketService.onConnect().subscribe(() => {
      const currentSocketId = this.socketService.getSocketId();
      console.log('UserService: socket connected, id =', currentSocketId, 'initialized =', this.initialized);

      // Only re-announce if:
      // 1. App was properly initialized (connect() was called)
      // 2. Socket ID changed (actual reconnection, not initial connect)
      if (this.initialized && this.currentUser && this.lastSocketId && this.lastSocketId !== currentSocketId) {
        console.log('UserService: re-announcing user after reconnect');
        this.socketService.emit('user-connect', { name: this.currentUser.name });
        this.lastSocketId = currentSocketId;
      }
    });
  }

  private loadUser(): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
      } catch {
        this.currentUser = null;
      }
    }
  }

  hasUser(): boolean {
    return this.currentUser !== null && !!this.currentUser.name;
  }

  getUser(): StoredUser | null {
    return this.currentUser;
  }

  getUserName(): string {
    return this.currentUser?.name || '';
  }

  setUser(name: string): void {
    this.currentUser = { name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentUser));
  }

  connect(): void {
    console.log('UserService.connect() called, currentUser =', this.currentUser);
    if (this.currentUser) {
      if (this.socketService.isConnected()) {
        this.doConnect();
      } else {
        // Wait for socket to connect first
        console.log('UserService: waiting for socket connection...');
        this.socketService.onConnect().pipe(take(1)).subscribe(() => {
          this.doConnect();
        });
      }
    } else {
      console.warn('UserService.connect() called but no current user!');
    }
  }

  private doConnect(): void {
    if (!this.currentUser) return;
    this.initialized = true;
    this.lastSocketId = this.socketService.getSocketId();
    console.log('UserService: initializing with socket id =', this.lastSocketId);
    this.socketService.emit('user-connect', { name: this.currentUser.name });
  }

  getSocketId(): string {
    return this.socketService.getSocketId();
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUser = null;
    this.initialized = false;
    this.lastSocketId = null;
    // Disconnect socket so server properly removes us from user list
    // Then immediately reconnect so it's ready for the new user
    this.socketService.disconnect();
    this.socketService.reconnect();
  }
}

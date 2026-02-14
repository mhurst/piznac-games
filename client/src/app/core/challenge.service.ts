import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SocketService } from './socket.service';

export interface Challenge {
  id: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  gameType: string;
  timestamp: number;
}

export interface ChallengeAcceptedData {
  challengeId: string;
  roomCode: string;
  gameType: string;
  players: { id: string; name: string }[];
  gameState: any;
  lobbyMode?: boolean;
  maxPlayers?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChallengeService {
  private pendingChallengesSubject = new BehaviorSubject<Challenge[]>([]);
  pendingChallenges$: Observable<Challenge[]> = this.pendingChallengesSubject.asObservable();

  private challengeReceivedSubject = new Subject<Challenge>();
  challengeReceived$: Observable<Challenge> = this.challengeReceivedSubject.asObservable();

  private challengeAcceptedSubject = new Subject<ChallengeAcceptedData>();
  challengeAccepted$: Observable<ChallengeAcceptedData> = this.challengeAcceptedSubject.asObservable();

  private challengeDeclinedSubject = new Subject<{ challengeId: string; declinedBy: string }>();
  challengeDeclined$: Observable<{ challengeId: string; declinedBy: string }> = this.challengeDeclinedSubject.asObservable();

  constructor(private socketService: SocketService) {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Incoming challenge
    this.socketService.on<Challenge>('challenge-received').subscribe(challenge => {
      const current = this.pendingChallengesSubject.value;
      this.pendingChallengesSubject.next([...current, challenge]);
      this.challengeReceivedSubject.next(challenge);
    });

    // Challenge we sent was confirmed
    this.socketService.on<Challenge>('challenge-sent').subscribe(challenge => {
      console.log('Challenge sent:', challenge);
    });

    // Challenge was accepted
    this.socketService.on<ChallengeAcceptedData>('challenge-accepted').subscribe(data => {
      // Remove from pending
      const current = this.pendingChallengesSubject.value;
      this.pendingChallengesSubject.next(current.filter(c => c.id !== data.challengeId));
      this.challengeAcceptedSubject.next(data);
    });

    // Challenge was declined
    this.socketService.on<{ challengeId: string; declinedBy: string }>('challenge-declined').subscribe(data => {
      // Remove from pending
      const current = this.pendingChallengesSubject.value;
      this.pendingChallengesSubject.next(current.filter(c => c.id !== data.challengeId));
      this.challengeDeclinedSubject.next(data);
    });
  }

  sendChallenge(toId: string, gameType: string): void {
    this.socketService.emit('send-challenge', { toId, gameType });
  }

  acceptChallenge(challengeId: string): void {
    this.socketService.emit('accept-challenge', { challengeId });
    // Remove from local pending list
    const current = this.pendingChallengesSubject.value;
    this.pendingChallengesSubject.next(current.filter(c => c.id !== challengeId));
  }

  declineChallenge(challengeId: string): void {
    this.socketService.emit('decline-challenge', { challengeId });
    // Remove from local pending list
    const current = this.pendingChallengesSubject.value;
    this.pendingChallengesSubject.next(current.filter(c => c.id !== challengeId));
  }

  getPendingChallenges(): Challenge[] {
    return this.pendingChallengesSubject.value;
  }
}

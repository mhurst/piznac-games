import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { LobbyComponent } from './lobby.component';
import { LobbyService } from '../../core/lobby.service';
import { Subject } from 'rxjs';

describe('LobbyComponent', () => {
  let component: LobbyComponent;
  let fixture: ComponentFixture<LobbyComponent>;
  let routerSpy: jasmine.SpyObj<Router>;
  let lobbyServiceSpy: jasmine.SpyObj<LobbyService>;
  let roomCreatedSubject: Subject<{ roomCode: string }>;
  let joinErrorSubject: Subject<{ message: string }>;
  let gameStartSubject: Subject<any>;
  let opponentDisconnectedSubject: Subject<void>;

  beforeEach(async () => {
    roomCreatedSubject = new Subject();
    joinErrorSubject = new Subject();
    gameStartSubject = new Subject();
    opponentDisconnectedSubject = new Subject();

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    lobbyServiceSpy = jasmine.createSpyObj('LobbyService', [
      'createRoom',
      'joinRoom',
      'onRoomCreated',
      'onJoinError',
      'onGameStart',
      'onOpponentDisconnected'
    ]);
    lobbyServiceSpy.onRoomCreated.and.returnValue(roomCreatedSubject.asObservable());
    lobbyServiceSpy.onJoinError.and.returnValue(joinErrorSubject.asObservable());
    lobbyServiceSpy.onGameStart.and.returnValue(gameStartSubject.asObservable());
    lobbyServiceSpy.onOpponentDisconnected.and.returnValue(opponentDisconnectedSubject.asObservable());
    lobbyServiceSpy.lastGameStartData = null;

    await TestBed.configureTestingModule({
      imports: [LobbyComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: LobbyService, useValue: lobbyServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => key === 'gameType' ? 'tic-tac-toe' : null
              }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LobbyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize gameType from route', () => {
    expect(component.gameType).toBe('tic-tac-toe');
  });

  describe('createRoom', () => {
    it('should call lobbyService.createRoom with correct params', () => {
      component.playerName = '  TestPlayer  ';
      component.createRoom();
      expect(lobbyServiceSpy.createRoom).toHaveBeenCalledWith('tic-tac-toe', 'TestPlayer');
    });

    it('should clear error before creating room', () => {
      component.error = 'Previous error';
      component.playerName = 'Test';
      component.createRoom();
      expect(component.error).toBe('');
    });
  });

  describe('joinRoom', () => {
    it('should call lobbyService.joinRoom with correct params', () => {
      component.playerName = '  Player2  ';
      component.joinCode = '  abcd  ';
      component.joinRoom();
      expect(lobbyServiceSpy.joinRoom).toHaveBeenCalledWith('abcd', 'Player2');
    });

    it('should set joining to true', () => {
      component.playerName = 'Test';
      component.joinCode = 'ABCD';
      component.joinRoom();
      expect(component.joining).toBe(true);
    });

    it('should clear error before joining', () => {
      component.error = 'Previous error';
      component.playerName = 'Test';
      component.joinCode = 'ABCD';
      component.joinRoom();
      expect(component.error).toBe('');
    });
  });

  describe('goBack', () => {
    it('should navigate to home', () => {
      component.goBack();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('socket event handlers', () => {
    it('should set roomCode when room is created', () => {
      roomCreatedSubject.next({ roomCode: 'XYZ1' });
      expect(component.roomCode).toBe('XYZ1');
    });

    it('should set error and joining=false on join error', () => {
      component.joining = true;
      joinErrorSubject.next({ message: 'Room not found' });
      expect(component.error).toBe('Room not found');
      expect(component.joining).toBe(false);
    });

    it('should navigate to game on game start', () => {
      component.roomCode = 'ABCD';
      const gameData = { players: [], gameState: {} };
      gameStartSubject.next(gameData);
      expect(component.gameStarted).toBe(true);
      expect(lobbyServiceSpy.lastGameStartData).toEqual(gameData);
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/game', 'tic-tac-toe', 'ABCD']);
    });

    it('should use joinCode if roomCode is not set', () => {
      component.joinCode = 'WXYZ';
      component.roomCode = '';
      gameStartSubject.next({ players: [], gameState: {} });
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/game', 'tic-tac-toe', 'WXYZ']);
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from all subscriptions', () => {
      component.ngOnDestroy();
      // Emit after destroy - should not cause errors
      expect(() => roomCreatedSubject.next({ roomCode: 'TEST' })).not.toThrow();
    });
  });

  describe('template', () => {
    it('should show lobby options when not in room and not joining', () => {
      component.roomCode = '';
      component.joining = false;
      fixture.detectChanges();
      const options = fixture.nativeElement.querySelector('.lobby-options');
      expect(options).toBeTruthy();
    });

    it('should show waiting room when roomCode is set', () => {
      component.roomCode = 'ABCD';
      component.gameStarted = false;
      fixture.detectChanges();
      const waiting = fixture.nativeElement.querySelector('.waiting-room');
      expect(waiting).toBeTruthy();
      expect(waiting.textContent).toContain('Waiting for opponent');
    });

    it('should show joining message when joining', () => {
      component.joining = true;
      fixture.detectChanges();
      const waiting = fixture.nativeElement.querySelector('.waiting-room');
      expect(waiting.textContent).toContain('Joining room');
    });

    it('should show error when set', () => {
      component.error = 'Test error';
      fixture.detectChanges();
      const error = fixture.nativeElement.querySelector('.error');
      expect(error.textContent).toContain('Test error');
    });

    it('should disable create button when name is empty', () => {
      component.playerName = '   ';
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-create');
      expect(btn.disabled).toBe(true);
    });

    it('should disable join button when name or code is empty', () => {
      component.playerName = 'Test';
      component.joinCode = '';
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-join');
      expect(btn.disabled).toBe(true);
    });
  });
});

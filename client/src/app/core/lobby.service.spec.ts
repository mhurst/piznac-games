import { TestBed } from '@angular/core/testing';
import { LobbyService } from './lobby.service';
import { SocketService } from './socket.service';
import { Subject } from 'rxjs';

describe('LobbyService', () => {
  let service: LobbyService;
  let socketServiceSpy: jasmine.SpyObj<SocketService>;
  let eventSubjects: { [key: string]: Subject<any> };

  beforeEach(() => {
    eventSubjects = {
      'room-created': new Subject(),
      'join-error': new Subject(),
      'game-start': new Subject(),
      'opponent-disconnected': new Subject()
    };

    socketServiceSpy = jasmine.createSpyObj('SocketService', ['emit', 'on']);
    socketServiceSpy.on.and.callFake((event: string) => {
      if (!eventSubjects[event]) {
        eventSubjects[event] = new Subject();
      }
      return eventSubjects[event].asObservable();
    });

    TestBed.configureTestingModule({
      providers: [
        LobbyService,
        { provide: SocketService, useValue: socketServiceSpy }
      ]
    });
    service = TestBed.inject(LobbyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createRoom', () => {
    it('should emit create-room event with gameType and playerName', () => {
      service.createRoom('tic-tac-toe', 'Player1');
      expect(socketServiceSpy.emit).toHaveBeenCalledWith('create-room', {
        gameType: 'tic-tac-toe',
        playerName: 'Player1'
      });
    });
  });

  describe('joinRoom', () => {
    it('should emit join-room event with roomCode and playerName', () => {
      service.joinRoom('ABCD', 'Player2');
      expect(socketServiceSpy.emit).toHaveBeenCalledWith('join-room', {
        roomCode: 'ABCD',
        playerName: 'Player2'
      });
    });
  });

  describe('onRoomCreated', () => {
    it('should return observable that emits room code', (done) => {
      service.onRoomCreated().subscribe((data) => {
        expect(data.roomCode).toBe('XYZ1');
        done();
      });
      eventSubjects['room-created'].next({ roomCode: 'XYZ1' });
    });
  });

  describe('onJoinError', () => {
    it('should return observable that emits error message', (done) => {
      service.onJoinError().subscribe((data) => {
        expect(data.message).toBe('Room not found');
        done();
      });
      eventSubjects['join-error'].next({ message: 'Room not found' });
    });
  });

  describe('onGameStart', () => {
    it('should return observable that emits game start data', (done) => {
      const gameData = {
        players: [{ id: '1', name: 'P1' }],
        gameState: { board: [] }
      };
      service.onGameStart().subscribe((data) => {
        expect(data).toEqual(gameData);
        done();
      });
      eventSubjects['game-start'].next(gameData);
    });
  });

  describe('onOpponentDisconnected', () => {
    it('should return observable that emits on disconnect', (done) => {
      service.onOpponentDisconnected().subscribe(() => {
        expect(true).toBe(true);
        done();
      });
      eventSubjects['opponent-disconnected'].next(undefined);
    });
  });

  describe('lastGameStartData', () => {
    it('should store and retrieve game start data', () => {
      const data = { players: [], gameState: {} } as any;
      service.lastGameStartData = data;
      expect(service.lastGameStartData).toBe(data);
    });

    it('should be null by default', () => {
      const freshService = new LobbyService(socketServiceSpy);
      expect(freshService.lastGameStartData).toBeNull();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { GameStateService } from './game-state.service';
import { SocketService } from './socket.service';
import { Subject } from 'rxjs';

describe('GameStateService', () => {
  let service: GameStateService;
  let socketServiceSpy: jasmine.SpyObj<SocketService>;
  let eventSubjects: { [key: string]: Subject<any> };

  beforeEach(() => {
    eventSubjects = {
      'move-made': new Subject(),
      'invalid-move': new Subject(),
      'game-over': new Subject(),
      'rematch-requested': new Subject()
    };

    socketServiceSpy = jasmine.createSpyObj('SocketService', ['emit', 'on', 'getSocketId']);
    socketServiceSpy.on.and.callFake((event: string) => {
      if (!eventSubjects[event]) {
        eventSubjects[event] = new Subject();
      }
      return eventSubjects[event].asObservable();
    });
    socketServiceSpy.getSocketId.and.returnValue('test-id');

    TestBed.configureTestingModule({
      providers: [
        GameStateService,
        { provide: SocketService, useValue: socketServiceSpy }
      ]
    });
    service = TestBed.inject(GameStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('makeMove', () => {
    it('should emit make-move event with roomCode and move', () => {
      service.makeMove('ABCD', 4);
      expect(socketServiceSpy.emit).toHaveBeenCalledWith('make-move', {
        roomCode: 'ABCD',
        move: 4
      });
    });
  });

  describe('requestRematch', () => {
    it('should emit request-rematch event with roomCode', () => {
      service.requestRematch('ABCD');
      expect(socketServiceSpy.emit).toHaveBeenCalledWith('request-rematch', {
        roomCode: 'ABCD'
      });
    });
  });

  describe('onMoveMade', () => {
    it('should return observable that emits move data', (done) => {
      const moveData = {
        playerId: 'p1',
        move: 5,
        gameState: { board: ['X', null, null] }
      };
      service.onMoveMade().subscribe((data) => {
        expect(data).toEqual(moveData);
        done();
      });
      eventSubjects['move-made'].next(moveData);
    });
  });

  describe('onInvalidMove', () => {
    it('should return observable that emits error message', (done) => {
      service.onInvalidMove().subscribe((data) => {
        expect(data.message).toBe('Not your turn');
        done();
      });
      eventSubjects['invalid-move'].next({ message: 'Not your turn' });
    });
  });

  describe('onGameOver', () => {
    it('should return observable with winner data', (done) => {
      const gameOverData = {
        winner: 'player1',
        winningLine: [0, 1, 2],
        isDraw: false
      };
      service.onGameOver().subscribe((data) => {
        expect(data).toEqual(gameOverData);
        done();
      });
      eventSubjects['game-over'].next(gameOverData);
    });

    it('should return observable with draw data', (done) => {
      const gameOverData = {
        winner: null,
        winningLine: null,
        isDraw: true
      };
      service.onGameOver().subscribe((data) => {
        expect(data.isDraw).toBe(true);
        expect(data.winner).toBeNull();
        done();
      });
      eventSubjects['game-over'].next(gameOverData);
    });
  });

  describe('onRematchRequested', () => {
    it('should return observable that emits player id', (done) => {
      service.onRematchRequested().subscribe((data) => {
        expect(data.playerId).toBe('opponent-id');
        done();
      });
      eventSubjects['rematch-requested'].next({ playerId: 'opponent-id' });
    });
  });

  describe('getMySocketId', () => {
    it('should return socket id from SocketService', () => {
      const id = service.getMySocketId();
      expect(id).toBe('test-id');
      expect(socketServiceSpy.getSocketId).toHaveBeenCalled();
    });
  });
});

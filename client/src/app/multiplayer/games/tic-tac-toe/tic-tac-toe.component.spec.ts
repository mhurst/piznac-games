import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TicTacToeComponent } from './tic-tac-toe.component';
import { SocketService } from '../../core/socket.service';
import { GameStateService } from '../../core/game-state.service';
import { LobbyService } from '../../core/lobby.service';
import { Subject } from 'rxjs';
import { ElementRef } from '@angular/core';

describe('TicTacToeComponent', () => {
  let component: TicTacToeComponent;
  let fixture: ComponentFixture<TicTacToeComponent>;
  let routerSpy: jasmine.SpyObj<Router>;
  let socketServiceSpy: jasmine.SpyObj<SocketService>;
  let gameStateServiceSpy: jasmine.SpyObj<GameStateService>;
  let lobbyServiceSpy: jasmine.SpyObj<LobbyService>;

  let stateResponseSubject: Subject<any>;
  let moveMadeSubject: Subject<any>;
  let gameOverSubject: Subject<any>;
  let gameStartSubject: Subject<any>;
  let rematchRequestedSubject: Subject<any>;
  let opponentDisconnectedSubject: Subject<void>;

  beforeEach(async () => {
    stateResponseSubject = new Subject();
    moveMadeSubject = new Subject();
    gameOverSubject = new Subject();
    gameStartSubject = new Subject();
    rematchRequestedSubject = new Subject();
    opponentDisconnectedSubject = new Subject();

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    socketServiceSpy = jasmine.createSpyObj('SocketService', ['emit', 'on', 'getSocketId', 'disconnect']);
    socketServiceSpy.getSocketId.and.returnValue('my-socket-id');
    socketServiceSpy.on.and.callFake((event: string) => {
      if (event === 'state-response') return stateResponseSubject.asObservable();
      return new Subject().asObservable();
    });

    gameStateServiceSpy = jasmine.createSpyObj('GameStateService', [
      'makeMove',
      'requestRematch',
      'onMoveMade',
      'onInvalidMove',
      'onGameOver',
      'onRematchRequested'
    ]);
    gameStateServiceSpy.onMoveMade.and.returnValue(moveMadeSubject.asObservable());
    gameStateServiceSpy.onInvalidMove.and.returnValue(new Subject<{ message: string }>().asObservable());
    gameStateServiceSpy.onGameOver.and.returnValue(gameOverSubject.asObservable());
    gameStateServiceSpy.onRematchRequested.and.returnValue(rematchRequestedSubject.asObservable());

    lobbyServiceSpy = jasmine.createSpyObj('LobbyService', ['onGameStart', 'onOpponentDisconnected']);
    lobbyServiceSpy.onGameStart.and.returnValue(gameStartSubject.asObservable());
    lobbyServiceSpy.onOpponentDisconnected.and.returnValue(opponentDisconnectedSubject.asObservable());
    lobbyServiceSpy.lastGameStartData = null;

    await TestBed.configureTestingModule({
      imports: [TicTacToeComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: SocketService, useValue: socketServiceSpy },
        { provide: GameStateService, useValue: gameStateServiceSpy },
        { provide: LobbyService, useValue: lobbyServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => key === 'roomId' ? 'TEST' : null
              }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TicTacToeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have gameOver initially false', () => {
    expect(component.gameOver).toBe(false);
  });

  it('should have rematchRequested initially false', () => {
    expect(component.rematchRequested).toBe(false);
  });

  describe('requestRematch', () => {
    it('should set rematchRequested to true', () => {
      component.requestRematch();
      expect(component.rematchRequested).toBe(true);
    });

    it('should call gameStateService.requestRematch', () => {
      // We need to set roomCode first via ngAfterViewInit
      // For this test, we'll call directly with empty roomCode
      component.requestRematch();
      expect(gameStateServiceSpy.requestRematch).toHaveBeenCalled();
    });
  });

  describe('leaveGame', () => {
    it('should disconnect socket', () => {
      component.leaveGame();
      expect(socketServiceSpy.disconnect).toHaveBeenCalled();
    });

    it('should navigate to home', () => {
      component.leaveGame();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('ngOnDestroy', () => {
    it('should not throw on destroy', () => {
      fixture.detectChanges();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('template', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should have game-container', () => {
      const container = fixture.nativeElement.querySelector('.game-container');
      expect(container).toBeTruthy();
    });

    it('should have game-canvas element', () => {
      const canvas = fixture.nativeElement.querySelector('.game-canvas');
      expect(canvas).toBeTruthy();
    });

    it('should have leave game button', () => {
      const btn = fixture.nativeElement.querySelector('.btn-leave');
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain('Leave Game');
    });

    it('should not show rematch button when game not over', () => {
      component.gameOver = false;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      expect(btn).toBeFalsy();
    });

    it('should show rematch button when game over', () => {
      component.gameOver = true;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      expect(btn).toBeTruthy();
    });

    it('should show "Rematch" text when not requested', () => {
      component.gameOver = true;
      component.rematchRequested = false;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      expect(btn.textContent).toContain('Rematch');
    });

    it('should show waiting text when rematch requested', () => {
      component.gameOver = true;
      component.rematchRequested = true;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      expect(btn.textContent).toContain('Waiting for opponent');
    });

    it('should disable rematch button when requested', () => {
      component.gameOver = true;
      component.rematchRequested = true;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      expect(btn.disabled).toBe(true);
    });

    it('should call leaveGame on button click', () => {
      spyOn(component, 'leaveGame');
      const btn = fixture.nativeElement.querySelector('.btn-leave');
      btn.click();
      expect(component.leaveGame).toHaveBeenCalled();
    });

    it('should call requestRematch on button click', () => {
      spyOn(component, 'requestRematch');
      component.gameOver = true;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.btn-rematch');
      btn.click();
      expect(component.requestRematch).toHaveBeenCalled();
    });
  });
});

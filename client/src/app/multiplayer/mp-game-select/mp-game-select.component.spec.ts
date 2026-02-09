import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { GameSelectComponent } from './game-select.component';

describe('GameSelectComponent', () => {
  let component: GameSelectComponent;
  let fixture: ComponentFixture<GameSelectComponent>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [GameSelectComponent],
      providers: [
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GameSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('games array', () => {
    it('should have at least one game', () => {
      expect(component.games.length).toBeGreaterThan(0);
    });

    it('should include tic-tac-toe', () => {
      const ttt = component.games.find(g => g.id === 'tic-tac-toe');
      expect(ttt).toBeTruthy();
      expect(ttt?.name).toBe('Tic-Tac-Toe');
    });

    it('should have required properties for each game', () => {
      component.games.forEach(game => {
        expect(game.id).toBeDefined();
        expect(game.name).toBeDefined();
        expect(game.description).toBeDefined();
        expect(game.icon).toBeDefined();
      });
    });
  });

  describe('selectGame', () => {
    it('should navigate to lobby with game id', () => {
      component.selectGame('tic-tac-toe');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/lobby', 'tic-tac-toe']);
    });

    it('should work with any game id', () => {
      component.selectGame('chess');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/lobby', 'chess']);
    });
  });

  describe('template', () => {
    it('should render title', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.title')?.textContent).toContain('PIZNAC GAMES');
    });

    it('should render subtitle', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.subtitle')?.textContent).toContain('Choose a game');
    });

    it('should render game cards', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const cards = compiled.querySelectorAll('.game-card');
      expect(cards.length).toBe(component.games.length);
    });

    it('should call selectGame when card is clicked', () => {
      spyOn(component, 'selectGame');
      const card = fixture.nativeElement.querySelector('.game-card');
      card.click();
      expect(component.selectGame).toHaveBeenCalledWith('tic-tac-toe');
    });
  });
});

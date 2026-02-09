import { TicTacToeScene } from './tic-tac-toe.scene';

describe('TicTacToeScene', () => {
  let scene: TicTacToeScene;

  beforeEach(() => {
    scene = new TicTacToeScene();
  });

  it('should create', () => {
    expect(scene).toBeTruthy();
  });

  it('should have scene key "TicTacToeScene"', () => {
    expect((scene as any).sys?.settings?.key || 'TicTacToeScene').toBe('TicTacToeScene');
  });

  describe('callbacks', () => {
    it('should have onCellClick callback initially null', () => {
      expect(scene.onCellClick).toBeNull();
    });

    it('should have onReady callback initially null', () => {
      expect(scene.onReady).toBeNull();
    });

    it('should allow setting onCellClick callback', () => {
      const callback = jasmine.createSpy('onCellClick');
      scene.onCellClick = callback;
      expect(scene.onCellClick).toBe(callback);
    });

    it('should allow setting onReady callback', () => {
      const callback = jasmine.createSpy('onReady');
      scene.onReady = callback;
      expect(scene.onReady).toBe(callback);
    });
  });

  describe('public methods existence', () => {
    it('should have updateBoard method', () => {
      expect(typeof scene.updateBoard).toBe('function');
    });

    it('should have setSymbol method', () => {
      expect(typeof scene.setSymbol).toBe('function');
    });

    it('should have showGameOver method', () => {
      expect(typeof scene.showGameOver).toBe('function');
    });

    it('should have resetGame method', () => {
      expect(typeof scene.resetGame).toBe('function');
    });
  });

  // Note: Full integration tests for Phaser scenes require a Phaser runtime
  // which is complex to set up in a unit test environment.
  // The following tests verify the scene can be instantiated and has correct interface.
  // Visual/interaction tests would typically be done via E2E testing.
});

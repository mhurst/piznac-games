import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';

describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SocketService]
    });
    service = TestBed.inject(SocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getSocketId', () => {
    it('should return a string', () => {
      const id = service.getSocketId();
      expect(typeof id).toBe('string');
    });
  });

  describe('emit', () => {
    it('should not throw when emitting an event', () => {
      expect(() => service.emit('test-event', { foo: 'bar' })).not.toThrow();
    });

    it('should not throw when emitting without data', () => {
      expect(() => service.emit('test-event')).not.toThrow();
    });
  });

  describe('on', () => {
    it('should return an observable', () => {
      const result = service.on('test-event');
      expect(result.subscribe).toBeDefined();
    });

    it('should clean up listener on unsubscribe', () => {
      const subscription = service.on('test-event').subscribe();
      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should not throw when disconnecting', () => {
      expect(() => service.disconnect()).not.toThrow();
    });
  });
});

import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  private connectSubject = new Subject<void>();

  constructor() {
    this.socket = io(environment.apiUrl);

    this.socket.on('connect', () => {
      console.log('SOCKET: connected as', this.socket.id);
      this.connectSubject.next();
    });

    this.socket.on('disconnect', () => {
      console.log('SOCKET: disconnected');
    });

    this.socket.onAny((event: string, ...args: any[]) => {
      console.log(`SOCKET EVENT: ${event}`, args);
    });
  }

  onConnect(): Observable<void> {
    return this.connectSubject.asObservable();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  reconnect(): void {
    this.socket.connect();
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  emit(event: string, data?: any): void {
    console.log(`SOCKET EMIT: ${event}`, data);
    this.socket.emit(event, data);
  }

  on<T>(event: string): Observable<T> {
    return new Observable<T>(observer => {
      const handler = (data: T) => {
        observer.next(data);
      };
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }

  getSocketId(): string {
    return this.socket.id || '';
  }
}

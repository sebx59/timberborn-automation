import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  // Use a BehaviorSubject so subscribers instantly get the latest state
  private statesSubject = new BehaviorSubject<{ [key: string]: boolean }>({});
  private gameContextSubject = new BehaviorSubject<{name: string, startTime: number} | null>(null);
  private historySubject = new BehaviorSubject<{ name: string, state: boolean, relativeTime: number }[]>([]);
  private tagsSubject = new BehaviorSubject<{ [key: string]: string[] }>({});

  constructor() {
    // Connect to the Node.js server
    this.socket = io();

    // Listen for the initial/switched game context map from the server
    this.socket.on('gameContext', (ctx: { name: string, startTime: number, states: { [key: string]: boolean }, history?: any[], tags?: { [key: string]: string[] } }) => {
      this.gameContextSubject.next({ name: ctx.name, startTime: ctx.startTime });
      this.statesSubject.next(ctx.states);
      this.historySubject.next(ctx.history || []);
      this.tagsSubject.next(ctx.tags || {});
    });

    this.socket.on('tagsUpdate', (tags: { [key: string]: string[] }) => {
      this.tagsSubject.next(tags);
    });

    // Listen for clear/require game event
    this.socket.on('requireGame', () => {
      this.gameContextSubject.next(null);
      this.statesSubject.next({});
      this.historySubject.next([]);
      this.tagsSubject.next({});
    });

    // Listen for individual state updates
    this.socket.on('stateUpdate', (update: { name: string, state: boolean, relativeTime?: number }) => {
      const currentStates = this.statesSubject.value;
      const newStates = { ...currentStates, [update.name]: update.state };
      this.statesSubject.next(newStates);
      
      if (update.relativeTime !== undefined) {
        const currentHistory = this.historySubject.value;
        this.historySubject.next([...currentHistory, { name: update.name, state: update.state, relativeTime: update.relativeTime }]);
      }
    });
  }

  // Expose the state as an observable
  getStates(): Observable<{ [key: string]: boolean }> {
    return this.statesSubject.asObservable();
  }

  getGameContext(): Observable<{name: string, startTime: number} | null> {
    return this.gameContextSubject.asObservable();
  }

  getHistory(): Observable<{ name: string, state: boolean, relativeTime: number }[]> {
    return this.historySubject.asObservable();
  }

  getTags(): Observable<{ [key: string]: string[] }> {
    return this.tagsSubject.asObservable();
  }

  setGame(name: string) {
    this.socket.emit('setGame', name);
  }

  addTag(stateName: string, tag: string) {
    this.socket.emit('addTag', { stateName, tag });
  }

  removeTag(stateName: string, tag: string) {
    this.socket.emit('removeTag', { stateName, tag });
  }


}

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
  private gameContextSubject = new BehaviorSubject<{ name: string, startTime: number } | null>(null);
  private historySubject = new BehaviorSubject<{ name: string, state: boolean, relativeTime: number }[]>([]);
  private tagsSubject = new BehaviorSubject<{ [key: string]: string[] }>({});
  private labelsSubject = new BehaviorSubject<{ [key: string]: string }>({});
  private missingStatesSubject = new BehaviorSubject<string[]>([]);
  private leversSubject = new BehaviorSubject<{ [key: string]: { state: boolean, springReturn: boolean } }>({});
  private leverLabelsSubject = new BehaviorSubject<{ [key: string]: string }>({});
  private leverTagsSubject = new BehaviorSubject<{ [key: string]: string[] }>({});
  private leverHistorySubject = new BehaviorSubject<{ name: string, state: boolean, relativeTime: number }[]>([]);
  private configSubject = new BehaviorSubject<{ baseApiUrl: string }>({ baseApiUrl: '' });
  private rulesSubject = new BehaviorSubject<any[]>([]);
  syncError$ = new BehaviorSubject<string | null>(null);
  leverSyncError$ = new BehaviorSubject<string | null>(null);

  constructor() {
    // Connect to the Node.js server
    this.socket = io();

    // Listen for the initial/switched game context map from the server
    this.socket.on('gameContext', (ctx: any) => {
      this.gameContextSubject.next({ name: ctx.name, startTime: ctx.startTime });
      this.statesSubject.next(ctx.states || {});
      this.historySubject.next(ctx.history || []);
      this.tagsSubject.next(ctx.tags || {});
      this.labelsSubject.next(ctx.labels || {});
      this.leversSubject.next(ctx.levers || {});
      this.leverLabelsSubject.next(ctx.leverLabels || {});
      this.leverTagsSubject.next(ctx.leverTags || {});
      this.leverHistorySubject.next(ctx.leverHistory || []);
    });

    this.socket.on('tagsUpdate', (tags: { [key: string]: string[] }) => {
      this.tagsSubject.next(tags);
    });

    this.socket.on('leverTagsUpdate', (tags: { [key: string]: string[] }) => {
      this.leverTagsSubject.next(tags);
    });

    this.socket.on('labelsUpdate', (labels: { [key: string]: string }) => {
      this.labelsSubject.next(labels);
    });

    this.socket.on('leversUpdate', (data: { name: string, levers: { [key: string]: { state: boolean, springReturn: boolean } }, historyUpdate?: { name: string, state: boolean, relativeTime: number } }) => {
      this.leversSubject.next(data.levers);
      if (data.historyUpdate) {
        const currentHistory = this.leverHistorySubject.value;
        this.leverHistorySubject.next([...currentHistory, data.historyUpdate]);
      }
    });

    this.socket.on('leverLabelsUpdate', (labels: { [key: string]: string }) => {
      this.leverLabelsSubject.next(labels);
    });

    this.socket.on('leverUpdate', (update: { name: string, state: boolean, relativeTime?: number }) => {
      console.log('Received individual leverUpdate:', update);
      const currentLevers = { ...this.leversSubject.value };
      if (currentLevers[update.name]) {
        currentLevers[update.name] = { ...currentLevers[update.name], state: update.state };
        this.leversSubject.next(currentLevers);
      }
      if (update.relativeTime !== undefined) {
        const currentHistory = [...this.leverHistorySubject.value];
        currentHistory.push({ name: update.name, state: update.state, relativeTime: update.relativeTime });
        this.leverHistorySubject.next(currentHistory);
      }
    });

    this.socket.on('syncLeversError', (msg: string) => {
      this.leverSyncError$.next(msg);
    });

    // Listen for clear/require game event
    this.socket.on('requireGame', () => {
      this.gameContextSubject.next(null);
      this.statesSubject.next({});
      this.historySubject.next([]);
      this.tagsSubject.next({});
      this.labelsSubject.next({});
      this.missingStatesSubject.next([]);
      this.leversSubject.next({});
      this.leverLabelsSubject.next({});
      this.leverTagsSubject.next({});
      this.leverHistorySubject.next([]);
    });

    this.socket.on('configUpdate', (config: { baseApiUrl: string }) => {
      this.configSubject.next(config);
    });

    this.socket.on('rulesUpdate', (rules: any[]) => {
      this.rulesSubject.next(rules);
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
    this.socket.on('stateDeleted', (stateName: string) => {
      const currentStates = { ...this.statesSubject.value };
      delete currentStates[stateName];
      this.statesSubject.next(currentStates);

      const currentTags = { ...this.tagsSubject.value };
      delete currentTags[stateName];
      this.tagsSubject.next(currentTags);

      const currentHistory = this.historySubject.value.filter(h => h.name !== stateName);
      this.historySubject.next(currentHistory);

      const currentLabels = { ...this.labelsSubject.value };
      delete currentLabels[stateName];
      this.labelsSubject.next(currentLabels);

      // Remove from missing list if it was there
      const missing = this.missingStatesSubject.value.filter(n => n !== stateName);
      this.missingStatesSubject.next(missing);
    });

    this.socket.on('syncResult', (result: { added: { name: string, state: boolean, relativeTime: number }[], missingStates: string[] }) => {
      if (result.added.length > 0) {
        const currentStates = { ...this.statesSubject.value };
        const currentHistory = [...this.historySubject.value];
        for (const s of result.added) {
          currentStates[s.name] = s.state;
          currentHistory.push({ name: s.name, state: s.state, relativeTime: s.relativeTime });
        }
        this.statesSubject.next(currentStates);
        this.historySubject.next(currentHistory);
      }
      this.missingStatesSubject.next(result.missingStates);
      this.syncError$.next(null);
    });

    this.socket.on('syncError', (msg: string) => {
      this.syncError$.next(msg);
    });
  }

  // Expose the state as an observable
  getStates(): Observable<{ [key: string]: boolean }> {
    return this.statesSubject.asObservable();
  }

  getGameContext(): Observable<{ name: string, startTime: number } | null> {
    return this.gameContextSubject.asObservable();
  }

  getHistory(): Observable<{ name: string, state: boolean, relativeTime: number }[]> {
    return this.historySubject.asObservable();
  }

  getTags(): Observable<{ [key: string]: string[] }> {
    return this.tagsSubject.asObservable();
  }

  getLabels(): Observable<{ [key: string]: string }> {
    return this.labelsSubject.asObservable();
  }

  getMissingStates(): Observable<string[]> {
    return this.missingStatesSubject.asObservable();
  }

  getLevers(): Observable<{ [key: string]: { state: boolean, springReturn: boolean } }> {
    return this.leversSubject.asObservable();
  }

  getLeverLabels(): Observable<{ [key: string]: string }> {
    return this.leverLabelsSubject.asObservable();
  }

  getLeverTags(): Observable<{ [key: string]: string[] }> {
    return this.leverTagsSubject.asObservable();
  }

  getLeverHistory(): Observable<{ name: string, state: boolean, relativeTime: number }[]> {
    return this.leverHistorySubject.asObservable();
  }

  getConfig(): Observable<{ baseApiUrl: string }> {
    return this.configSubject.asObservable();
  }

  updateConfig(baseApiUrl: string) {
    this.socket.emit('updateConfig', { baseApiUrl });
  }

  getRules(): Observable<any[]> {
    return this.rulesSubject.asObservable();
  }

  getRulesOnce(): any[] {
    return this.rulesSubject.value;
  }

  updateRules(rules: any[]) {
    this.socket.emit('updateRules', rules);
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

  deleteState(stateName: string) {
    this.socket.emit('deleteState', stateName);
  }

  setLabel(stateName: string, label: string) {
    this.socket.emit('setLabel', { stateName, label });
  }

  syncAdapters() {
    this.socket.emit('syncAdapters');
  }

  syncLevers() {
    this.socket.emit('syncLevers');
  }

  setLeverLabel(leverName: string, label: string) {
    this.socket.emit('setLeverLabel', { leverName, label });
  }

  addLeverTag(leverName: string, tag: string) {
    this.socket.emit('addLeverTag', { leverName, tag });
  }

  removeLeverTag(leverName: string, tag: string) {
    this.socket.emit('removeLeverTag', { leverName, tag });
  }

  toggleLever(name: string, state: boolean) {
    this.socket.emit('toggleLever', { name, state });
  }

  toggleState(name: string, state: boolean) {
    this.socket.emit('toggleState', { name, state });
  }

}

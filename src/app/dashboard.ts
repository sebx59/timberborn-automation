import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SocketService } from './socket.service';
import { HistoryModalComponent } from './history-modal';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HistoryModalComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  states: { [key: string]: boolean } = {};
  tags: { [key: string]: string[] } = {};
  labels: { [key: string]: string } = {};
  levers: { [key: string]: { state: boolean, springReturn: boolean } } = {};
  leverLabels: { [key: string]: string } = {};
  leverTags: { [key: string]: string[] } = {};
  missingStates: Set<string> = new Set();
  allTags: string[] = [];
  gameContext: { name: string, startTime: number } | null = null;
  gameNameInput: string = '';
  history: { name: string, state: boolean, relativeTime: number }[] = [];
  leverHistory: { name: string, state: boolean, relativeTime: number }[] = [];

  showHistoryModal = false;
  showTagModal = false;
  showLeverTagModal = false;
  showRenameModal = false;
  showLeverRenameModal = false;
  tagTargetState = '';
  tagTargetLever = '';
  tagInput = '';
  historyDisplayKeys: string[] | null = null;
  historySource: 'states' | 'levers' = 'states';
  renameTargetState = '';
  renameInput = '';
  renameTargetLever = '';
  renameLeverInput = '';
  isSyncing = false;
  isSyncingLevers = false;
  syncError: string | null = null;
  leverSyncError: string | null = null;
  objectKeys = Object.keys;
  collapsedCategories: { [key: string]: boolean } = {};

  constructor(
    private socketService: SocketService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Subscribe to real-time state updates
    this.socketService.getStates().subscribe((newStates) => {
      this.states = newStates;
      this.cdr.detectChanges(); // Force Angular to update the view
    });

    // Subscribe to game context
    this.socketService.getGameContext().subscribe((ctx) => {
      this.gameContext = ctx;
      if (!ctx) {
        this.closeHistoryModal();
      }
      this.cdr.detectChanges();
    });

    // Subscribe to history
    this.socketService.getHistory().subscribe((history) => {
      this.history = history;
      this.cdr.detectChanges();
    });

    // Subscribe to tags
    this.socketService.getTags().subscribe((tags) => {
      this.tags = tags;
      this.updateAllTags();
      this.cdr.detectChanges();
    });

    // Subscribe to labels
    this.socketService.getLabels().subscribe((labels) => {
      this.labels = labels;
      this.cdr.detectChanges();
    });

    // Subscribe to missing states
    this.socketService.getMissingStates().subscribe((missing) => {
      this.missingStates = new Set(missing);
      this.isSyncing = false;
      this.cdr.detectChanges();
    });

    // Subscribe to sync errors
    this.socketService.syncError$.subscribe((err) => {
      this.syncError = err;
      this.isSyncing = false;
      this.cdr.detectChanges();
    });

    // Subscribe to levers
    this.socketService.getLevers().subscribe((levers) => {
      this.levers = levers;
      this.isSyncingLevers = false;
      this.cdr.detectChanges();
    });

    // Subscribe to lever labels
    this.socketService.getLeverLabels().subscribe((labels) => {
      this.leverLabels = labels;
      this.cdr.detectChanges();
    });

    // Subscribe to lever sync errors
    this.socketService.leverSyncError$.subscribe((err) => {
      this.leverSyncError = err;
      this.isSyncingLevers = false;
      this.cdr.detectChanges();
    });

    // Subscribe to lever tags
    this.socketService.getLeverTags().subscribe(tags => {
      this.leverTags = tags;
      this.updateAllTags();
      this.cdr.detectChanges();
    });

    this.socketService.getLeverHistory().subscribe(history => {
      this.leverHistory = history;
      this.cdr.detectChanges();
    });

    this.socketService.syncError$.subscribe(err => {
      this.syncError = err;
      this.isSyncing = false;
      this.cdr.detectChanges();
    });
  }

  updateAllTags() {
    const tagSet = new Set<string>();
    Object.values(this.tags).forEach(arr => arr.forEach(t => tagSet.add(t)));
    Object.values(this.leverTags).forEach(arr => arr.forEach(t => tagSet.add(t)));
    this.allTags = Array.from(tagSet).sort();
  }

  get groupedStates(): { tag: string, states: string[] }[] {
    const groups: { [tag: string]: string[] } = {};
    const untagged: string[] = [];

    for (const stateName of this.objectKeys(this.states)) {
      const stateTags = this.tags[stateName] || [];
      if (stateTags.length === 0) {
        untagged.push(stateName);
      } else {
        stateTags.forEach(t => {
          if (!groups[t]) groups[t] = [];
          if (!groups[t].includes(stateName)) {
            groups[t].push(stateName);
          }
        });
      }
    }

    const sortFn = (a: string, b: string) => {
      const stateA = this.states[a] ? 1 : 0;
      const stateB = this.states[b] ? 1 : 0;
      if (stateA !== stateB) return stateB - stateA; // ON (1) before OFF (0)
      return a.localeCompare(b);
    };

    const result = Object.keys(groups).sort().map(t => ({ 
      tag: t, 
      states: groups[t].sort(sortFn) 
    }));
    
    if (untagged.length > 0) {
      result.push({ tag: 'Untagged', states: untagged.sort(sortFn) });
    }
    return result;
  }

  get groupedLevers(): { tag: string, levers: string[] }[] {
    const groups: { [tag: string]: string[] } = {};
    const untagged: string[] = [];

    for (const leverName of this.objectKeys(this.levers)) {
      const lTags = this.leverTags[leverName] || [];
      if (lTags.length === 0) {
        untagged.push(leverName);
      } else {
        lTags.forEach(tag => {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(leverName);
        });
      }
    }

    const sortFn = (a: string, b: string) => {
      const stateA = this.levers[a].state ? 1 : 0;
      const stateB = this.levers[b].state ? 1 : 0;
      if (stateA !== stateB) return stateB - stateA; // ON (1) before OFF (0)
      return a.localeCompare(b);
    };

    if (untagged.length > 0) {
      groups['Untagged'] = untagged;
    }

    return Object.entries(groups)
      .map(([tag, lg]) => ({ tag, levers: lg.sort(sortFn) }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  openTagModal(stateName: string) {
    this.tagTargetState = stateName;
    this.tagInput = '';
    this.showTagModal = true;
  }

  closeTagModal() {
    this.showTagModal = false;
  }

  toggleCategory(categoryName: string) {
    this.collapsedCategories[categoryName] = !this.collapsedCategories[categoryName];
  }

  confirmAddTag() {
    if (this.tagInput.trim() && this.tagTargetState) {
      this.socketService.addTag(this.tagTargetState, this.tagInput.trim());
    }
    this.closeTagModal();
  }

  openLeverTagModal(leverName: string) {
    this.tagTargetLever = leverName;
    this.tagInput = '';
    this.showLeverTagModal = true;
  }

  closeLeverTagModal() {
    this.showLeverTagModal = false;
  }

  confirmAddLeverTag() {
    if (this.tagInput.trim() && this.tagTargetLever) {
      this.socketService.addLeverTag(this.tagTargetLever, this.tagInput.trim());
    }
    this.closeLeverTagModal();
  }

  removeTag(stateName: string, tag: string) {
    this.socketService.removeTag(stateName, tag);
  }

  removeLeverTag(leverName: string, tag: string) {
    this.socketService.removeLeverTag(leverName, tag);
  }

  deleteState(stateName: string) {
    this.socketService.deleteState(stateName);
  }

  isMissing(stateName: string): boolean {
    return this.missingStates.has(stateName);
  }

  syncAdapters() {
    this.isSyncing = true;
    this.syncError = null;
    this.socketService.syncAdapters();
  }

  syncLevers() {
    this.isSyncingLevers = true;
    this.leverSyncError = null;
    this.socketService.syncLevers();
  }

  toggleLever(name: string) {
    const currentState = this.levers[name].state;
    this.socketService.toggleLever(name, !currentState);
  }

  toggleState(name: string) {
    const currentState = this.states[name];
    this.socketService.toggleState(name, !currentState);
  }

  getLabel(stateName: string): string {
    return this.labels[stateName] || stateName;
  }

  getLeverLabel(leverName: string): string {
    return this.leverLabels[leverName] || leverName;
  }

  openRenameModal(stateName: string) {
    this.renameTargetState = stateName;
    this.renameInput = this.labels[stateName] || stateName;
    this.showRenameModal = true;
  }

  closeRenameModal() {
    this.showRenameModal = false;
  }

  confirmRename() {
    const trimmed = this.renameInput.trim();
    if (trimmed && this.renameTargetState) {
      // If user reverts to the original name, clear the label
      const effectiveLabel = trimmed === this.renameTargetState ? '' : trimmed;
      this.socketService.setLabel(this.renameTargetState, effectiveLabel || this.renameTargetState);
    }
    this.closeRenameModal();
  }

  openLeverRenameModal(leverName: string) {
    this.renameTargetLever = leverName;
    this.renameLeverInput = this.leverLabels[leverName] || leverName;
    this.showLeverRenameModal = true;
  }

  closeLeverRenameModal() {
    this.showLeverRenameModal = false;
  }

  confirmLeverRename() {
    const trimmed = this.renameLeverInput.trim();
    if (trimmed && this.renameTargetLever) {
      const effectiveLabel = trimmed === this.renameTargetLever ? '' : trimmed;
      this.socketService.setLeverLabel(this.renameTargetLever, effectiveLabel || this.renameTargetLever);
    }
    this.closeLeverRenameModal();
  }

  openHistoryModal(tag?: string, source: 'states' | 'levers' = 'states') {
    this.historySource = source;
    if (tag) {
      const tagLower = tag.toLowerCase();
      const targetStates = source === 'states' ? this.states : this.levers;
      const targetTags = source === 'states' ? this.tags : this.leverTags;

      if (tagLower === 'untagged') {
        this.historyDisplayKeys = Object.keys(targetStates).filter(key => 
          !(targetTags[key]) || targetTags[key].length === 0
        );
      } else {
        this.historyDisplayKeys = Object.keys(targetStates).filter(key => 
          (targetTags[key] || []).some(t => t.toLowerCase() === tagLower)
        );
      }
    } else {
      this.historyDisplayKeys = null; // Show all
    }
    this.showHistoryModal = true;
  }

  getLeverStateMap(): { [key: string]: boolean } {
    const map: { [key: string]: boolean } = {};
    Object.keys(this.levers).forEach(key => {
      map[key] = this.levers[key].state;
    });
    return map;
  }

  closeHistoryModal() {
    this.showHistoryModal = false;
  }


  joinGame() {
    if (this.gameNameInput.trim()) {
      this.socketService.setGame(this.gameNameInput.trim());
    }
  }

  get hasVariables(): boolean {
    return this.objectKeys(this.states).length > 0;
  }
}

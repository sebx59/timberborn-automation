import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocketService } from './socket.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  states: { [key: string]: boolean } = {};
  tags: { [key: string]: string[] } = {};
  allTags: string[] = [];
  gameContext: {name: string, startTime: number} | null = null;
  gameNameInput: string = '';
  history: { name: string, state: boolean, relativeTime: number }[] = [];
  
  showHistoryModal = false;
  showTagModal = false;
  tagTargetState = '';
  tagInput = '';

  currentRelativeTime = 0;
  private timerInterval: any;
  objectKeys = Object.keys;
  collapsedCategories: { [key: string]: boolean } = {};

  constructor(
    private socketService: SocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to real-time state updates
    this.socketService.getStates().subscribe((newStates) => {
      this.states = newStates;
      this.cdr.detectChanges(); // Force Angular to update the view
    });

    // Subscribe to game context
    this.socketService.getGameContext().subscribe((ctx) => {
      this.gameContext = ctx;
      if (!ctx && this.timerInterval) {
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
  }

  updateAllTags() {
    const tagSet = new Set<string>();
    Object.values(this.tags).forEach(arr => arr.forEach(t => tagSet.add(t)));
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
    
    const result = Object.keys(groups).sort().map(t => ({ tag: t, states: groups[t] }));
    if (untagged.length > 0) {
      result.push({ tag: 'Untagged', states: untagged });
    }
    return result;
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

  removeTag(stateName: string, tag: string) {
    this.socketService.removeTag(stateName, tag);
  }

  openHistoryModal() {
    this.showHistoryModal = true;
    if (this.gameContext) {
      this.currentRelativeTime = Date.now() - this.gameContext.startTime;
    }
    this.timerInterval = setInterval(() => {
      if (this.gameContext) {
        this.currentRelativeTime = Date.now() - this.gameContext.startTime;
        this.cdr.detectChanges();
      }
    }, 100);
  }

  closeHistoryModal() {
    this.showHistoryModal = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  getTimelinePath(variableName: string, width: number, height: number): string {
    const events = this.history.filter(h => h.name === variableName).sort((a,b) => a.relativeTime - b.relativeTime);
    let path = '';
    let lastState = false; // default starting state
    let lastX = 0;
    
    // Scale X-axis based on current time. Avoid divide by zero
    const maxT = Math.max(1, this.currentRelativeTime);
    
    events.forEach(e => {
      const x = Math.min((e.relativeTime / maxT) * width, width);
      let y = lastState ? 5 : height - 5;
      
      // horizontal line to the event's time
      path += path ? ` L ${x},${y}` : `M 0,${y} L ${x},${y}`;
      
      // state changes, draw vertical line
      lastState = e.state;
      y = lastState ? 5 : height - 5;
      path += ` L ${x},${y}`;
      lastX = x;
    });
    
    // draw line to current time
    const finalY = lastState ? 5 : height - 5;
    path += path ? ` L ${width},${finalY}` : `M 0,${finalY} L ${width},${finalY}`;
    return path;
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

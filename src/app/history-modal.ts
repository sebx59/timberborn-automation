import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-history-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-modal.html',
  styleUrl: './history-modal.css'
})
export class HistoryModalComponent implements OnInit, OnDestroy {
  @Input() show = false;
  @Input() gameContext: { name: string, startTime: number } | null = null;
  @Input() history: { name: string, state: boolean, relativeTime: number }[] = [];
  @Input() states: { [key: string]: boolean } = {};
  @Input() labels: { [key: string]: string } = {};
  @Input() displayKeys: string[] | null = null;
  @Output() close = new EventEmitter<void>();

  currentRelativeTime = 0;
  private timerInterval: any;
  objectKeys = Object.keys;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
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

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  closeModal() {
    this.close.emit();
  }

  getTimelinePath(variableName: string, width: number, height: number): string {
    const events = this.history.filter(h => h.name === variableName).sort((a, b) => a.relativeTime - b.relativeTime);
    let path = '';
    let lastState = false; // default starting state
    
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
    });

    // draw line to current time
    const finalY = lastState ? 5 : height - 5;
    path += path ? ` L ${width},${finalY}` : `M 0,${finalY} L ${width},${finalY}`;
    return path;
  }

  get activeKeys(): string[] {
    return this.displayKeys || this.objectKeys(this.states);
  }

  get hasVariables(): boolean {
    return this.activeKeys.length > 0;
  }

  getLabel(key: string): string {
    return this.labels[key] || key;
  }
}

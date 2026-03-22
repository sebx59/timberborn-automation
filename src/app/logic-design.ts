import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SocketService } from './socket.service';
import { Subscription, combineLatest } from 'rxjs';

export interface LogicNode {
  id: string;
  type: 'state' | 'lever' | 'and' | 'or' | 'xor' | 'not';
  x: number;
  y: number;
  config?: { name?: string }; // technical name of state or lever
}

export interface LogicWire {
  id: string;
  fromNodeId: string;
  toId: string; // id of the destination node
  toParam?: 'in1' | 'in2'; // for operators with multiple inputs
}

export interface LogicGraph {
  tag: string;
  nodes: LogicNode[];
  wires: LogicWire[];
}

@Component({
  selector: 'app-logic-design',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './logic-design.html',
  styleUrl: './logic-design.css'
})
export class LogicDesignComponent implements OnInit, OnDestroy {
  tag = '';
  states: string[] = [];
  levers: string[] = [];
  stateLabels: { [key: string]: string } = {};
  leverLabels: { [key: string]: string } = {};
  
  // Real-time values
  currentStates: { [key: string]: boolean } = {};
  currentLevers: { [key: string]: { state: boolean, springReturn: boolean } } = {};
  
  // Logic Graph
  nodes: LogicNode[] = [];
  wires: LogicWire[] = [];
  
  // Interaction State
  draggingNode: LogicNode | null = null;
  dragOffset = { x: 0, y: 0 };
  
  pendingSource: string | null = null; // Node ID of the source for a new wire
  
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    this.tag = this.route.snapshot.paramMap.get('tag') || '';
    
    this.subscriptions.add(
      combineLatest([
        this.socketService.getStates(),
        this.socketService.getLevers(),
        this.socketService.getTags(),
        this.socketService.getLeverTags(),
        this.socketService.getLabels(),
        this.socketService.getLeverLabels(),
        this.socketService.getRules() // This will now emit LogicGraph[]
      ]).subscribe(([allStates, allLevers, stateTags, leverTags, labels, lLabels, allGraphs]) => {
        this.stateLabels = labels;
        this.leverLabels = lLabels;
        this.currentStates = allStates;
        this.currentLevers = allLevers;
        
        this.states = Object.keys(allStates).filter(s => 
          (stateTags[s] || []).includes(this.tag) || (this.tag === 'Untagged' && (!stateTags[s] || stateTags[s].length === 0))
        );
        
        this.levers = Object.keys(allLevers).filter(l => 
          (leverTags[l] || []).includes(this.tag) || (this.tag === 'Untagged' && (!leverTags[l] || leverTags[l].length === 0))
        );

        const myGraph = allGraphs.find((g: any) => g.tag === this.tag);
        if (myGraph) {
          this.nodes = myGraph.nodes || [];
          this.wires = myGraph.wires || [];
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  addOperator(type: 'and' | 'or' | 'xor' | 'not') {
    const node: LogicNode = {
      id: 'node_' + Date.now(),
      type,
      x: 100,
      y: 100
    };
    this.nodes.push(node);
  }

  addStateNode(stateName: string) {
    if (this.nodes.find(n => n.type === 'state' && n.config?.name === stateName)) return;
    const node: LogicNode = {
      id: 'node_' + Date.now(),
      type: 'state',
      x: 50,
      y: 50,
      config: { name: stateName }
    };
    this.nodes.push(node);
  }

  addLeverNode(leverName: string) {
    if (this.nodes.find(n => n.type === 'lever' && n.config?.name === leverName)) return;
    const node: LogicNode = {
      id: 'node_' + Date.now(),
      type: 'lever',
      x: 400,
      y: 50,
      config: { name: leverName }
    };
    this.nodes.push(node);
  }

  removeNode(id: string) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.wires = this.wires.filter(w => w.fromNodeId !== id && w.toId !== id);
    if (this.pendingSource === id) this.pendingSource = null;
  }

  onPortClick(nodeId: string, isOutput: boolean, param?: 'in1' | 'in2') {
    if (isOutput) {
      this.pendingSource = nodeId;
    } else if (this.pendingSource && this.pendingSource !== nodeId) {
      this.addWire(this.pendingSource, nodeId, param);
      this.pendingSource = null;
    }
  }

  addWire(fromNodeId: string, toNodeId: string, toParam?: 'in1' | 'in2') {
    // Check for cycles or existing wires
    if (this.wires.find(w => w.toId === toNodeId && w.toParam === toParam)) return;
    
    this.wires.push({
      id: 'wire_' + Date.now(),
      fromNodeId,
      toId: toNodeId,
      toParam
    });
  }

  removeWire(id: string) {
    this.wires = this.wires.filter(w => w.id !== id);
  }

  saveGraph() {
    const allGraphs = this.socketService.getRulesOnce();
    const otherGraphs = allGraphs.filter((g: any) => g.tag !== this.tag);
    this.socketService.updateRules([...otherGraphs, { tag: this.tag, nodes: this.nodes, wires: this.wires }]);
  }

  // Helper for SVG lines
  getWirePath(wire: LogicWire): string {
    const from = this.nodes.find(n => n.id === wire.fromNodeId);
    const to = this.nodes.find(n => n.id === wire.toId);
    if (!from || !to) return '';

    // Port offsets
    const fromX = from.x + 180;
    const fromY = from.y + 40;

    let toX = to.x;
    let toY = to.y + 40;

    if (to.type !== 'not' && to.type !== 'lever') {
        if (wire.toParam === 'in1') toY = to.y + 30;
        if (wire.toParam === 'in2') toY = to.y + 70;
    }

    const dx = Math.abs(toX - fromX) / 2;
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }

  isWireActive(wire: LogicWire): boolean {
    const from = this.nodes.find(n => n.id === wire.fromNodeId);
    if (!from) return false;
    
    // Evaluate the source node in isolation for visual feedback
    // In a real scenario, we'd use the full graph result, but this is a good first step.
    const allGraphs = this.socketService.getRulesOnce();
    const myGraph = allGraphs.find((g: any) => g.tag === this.tag);
    if (!myGraph) return false;

    // Recursive evaluation might be too heavy for UI, but let's try 
    // This is just for CSS glowing.
    return false; // For now
  }

  // Dragging Logic
  startDragging(event: MouseEvent, node: LogicNode) {
    this.draggingNode = node;
    this.dragOffset.x = event.clientX - node.x;
    this.dragOffset.y = event.clientY - node.y;
    event.stopPropagation();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.draggingNode) {
      this.draggingNode.x = event.clientX - this.dragOffset.x;
      this.draggingNode.y = event.clientY - this.dragOffset.y;
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.draggingNode = null;
  }

  goBack() {
    this.router.navigate(['/']);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocketService } from './socket.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './config.html',
  styleUrl: './config.css'
})
export class ConfigComponent implements OnInit {
  baseApiUrl = '';

  constructor(
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit() {
    this.socketService.getConfig().subscribe(config => {
      this.baseApiUrl = config.baseApiUrl;
    });
  }

  saveConfig() {
    if (this.baseApiUrl.trim()) {
      this.socketService.updateConfig(this.baseApiUrl.trim());
      // Optional: Navigate back to dashboard after save
      // this.router.navigate(['/']);
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }
}

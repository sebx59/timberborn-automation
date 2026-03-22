import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard';
import { ConfigComponent } from './config';
import { LogicDesignComponent } from './logic-design';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'config', component: ConfigComponent },
  { path: 'logic/:tag', component: LogicDesignComponent },
  { path: '**', redirectTo: '' }
];

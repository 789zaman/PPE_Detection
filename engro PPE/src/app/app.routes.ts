import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CamerasComponent } from './pages/cameras/cameras.component';
import { HistoryComponent } from './pages/history/history.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { SettingsCamerasComponent } from './pages/settings-cameras/settings-cameras.component';
import { ZoneEditorComponent } from './pages/zone-editor/zone-editor.component';
import { authGuard, guestGuard, manageGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'cameras', component: CamerasComponent, canActivate: [authGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [authGuard] },
  { path: 'settings/cameras', component: SettingsCamerasComponent, canActivate: [manageGuard] },
  { path: 'settings/zones', component: ZoneEditorComponent, canActivate: [manageGuard] },
  { path: '**', redirectTo: 'login' },
];

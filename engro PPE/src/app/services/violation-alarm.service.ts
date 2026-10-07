import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import {
  LogRow,
  LIVE_VIOLATION_TTL_MS,
  VIOLATION_SESSION_GAP_MS,
  isLiveViolationNow,
  isPpeAlarm,
  liveAlarms,
  violationSessionWorkerKey,
} from '../lib/safety-data';
import { PpeHubService } from '../core/signalr/ppe-hub.service';
import { AuthService } from '../core/auth/auth.service';

const BYPASS_KEY = 'ppe.detectionBypass';
const MUTE_KEY = 'ppe.alarmMuted';

/**
 * Siren rings once per person + PPE type after login / first live update.
 * Logout clears that memory so the next login can ring again.
 * Later pulses only keep boxes on screen.
 */
@Injectable({ providedIn: 'root' })
export class ViolationAlarmService implements OnDestroy {
  private readonly hub = inject(PpeHubService);
  private readonly auth = inject(AuthService);
  private readonly audio = new Audio('/assets/alarm.mp3');
  private readonly unlockClip = new Audio('/assets/alarm.mp3');
  private unlocked = false;
  private unlockHandler?: () => void;
  private playing = false;
  private readonly alarmedAt = new Map<string, number>();
  private watchTimer?: ReturnType<typeof setInterval>;
  private readonly subs = new Subscription();

  private readonly bypassSubject = new BehaviorSubject<boolean>(
    localStorage.getItem(BYPASS_KEY) === '1',
  );
  private readonly mutedSubject = new BehaviorSubject<boolean>(
    localStorage.getItem(MUTE_KEY) === '1',
  );
  private readonly ringingSubject = new BehaviorSubject<boolean>(false);

  readonly bypass$ = this.bypassSubject.asObservable();
  readonly muted$ = this.mutedSubject.asObservable();
  readonly ringing$ = this.ringingSubject.asObservable();

  constructor() {
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.audio.addEventListener('ended', () => {
      this.playing = false;
      this.ringingSubject.next(false);
    });
    this.unlockClip.preload = 'auto';
    this.unlockHandler = () => this.unlock();
    document.addEventListener('pointerdown', this.unlockHandler, { once: true, capture: true });
    document.addEventListener('keydown', this.unlockHandler, { once: true, capture: true });
    this.subs.add(this.hub.violationReceived$.subscribe((row) => this.noteLive(row)));
    this.subs.add(this.auth.sessionEnded$.subscribe(() => this.endListenSession()));
    this.watchTimer = setInterval(() => this.tick(), 250);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.watchTimer) clearInterval(this.watchTimer);
    if (this.unlockHandler) {
      document.removeEventListener('pointerdown', this.unlockHandler, true);
      document.removeEventListener('keydown', this.unlockHandler, true);
    }
    this.stopSiren();
  }

  get bypassEnabled() {
    return this.bypassSubject.value;
  }

  get muted() {
    return this.mutedSubject.value;
  }

  get ringing() {
    return this.ringingSubject.value;
  }

  setBypass(on: boolean) {
    this.bypassSubject.next(on);
    localStorage.setItem(BYPASS_KEY, on ? '1' : '0');
    if (on) {
      this.alarmedAt.clear();
      this.stopSiren();
    }
  }

  toggleBypass() {
    this.setBypass(!this.bypassEnabled);
  }

  setMuted(on: boolean) {
    this.mutedSubject.next(on);
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
    if (on) this.stopSiren();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  /** Call after login / first UI click so the browser allows audio. */
  unlockAudio() {
    this.unlock();
  }

  /** New login: forgotten keys so current violations can ring once again. */
  beginListenSession() {
    this.alarmedAt.clear();
    this.unlock();
  }

  /** Logout / session drop: stop sound and forget who already rang. */
  endListenSession() {
    this.alarmedAt.clear();
    this.stopSiren();
  }

  /** After dashboard load: ring once if anyone is still violating right now. */
  armFromLiveLogs(rows: LogRow[]) {
    if (this.bypassEnabled || this.muted) return;
    const now = Date.now();
    let shouldRing = false;
    for (const row of liveAlarms(rows)) {
      if (!this.canArm(row)) continue;
      if (!isLiveViolationNow(row, now, LIVE_VIOLATION_TTL_MS)) continue;
      const key = violationSessionWorkerKey(row);
      if (this.wasRecentlyArmed(key, now)) continue;
      this.alarmedAt.set(key, now);
      shouldRing = true;
    }
    if (shouldRing) this.playOnce();
  }

  /** User-initiated: unlock + resume the live siren, or play a short test chirp. */
  testRing() {
    this.unlock();
    if (this.playing) return;
    try {
      this.unlockClip.pause();
      this.unlockClip.loop = false;
      this.unlockClip.currentTime = 0;
      this.unlockClip.volume = 1;
      void this.unlockClip.play().catch(() => {
        this.unlocked = false;
      });
    } catch {
      /* ignore */
    }
  }

  /** First live event after login for a person+PPE rings once, including pulses. */
  noteLive(row: LogRow) {
    if (this.bypassEnabled || this.muted) return;
    if (!this.canArm(row)) return;

    const key = violationSessionWorkerKey(row);
    const now = Date.now();
    if (this.wasRecentlyArmed(key, now)) return;
    this.alarmedAt.set(key, now);
    this.playOnce();
  }

  /**
   * Overlay/log snapshot only. Must not keep or restart the siren.
   */
  syncFromLogs(_rows: LogRow[]) {
    if (this.bypassEnabled || this.muted) this.stopSiren();
  }

  private canArm(row: LogRow): boolean {
    if (!isPpeAlarm(row)) return false;
    if (row.type === 'Helmet' && row.helmetDetected === true) return false;
    return true;
  }

  private wasRecentlyArmed(key: string, now: number): boolean {
    const prev = this.alarmedAt.get(key) ?? 0;
    return now - prev < VIOLATION_SESSION_GAP_MS;
  }

  private tick() {
    if (this.bypassEnabled || this.muted) this.stopSiren();
  }

  private unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const clip = this.unlockClip;
    const prev = clip.volume;
    clip.volume = 0;
    clip.loop = false;
    void clip
      .play()
      .then(() => {
        clip.pause();
        clip.currentTime = 0;
        clip.volume = prev || 1;
      })
      .catch(() => {
        clip.volume = prev || 1;
        this.unlocked = false;
      });
  }

  private playOnce() {
    this.unlock();
    if (this.playing && !this.audio.paused) return;
    try {
      this.audio.loop = false;
      this.audio.volume = 1;
      this.audio.currentTime = 0;
      this.playing = true;
      this.ringingSubject.next(true);
      void this.audio.play().catch(() => {
        this.unlocked = false;
        this.playing = false;
        this.ringingSubject.next(false);
      });
    } catch {
      this.playing = false;
      this.ringingSubject.next(false);
    }
  }

  private stopSiren() {
    if (!this.playing && !this.ringingSubject.value) {
      this.audio.loop = false;
      return;
    }
    this.playing = false;
    this.ringingSubject.next(false);
    try {
      this.audio.loop = false;
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

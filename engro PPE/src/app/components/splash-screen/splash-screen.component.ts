import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  template: `
    <div class="splash" [class.splash-exit]="exiting" aria-live="polite">
      <div class="splash-glow"></div>
      <div class="splash-content">
        <img
          src="Image/engro-logo.png"
          alt="Engro Fertilizers"
          class="splash-logo"
        />
        <h1 class="splash-title">
          <span class="title-brand">Engro Fertilizer</span>
          <span class="title-sub">AI PPE detection</span>
        </h1>

        <div class="loader" aria-hidden="true">
          <div class="loader-track">
            <div class="loader-bar"></div>
          </div>
        </div>

        <p class="splash-powered">
          powered by <span class="epsilon">Epsilon</span>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .splash {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: grid;
        place-items: center;
        background: linear-gradient(
          145deg,
          #ffffff 0%,
          #ffffff 60%,
          color-mix(in srgb, #009559 55%, white) 100%
        );
        transition: opacity 0.55s ease, visibility 0.55s ease;
      }

      .splash-exit {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .splash-glow {
        position: absolute;
        width: min(70vw, 520px);
        height: min(70vw, 520px);
        border-radius: 999px;
        background: radial-gradient(circle, rgb(0 149 89 / 0.22), transparent 68%);
        filter: blur(8px);
        animation: splash-pulse 2.4s ease-in-out infinite;
      }

      .splash-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 2rem;
        animation: splash-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .splash-logo {
        display: block;
        width: min(72vw, 320px);
        height: auto;
        object-fit: contain;
        margin-bottom: 1.75rem;
        background: transparent;
      }

      .splash-title {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .title-brand {
        font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.7rem, 4.2vw, 2.55rem);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
        background: linear-gradient(135deg, #0f3d2c 0%, #009559 55%, #5bb534 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .title-sub {
        font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.95rem, 2.2vw, 1.2rem);
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #3f6b57;
      }

      .loader {
        width: min(72vw, 220px);
        margin: 1.35rem 0 1.1rem;
      }

      .loader-track {
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: color-mix(in srgb, #009559 16%, white);
      }

      .loader-bar {
        height: 100%;
        width: 40%;
        border-radius: 999px;
        background: linear-gradient(90deg, #5bb534, #009559, #5bb534);
        background-size: 200% 100%;
        animation: loader-slide 1.15s ease-in-out infinite, loader-shine 1.15s linear infinite;
      }

      .splash-powered {
        margin: 0;
        font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
        font-size: 0.9rem;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #5a7166;
      }

      .epsilon {
        color: #1565c0;
        font-weight: 700;
        letter-spacing: 0.12em;
      }

      @keyframes splash-rise {
        from {
          opacity: 0;
          transform: translateY(18px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes splash-pulse {
        0%,
        100% {
          transform: scale(0.92);
          opacity: 0.7;
        }
        50% {
          transform: scale(1.05);
          opacity: 1;
        }
      }

      @keyframes loader-slide {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(320%);
        }
      }

      @keyframes loader-shine {
        0% {
          background-position: 0% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
    `,
  ],
})
export class SplashScreenComponent implements OnInit, OnDestroy {
  @Output() done = new EventEmitter<void>();
  exiting = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit() {
    this.timers.push(
      setTimeout(() => {
        this.exiting = true;
      }, 5000),
      setTimeout(() => this.done.emit(), 5550),
    );
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
  }
}

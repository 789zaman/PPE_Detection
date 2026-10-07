import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, ScriptableContext, TooltipItem, registerables } from 'chart.js';
import { TrendRow } from '../../lib/safety-data';

Chart.register(...registerables);

@Component({
  selector: 'app-trend-chart',
  standalone: true,
  template: `
    <div class="surface-card animate-rise p-5">
      <div class="mb-4 flex items-baseline justify-between">
        <div>
          <h2 class="font-display text-base font-semibold">Violations Over Time</h2>
          <p class="text-xs text-muted-foreground">Daily detected PPE violations · last 14 days</p>
        </div>
        <span class="text-xs font-medium text-muted-foreground">Total {{ total }}</span>
      </div>
      <div class="h-[280px] w-full">
        <canvas #canvas></canvas>
      </div>
    </div>
  `,
})
export class TrendChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) data: TrendRow[] = [];
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;
  total = 0;

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    this.total = this.data.reduce((a, b) => a + b.total, 0);
    if (this.chart) this.render();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  private css(name: string, fallback: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private render() {
    const labels = this.data.map((d) => d.date);
    const cfg: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'All violations',
            data: this.data.map((d) => d.total),
            borderColor: this.css('--primary', '#009559'),
            backgroundColor: (ctx: ScriptableContext<'line'>) => {
              const { chart } = ctx;
              const { ctx: c, chartArea } = chart;
              if (!chartArea) return 'transparent';
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0, 'rgba(0, 149, 89, 0.45)');
              g.addColorStop(1, 'rgba(0, 149, 89, 0.02)');
              return g;
            },
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHitRadius: 18,
          },
          {
            label: 'Helmet',
            data: this.data.map((d) => d.Helmet),
            borderColor: this.css('--chart-2', '#5bb534'),
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
          {
            label: 'Gloves',
            data: this.data.map((d) => d.Gloves),
            borderColor: this.css('--chart-3', '#7ed957'),
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
          {
            label: 'Safety Glasses',
            data: this.data.map((d) => d.Glasses),
            borderColor: this.css('--chart-5', '#c44a3a'),
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
          {
            label: 'Arc Flash Suit',
            data: this.data.map((d) => d.ArcFlash),
            borderColor: this.css('--chart-4', '#e0a106'),
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
          {
            label: 'Arc Flash Shield',
            data: this.data.map((d) => d.ArcShield),
            borderColor: '#0d9488',
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
          {
            label: 'Boots',
            data: this.data.map((d) => d.Boots),
            borderColor: '#7c3aed',
            fill: false,
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointHitRadius: 16,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            backgroundColor: '#ffffff',
            titleColor: '#163528',
            bodyColor: '#163528',
            borderColor: '#cfe6d9',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              title: (items) => (items[0] ? `Date: ${items[0].label}` : ''),
              label: (item: TooltipItem<'line'>) => {
                const value = item.parsed.y ?? 0;
                const total = this.data[item.dataIndex]?.total || 1;
                if (item.dataset.label === 'All violations') {
                  return ` ${item.dataset.label}: ${value}`;
                }
                const pct = ((value / total) * 100).toFixed(1);
                return ` ${item.dataset.label}: ${value} (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: this.css('--muted-foreground', '#5a7166') },
            border: { display: false },
          },
          y: {
            grid: { color: this.css('--border', '#d7ebe1') },
            ticks: { font: { size: 11 }, color: this.css('--muted-foreground', '#5a7166') },
            border: { display: false },
          },
        },
        animation: { duration: 1200 },
      },
    };

    this.chart?.destroy();
    this.chart = new Chart(this.canvas.nativeElement, cfg);
  }
}

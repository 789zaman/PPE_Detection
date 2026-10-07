import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, TooltipItem, registerables } from 'chart.js';
import { TrendRow } from '../../lib/safety-data';

Chart.register(...registerables);

const DAILY_CHECKS = 240;

@Component({
  selector: 'app-compliance-chart',
  standalone: true,
  template: `
    <div class="surface-card animate-rise p-5">
      <div class="mb-4 flex items-baseline justify-between">
        <div>
          <h2 class="font-display text-base font-semibold">Compliance vs Violations</h2>
          <p class="text-xs text-muted-foreground">
            Daily PPE checks passed vs failed · {{ dailyChecks }} checks/day
          </p>
        </div>
        <span class="text-xs font-medium text-muted-foreground">Avg compliance {{ avg }}%</span>
      </div>
      <div class="h-[280px] w-full">
        <canvas #canvas></canvas>
      </div>
    </div>
  `,
})
export class ComplianceChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) data: TrendRow[] = [];
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;
  private rows: ReturnType<ComplianceChartComponent['buildRows']> = [];
  avg = '0.0';
  readonly dailyChecks = DAILY_CHECKS;

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    this.rows = this.buildRows();
    this.avg = (this.rows.reduce((a, b) => a + b.rate, 0) / (this.rows.length || 1)).toFixed(1);
    if (this.chart) this.render();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  private buildRows() {
    return this.data.map((d) => {
      const violations = d.total;
      const compliant = Math.max(DAILY_CHECKS - violations, 0);
      const total = compliant + violations || 1;
      return {
        date: d.date,
        Compliant: compliant,
        Violations: violations,
        rate: Number(((compliant / total) * 100).toFixed(1)),
        compliantPct: Number(((compliant / total) * 100).toFixed(1)),
        violationPct: Number(((violations / total) * 100).toFixed(1)),
      };
    });
  }

  private css(name: string, fallback: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private render() {
    this.rows = this.buildRows();
    const cfg: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.rows.map((r) => r.date),
        datasets: [
          {
            type: 'bar',
            label: 'Compliant',
            data: this.rows.map((r) => r.Compliant),
            backgroundColor: this.css('--primary', '#009559'),
            stack: 'a',
            yAxisID: 'y',
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 },
          },
          {
            type: 'bar',
            label: 'Violations',
            data: this.rows.map((r) => r.Violations),
            backgroundColor: this.css('--destructive', '#c44a3a'),
            stack: 'a',
            yAxisID: 'y',
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          },
          {
            type: 'line',
            label: 'Compliance %',
            data: this.rows.map((r) => r.rate),
            borderColor: this.css('--chart-2', '#5bb534'),
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHitRadius: 18,
            tension: 0.35,
            yAxisID: 'y1',
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
              label: (item: TooltipItem<'bar' | 'line'>) => {
                const row = this.rows[item.dataIndex];
                if (!row) return ` ${item.dataset.label}: ${item.parsed.y}`;
                if (item.dataset.label === 'Compliant') {
                  return ` Compliant: ${row.Compliant} (${row.compliantPct}%)`;
                }
                if (item.dataset.label === 'Violations') {
                  return ` Violations: ${row.Violations} (${row.violationPct}%)`;
                }
                return ` Compliance %: ${row.rate}%`;
              },
              afterBody: (items) => {
                const row = this.rows[items[0]?.dataIndex ?? -1];
                if (!row) return [];
                return [
                  '',
                  `Compliant %: ${row.compliantPct}%`,
                  `Violation %: ${row.violationPct}%`,
                  `Compliance %: ${row.rate}%`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11 }, color: this.css('--muted-foreground', '#5a7166') },
            border: { display: false },
          },
          y: {
            stacked: true,
            grid: { color: this.css('--border', '#d7ebe1') },
            ticks: { font: { size: 11 }, color: this.css('--muted-foreground', '#5a7166') },
            border: { display: false },
          },
          y1: {
            position: 'right',
            min: 80,
            max: 100,
            grid: { drawOnChartArea: false },
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

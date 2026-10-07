import { Injectable, signal } from '@angular/core';

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  type?: 'default' | 'success';
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<ToastItem[]>([]);

  show(title: string, description?: string, type: ToastItem['type'] = 'default') {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, title, description, type }]);
    setTimeout(() => this.dismiss(id), 3800);
  }

  success(title: string, description?: string) {
    this.show(title, description, 'success');
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}

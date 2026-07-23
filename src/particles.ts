// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * particles.ts — a tiny confetti burst on a full-screen canvas overlay. Juice only;
 * honours prefers-reduced-motion (the caller simply doesn't fire it).
 */

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
}

const COLORS = ['#ffb43a', '#ff7a45', '#ff4d7e', '#e94bd0', '#38e1d6', '#4aa3ff', '#ffd23f'];

export class Confetti {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bits: Bit[] = [];
  private raf = 0;
  private running = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'confetti';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /** Fire a burst from a normalized point (0..1 across the viewport). */
  burst(nx = 0.5, ny = 0.45, count = 90): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = nx * w;
    const cy = ny * h;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      this.bits.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 5 + Math.random() * 7,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
      });
    }
    if (!this.running) this.loop();
  }

  private loop = (): void => {
    this.running = true;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const b of this.bits) {
      b.vy += 0.28;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      b.life -= 0.012;
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      ctx.restore();
    }
    this.bits = this.bits.filter((b) => b.life > 0 && b.y < window.innerHeight + 40);
    if (this.bits.length > 0) {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      this.running = false;
    }
  };

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}

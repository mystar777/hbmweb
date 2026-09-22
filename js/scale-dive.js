/**
 * HBM Scale Dive
 * Scroll-scrubs one continuous 30 fps microscope movie. The visual feed is
 * never assembled from nested stills; every moment is a full video frame.
 */
window.HBM = window.HBM || {};

window.HBM.ScaleDive = class {
  constructor(container, canvas) {
    this.container = container;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = document.getElementById('scale-video-source');
    this.poster = new Image();
    this.poster.src = 'assets/scale-dive/keyframes/01-package.png';

    this.stages = [
      {
        name: 'HBM 패키지', target: '패키지 전체', spanNm: 35_000_000,
        magnification: 1, scaleBar: '10 mm', description: 'GPU 옆에 놓이는 3차원 메모리 묶음입니다.',
        comparison: '손톱 3개를 나란히 놓은 폭', comparisonNote: '×1 · 현재 시야 폭 약 35 mm',
      },
      {
        name: '적층 DRAM', target: 'DRAM 다이 스택', spanNm: 1_000_000,
        magnification: 35, scaleBar: '250 μm', description: '얇은 DRAM 여러 장과 TSV가 하나의 수직 데이터 구조를 만듭니다.',
        comparison: '바늘구멍 두 개를 나란히 놓은 폭', comparisonNote: '×35 · 현재 시야 폭 약 1 mm',
      },
      {
        name: 'DRAM 다이', target: '메모리 뱅크', spanNm: 100_000,
        magnification: 350, scaleBar: '25 μm', description: '수많은 메모리 셀이 바둑판처럼 반복되는 저장 공간입니다.',
        comparison: '머리카락 한 올의 굵기', comparisonNote: '×350 · 시야 폭 약 100 μm · 머리카락 ≈ 70 μm',
      },
      {
        name: 'TSV · 마이크로범프', target: '수직 데이터 통로', spanNm: 10_000,
        magnification: 3_500, scaleBar: '2 μm', description: '구리 TSV와 마이크로범프가 층과 층을 수직으로 연결합니다.',
        comparison: '적혈구 한 개의 지름', comparisonNote: '×3.5K · 시야 폭 약 10 μm · 적혈구 ≈ 8 μm',
      },
      {
        name: 'DRAM 셀 · 나노 배선', target: '셀과 금속 배선', spanNm: 20,
        magnification: 1_750_000, scaleBar: '5 nm', description: '10 nm급 공정 세대의 셀과 배선입니다. 공정명은 한 부품의 실제 치수와 정확히 같지는 않습니다.',
        comparison: 'DNA 폭의 약 10배', comparisonNote: '×1.75M · 시야 폭 약 20 nm · DNA ≈ 2 nm',
      },
    ];

    this.progress = 0;
    this.targetProgress = 0;
    this.time = 0;
    this.lastFrame = performance.now();
    this.running = false;
    this.videoReady = false;
    this.seekPending = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.cacheUI();
    this.bindVideo();
    this.bindInteractions();
    this.resize(canvas.width, canvas.height);
  }

  cacheUI() {
    this.ui = {
      magnification: document.getElementById('magnification'),
      size: document.getElementById('current-size'),
      target: document.getElementById('scope-target'),
      description: document.getElementById('comparison-text'),
      comparison: document.getElementById('scope-comparison'),
      comparisonNote: document.getElementById('scope-comparison-note'),
      references: Array.from(document.querySelectorAll('[data-reference-index]')),
      levelName: document.getElementById('scale-level-name'),
      meter: document.getElementById('scope-meter-fill'),
      hint: document.getElementById('scale-gesture-hint'),
      buttons: Array.from(document.querySelectorAll('[data-scale-stage]')),
    };
  }

  bindVideo() {
    if (!this.video) return;
    const ready = () => {
      this.videoReady = Number.isFinite(this.video.duration) && this.video.duration > 0;
      this.seekPending = false;
      this.syncVideo(true);
      if (this.running) this.video.play().catch(() => {});
      else this.video.pause();
      this.render();
    };
    this.video.addEventListener('loadedmetadata', ready);
    this.video.addEventListener('loadeddata', ready);
    this.video.addEventListener('seeked', () => {
      this.seekPending = false;
      this.render();
      this.syncVideo();
    });
    this.video.addEventListener('error', () => {
      this.container.classList.add('video-fallback');
      this.render();
    });
    this.video.load();
    this.poster.addEventListener('load', () => this.render());
  }

  bindInteractions() {
    this.dragging = false;
    this.dragStartY = 0;
    this.dragStartProgress = 0;

    this.canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.dragStartY = event.clientY;
      this.dragStartProgress = this.targetProgress;
      this.canvas.setPointerCapture(event.pointerId);
      this.container.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const distance = this.dragStartY - event.clientY;
      this.scrollToProgress(this.dragStartProgress + distance / Math.max(window.innerHeight * 0.72, 420));
    });
    const endDrag = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.container.classList.remove('is-dragging');
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.ui.buttons.forEach((button) => {
      button.addEventListener('click', () => this.scrollToProgress(Number(button.dataset.scaleStage) / 4));
    });
  }

  clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  scrollToProgress(progress) {
    const sectionTop = this.container.getBoundingClientRect().top + window.scrollY;
    const scrollRange = Math.max(this.container.offsetHeight - window.innerHeight, 1);
    window.scrollTo({ top: sectionTop + this.clamp(progress) * scrollRange, behavior: 'smooth' });
  }

  setProgress(progress) {
    this.targetProgress = this.clamp(progress);
    if (this.targetProgress > 0.015 && this.ui.hint) this.ui.hint.classList.add('is-hidden');
    if (this.videoReady && this.video) {
      const end = Math.max(0, this.video.duration - 1 / 30);
      const wanted = this.targetProgress * end;
      if (Math.abs(this.video.currentTime - wanted) > 0.04) this.video.currentTime = wanted;
      if (this.running && this.video.paused) this.video.play().catch(() => {});
    }
    if (this.reducedMotion) {
      this.progress = this.targetProgress;
      this.syncVideo(true);
      this.render();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.videoReady && this.video) {
      const end = Math.max(0, this.video.duration - 1 / 30);
      const wanted = this.targetProgress * end;
      if (Math.abs(this.video.currentTime - wanted) > 0.04) this.video.currentTime = wanted;
      this.video.play().catch(() => {});
    }
    this.lastFrame = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const delta = Math.min(now - this.lastFrame, 50);
      this.lastFrame = now;
      const ease = 1 - Math.exp(-delta / 125);
      if (this.videoReady && this.video && Number.isFinite(this.video.duration) && this.video.currentTime > 0.01) {
        this.progress = this.clamp(this.video.currentTime / this.video.duration);
      } else {
        this.progress += (this.targetProgress - this.progress) * ease;
      }
      this.time += delta * 0.001;
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.video) this.video.pause();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  syncVideo(force = false) {
    if (!this.videoReady || !this.video) return;
    const end = Math.max(0, this.video.duration - 1 / 30);
    const wanted = this.clamp(this.progress) * end;
    const distance = Math.abs(this.video.currentTime - wanted);
    if (distance < 1 / 45) {
      this.seekPending = false;
      return;
    }
    this.video.currentTime = wanted;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const wide = width / height > 1.35;
    this.centerX = width * (wide ? 0.39 : 0.5);
    this.centerY = height * 0.53;
    this.viewportRadius = Math.min(height * 0.40, width * (wide ? 0.30 : 0.43));
    this.render();
  }

  stageState() {
    const scaled = this.clamp(this.progress) * 4;
    const index = Math.min(Math.floor(scaled), 4);
    return { index, nextIndex: Math.min(index + 1, 4), local: index === 4 ? 1 : scaled - index };
  }

  interpolateLog(start, end, amount) {
    return Math.exp(Math.log(start) + (Math.log(end) - Math.log(start)) * amount);
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const background = ctx.createRadialGradient(this.centerX, this.centerY, 0, this.centerX, this.centerY, this.viewportRadius * 1.8);
    background.addColorStop(0, '#0a1821');
    background.addColorStop(0.56, '#071018');
    background.addColorStop(1, '#020305');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawOpticalFeed(ctx);
    this.drawLens(ctx);
    this.updateUI();
  }

  drawOpticalFeed(ctx) {
    const radius = this.viewportRadius;
    const diameter = radius * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    let source = null;
    if (this.videoReady && this.video.readyState >= 2) source = this.video;
    else if (this.poster.complete && this.poster.naturalWidth) source = this.poster;

    if (source) {
      const sourceWidth = source.videoWidth || source.naturalWidth;
      const sourceHeight = source.videoHeight || source.naturalHeight;
      const side = Math.min(sourceWidth, sourceHeight);
      const sx = (sourceWidth - side) / 2;
      const sy = (sourceHeight - side) / 2;
      ctx.drawImage(source, sx, sy, side, side, this.centerX - radius, this.centerY - radius, diameter, diameter);
    } else {
      ctx.fillStyle = '#07121a';
      ctx.fillRect(this.centerX - radius, this.centerY - radius, diameter, diameter);
    }

    const glass = ctx.createRadialGradient(
      this.centerX - radius * 0.34, this.centerY - radius * 0.38, radius * 0.02,
      this.centerX, this.centerY, radius
    );
    glass.addColorStop(0, 'rgba(174, 241, 255, 0.09)');
    glass.addColorStop(0.5, 'rgba(20, 111, 140, 0.015)');
    glass.addColorStop(0.88, 'rgba(0, 13, 20, 0.08)');
    glass.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = glass;
    ctx.fillRect(this.centerX - radius, this.centerY - radius, diameter, diameter);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#b9effb';
    const scanGap = Math.max(4, this.height * 0.0045);
    for (let y = this.centerY - radius; y < this.centerY + radius; y += scanGap) {
      ctx.fillRect(this.centerX - radius, y, diameter, Math.max(1, scanGap * 0.12));
    }
    ctx.restore();
  }

  drawLens(ctx) {
    const radius = this.viewportRadius;
    ctx.save();
    ctx.shadowBlur = radius * 0.1;
    ctx.shadowColor = 'rgba(39, 214, 255, 0.25)';
    ctx.strokeStyle = 'rgba(135, 235, 255, 0.84)';
    ctx.lineWidth = Math.max(2, radius * 0.006);
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(55, 151, 177, 0.42)';
    ctx.lineWidth = Math.max(1, radius * 0.0026);
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius * 1.015, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 72; i++) {
      const angle = (i / 72) * Math.PI * 2;
      const major = i % 9 === 0;
      const inner = radius * (major ? 1.025 : 1.04);
      const outer = radius * (major ? 1.075 : 1.06);
      ctx.strokeStyle = major ? 'rgba(155, 235, 250, 0.72)' : 'rgba(60, 166, 192, 0.38)';
      ctx.lineWidth = major ? Math.max(2, radius * 0.005) : Math.max(1, radius * 0.002);
      ctx.beginPath();
      ctx.moveTo(this.centerX + Math.cos(angle) * inner, this.centerY + Math.sin(angle) * inner);
      ctx.lineTo(this.centerX + Math.cos(angle) * outer, this.centerY + Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(222, 250, 255, 0.48)';
    ctx.lineWidth = Math.max(1, radius * 0.0022);
    ctx.setLineDash([radius * 0.022, radius * 0.028]);
    ctx.beginPath();
    ctx.moveTo(this.centerX - radius * 0.21, this.centerY);
    ctx.lineTo(this.centerX + radius * 0.21, this.centerY);
    ctx.moveTo(this.centerX, this.centerY - radius * 0.21);
    ctx.lineTo(this.centerX, this.centerY + radius * 0.21);
    ctx.stroke();
    ctx.setLineDash([]);

    const stage = this.stages[this.stageState().index];
    const barWidth = radius * 0.34;
    const barX = this.centerX + radius * 0.15;
    const barY = this.centerY + radius * 0.76;
    ctx.strokeStyle = 'rgba(240, 254, 255, 0.9)';
    ctx.lineWidth = Math.max(2, radius * 0.005);
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barWidth, barY);
    ctx.moveTo(barX, barY - radius * 0.025);
    ctx.lineTo(barX, barY + radius * 0.025);
    ctx.moveTo(barX + barWidth, barY - radius * 0.025);
    ctx.lineTo(barX + barWidth, barY + radius * 0.025);
    ctx.stroke();
    ctx.fillStyle = '#f2feff';
    ctx.font = `700 ${Math.max(12, radius * 0.045)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(stage.scaleBar, barX + barWidth / 2, barY - radius * 0.045);
    ctx.restore();
  }

  updateUI() {
    const state = this.stageState();
    const stage = this.stages[state.index];
    const next = this.stages[state.nextIndex];
    const magnification = this.interpolateLog(stage.magnification, next.magnification, state.local);
    const spanNm = this.interpolateLog(stage.spanNm, next.spanNm, state.local);
    const displayMagnification = magnification >= 100_000
      ? `×${(magnification / 1_000_000).toFixed(magnification >= 1_000_000 ? 2 : 3)}M`
      : magnification >= 1_000 ? `×${(magnification / 1_000).toFixed(1)}K` : `×${Math.round(magnification)}`;
    const displaySize = spanNm >= 1_000_000
      ? `${(spanNm / 1_000_000).toFixed(spanNm >= 10_000_000 ? 0 : 2)} mm`
      : spanNm >= 1_000 ? `${(spanNm / 1_000).toFixed(spanNm >= 100_000 ? 0 : 1)} μm`
      : `${spanNm.toFixed(spanNm >= 10 ? 0 : 1)} nm`;

    if (this.ui.magnification) this.ui.magnification.textContent = displayMagnification;
    if (this.ui.size) this.ui.size.textContent = displaySize;
    if (this.ui.target) this.ui.target.textContent = stage.target;
    if (this.ui.description) this.ui.description.textContent = stage.description;
    if (this.ui.comparison) this.ui.comparison.textContent = stage.comparison;
    if (this.ui.comparisonNote) this.ui.comparisonNote.textContent = stage.comparisonNote;
    if (this.ui.meter) this.ui.meter.style.height = `${this.progress * 100}%`;
    if (this.ui.levelName) this.ui.levelName.innerHTML = `<span class="level-index">${String(state.index + 1).padStart(2, '0')} / 05 · 30 FPS OPTICAL SEQUENCE</span><strong>${stage.name}</strong>`;
    this.ui.buttons.forEach((button, index) => button.classList.toggle('active', index === state.index));
    this.ui.references.forEach((item, index) => item.classList.toggle('is-active', index === state.index));
  }
};

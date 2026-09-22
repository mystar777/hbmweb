/**
 * HBM Scale Dive
 * A scroll- and drag-driven circular microscope that travels from the package
 * scale to a nanometre-class DRAM cell.
 */
window.HBM = window.HBM || {};

window.HBM.ScaleDive = class {
  constructor(container, canvas, options = {}) {
    this.container = container;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = Object.assign({
      colors: {
        primary: '#6be7ff',
        secondary: '#8b5cf6',
        accent: '#ff9a62',
        background: '#05070b',
        text: '#f5fbff',
      },
    }, options);

    this.stages = [
      {
        name: 'HBM 패키지',
        target: '패키지 전체',
        spanNm: 35_000_000,
        magnification: 1,
        scaleBar: '10 mm',
        description: 'GPU 옆에 놓이는 3차원 메모리 묶음입니다.',
        image: 'assets/scale-dive/01-hbm-package.jpg',
      },
      {
        name: '적층 DRAM',
        target: 'DRAM 다이 스택',
        spanNm: 1_000_000,
        magnification: 35,
        scaleBar: '250 μm',
        description: '얇은 DRAM 여러 장을 쌓아 같은 면적에 더 많은 데이터를 담습니다.',
        image: 'assets/scale-dive/02-hbm-stack.jpg',
      },
      {
        name: 'DRAM 다이',
        target: '메모리 뱅크',
        spanNm: 100_000,
        magnification: 350,
        scaleBar: '25 μm',
        description: '수많은 메모리 셀이 바둑판처럼 반복되는 저장 공간입니다.',
        image: 'assets/scale-dive/03-dram-die.jpg',
      },
      {
        name: 'TSV · 마이크로범프',
        target: '수직 데이터 통로',
        spanNm: 10_000,
        magnification: 3_500,
        scaleBar: '2 μm',
        description: '수 μm급 구리 통로가 층과 층 사이를 엘리베이터처럼 연결합니다.',
        image: 'assets/scale-dive/04-tsv.jpg',
      },
      {
        name: 'DRAM 셀 · 나노 배선',
        target: '셀과 금속 배선',
        spanNm: 20,
        magnification: 1_750_000,
        scaleBar: '5 nm',
        description: '10 nm급 공정 세대의 셀과 배선입니다. 공정 이름은 한 부품의 실제 치수와 같지 않습니다.',
        image: 'assets/scale-dive/05-dram-cell.jpg',
      },
    ];

    this.images = [];
    this.progress = 0;
    this.targetProgress = 0;
    this.velocity = 0;
    this.time = 0;
    this.lastFrame = performance.now();
    this.running = false;
    this.rafId = null;
    this.currentStage = -1;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.width = canvas.width;
    this.height = canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.viewportRadius = Math.min(this.width, this.height) * 0.39;

    this.cacheUI();
    this.preloadImages();
    this.bindInteractions();
    this.resize(this.width, this.height);
  }

  cacheUI() {
    this.ui = {
      magnification: document.getElementById('magnification'),
      size: document.getElementById('current-size'),
      target: document.getElementById('scope-target'),
      description: document.getElementById('comparison-text'),
      levelName: document.getElementById('scale-level-name'),
      meter: document.getElementById('scope-meter-fill'),
      hint: document.getElementById('scale-gesture-hint'),
      buttons: Array.from(document.querySelectorAll('[data-scale-stage]')),
    };
  }

  preloadImages() {
    this.stages.forEach((stage, index) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => this.render();
      image.src = stage.image;
      this.images[index] = image;
    });
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
      const nextProgress = this.clamp(this.dragStartProgress + distance / Math.max(window.innerHeight * 0.72, 420));
      this.scrollToProgress(nextProgress);
    });

    const endDrag = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.container.classList.remove('is-dragging');
      if (event.pointerId !== undefined && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.ui.buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const stageIndex = Number(button.dataset.scaleStage);
        this.scrollToProgress(stageIndex / (this.stages.length - 1));
      });
    });
  }

  scrollToProgress(progress) {
    const sectionTop = this.container.offsetTop;
    const scrollRange = Math.max(this.container.offsetHeight - window.innerHeight, 1);
    window.scrollTo({ top: sectionTop + this.clamp(progress) * scrollRange, behavior: 'auto' });
  }

  clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  setProgress(progress) {
    this.targetProgress = this.clamp(progress);
    if (this.reducedMotion) {
      this.progress = this.targetProgress;
      this.render();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const delta = Math.min(now - this.lastFrame, 34);
      this.lastFrame = now;
      const previous = this.progress;
      const ease = 1 - Math.exp(-delta / 110);
      this.progress += (this.targetProgress - this.progress) * ease;
      this.velocity += ((this.progress - previous) - this.velocity) * 0.18;
      this.time += delta * 0.001;
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const wide = width / height > 1.35;
    this.centerX = width * (wide ? 0.39 : 0.5);
    this.centerY = height * 0.53;
    this.viewportRadius = Math.min(height * 0.4, width * (wide ? 0.3 : 0.43));
    this.render();
  }

  stageState() {
    const scaled = this.clamp(this.progress) * (this.stages.length - 1);
    const index = Math.min(Math.floor(scaled), this.stages.length - 1);
    return {
      index,
      nextIndex: Math.min(index + 1, this.stages.length - 1),
      local: index === this.stages.length - 1 ? 1 : scaled - index,
    };
  }

  smoothstep(min, max, value) {
    const x = this.clamp((value - min) / (max - min));
    return x * x * (3 - 2 * x);
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const state = this.stageState();
    const blend = state.nextIndex === state.index ? 0 : this.smoothstep(0.52, 0.98, state.local);

    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx);
    this.drawLensShadow(ctx);

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
    ctx.clip();

    const motionBlur = Math.min(Math.abs(this.velocity) * 800, 2.2) * dpr;
    this.drawStageImage(ctx, state.index, state.local, 1 - blend, motionBlur, false);
    if (blend > 0) this.drawStageImage(ctx, state.nextIndex, blend, blend, motionBlur, true);
    this.drawOpticalTexture(ctx, state.index);
    ctx.restore();

    this.drawLens(ctx);
    this.drawScaleBar(ctx, state, dpr);
    ctx.restore();
    this.updateUI(state);
  }

  drawBackground(ctx) {
    const gradient = ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      this.viewportRadius * 0.2,
      this.centerX,
      this.centerY,
      Math.max(this.width, this.height) * 0.75
    );
    gradient.addColorStop(0, 'rgba(15, 30, 42, 0.52)');
    gradient.addColorStop(0.48, 'rgba(5, 8, 13, 0.96)');
    gradient.addColorStop(1, '#030406');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawLensShadow(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(69, 220, 255, 0.28)';
    ctx.shadowBlur = this.viewportRadius * 0.12;
    ctx.fillStyle = '#020304';
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.viewportRadius * 1.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawStageImage(ctx, index, local, opacity, blur, incoming) {
    const image = this.images[index];
    if (!image || !image.complete || !image.naturalWidth) {
      this.drawFallback(ctx, index, opacity);
      return;
    }

    const baseSize = this.viewportRadius * 2.06;
    const zoom = incoming ? 0.78 + local * 0.28 : 1 + local * 0.66;
    const drift = Math.sin(this.time * 0.7 + index) * this.viewportRadius * 0.008;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.filter = `saturate(${1.03 + index * 0.025}) contrast(1.05) blur(${blur}px)`;
    ctx.translate(this.centerX + drift, this.centerY - drift * 0.45);
    ctx.rotate(Math.sin(this.time * 0.28 + index) * 0.0025);
    ctx.scale(zoom, zoom);
    ctx.drawImage(image, -baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
  }

  drawFallback(ctx, index, opacity) {
    const gradient = ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      0,
      this.centerX,
      this.centerY,
      this.viewportRadius
    );
    gradient.addColorStop(0, index % 2 ? '#18364a' : '#3c2418');
    gradient.addColorStop(1, '#05070a');
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(
      this.centerX - this.viewportRadius,
      this.centerY - this.viewportRadius,
      this.viewportRadius * 2,
      this.viewportRadius * 2
    );
    ctx.globalAlpha = 1;
  }

  drawOpticalTexture(ctx, stageIndex) {
    const radius = this.viewportRadius;
    const vignette = ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      radius * 0.45,
      this.centerX,
      this.centerY,
      radius
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(0,6,10,0.08)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vignette;
    ctx.fillRect(this.centerX - radius, this.centerY - radius, radius * 2, radius * 2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const scanY = this.centerY - radius + ((this.time * 52) % (radius * 2));
    const scan = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
    scan.addColorStop(0, 'rgba(58,220,255,0)');
    scan.addColorStop(0.5, `rgba(58,220,255,${0.045 + stageIndex * 0.012})`);
    scan.addColorStop(1, 'rgba(58,220,255,0)');
    ctx.fillStyle = scan;
    ctx.fillRect(this.centerX - radius, scanY - 20, radius * 2, 40);
    ctx.restore();
  }

  drawLens(ctx) {
    const radius = this.viewportRadius;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);

    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, radius + ring * Math.max(2, radius * 0.012), 0, Math.PI * 2);
      ctx.strokeStyle = ring === 0 ? 'rgba(175,245,255,0.9)' : `rgba(72,203,232,${0.28 - ring * 0.08})`;
      ctx.lineWidth = ring === 0 ? Math.max(2, radius * 0.006) : Math.max(1, radius * 0.004);
      ctx.stroke();
    }

    ctx.rotate(this.time * 0.025);
    for (let i = 0; i < 72; i += 1) {
      const major = i % 9 === 0;
      const angle = (i / 72) * Math.PI * 2;
      const outer = radius * 1.055;
      const inner = outer - radius * (major ? 0.045 : 0.022);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.strokeStyle = major ? 'rgba(190,247,255,0.72)' : 'rgba(95,208,232,0.32)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.stroke();
    }
    ctx.rotate(-this.time * 0.025);

    ctx.strokeStyle = 'rgba(189, 244, 255, 0.48)';
    ctx.lineWidth = Math.max(1, radius * 0.003);
    ctx.setLineDash([radius * 0.018, radius * 0.026]);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.22, 0);
    ctx.lineTo(radius * 0.22, 0);
    ctx.moveTo(0, -radius * 0.22);
    ctx.lineTo(0, radius * 0.22);
    ctx.stroke();
    ctx.setLineDash([]);

    const pulseRadius = radius * (0.15 + ((this.time * 0.18) % 1) * 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(74, 221, 255, ${0.13 * (1 - pulseRadius / radius)})`;
    ctx.stroke();
    ctx.restore();
  }

  drawScaleBar(ctx, state, dpr) {
    const stage = this.stages[state.index];
    const barWidth = this.viewportRadius * 0.34;
    const x = this.centerX + this.viewportRadius * 0.48 - barWidth;
    const y = this.centerY + this.viewportRadius * 0.72;

    ctx.save();
    ctx.strokeStyle = 'rgba(245, 252, 255, 0.86)';
    ctx.fillStyle = 'rgba(245, 252, 255, 0.9)';
    ctx.lineWidth = Math.max(1.5 * dpr, 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barWidth, y);
    ctx.moveTo(x, y - 6 * dpr);
    ctx.lineTo(x, y + 6 * dpr);
    ctx.moveTo(x + barWidth, y - 6 * dpr);
    ctx.lineTo(x + barWidth, y + 6 * dpr);
    ctx.stroke();
    ctx.font = `600 ${Math.max(11 * dpr, this.viewportRadius * 0.042)}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(stage.scaleBar, x + barWidth, y - 9 * dpr);
    ctx.restore();
  }

  interpolateLog(start, end, value) {
    return Math.exp(Math.log(start) + (Math.log(end) - Math.log(start)) * value);
  }

  formatMagnification(value) {
    if (value >= 1_000_000) return `×${(value / 1_000_000).toFixed(value < 2_000_000 ? 2 : 1)}M`;
    if (value >= 1_000) return `×${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
    return `×${Math.max(1, Math.round(value)).toLocaleString('ko-KR')}`;
  }

  formatSpan(nanometres) {
    if (nanometres >= 1_000_000) return `${(nanometres / 1_000_000).toFixed(nanometres < 10_000_000 ? 1 : 0)} mm`;
    if (nanometres >= 1_000) return `${(nanometres / 1_000).toFixed(nanometres < 10_000 ? 1 : 0)} μm`;
    return `${Math.max(1, Math.round(nanometres))} nm`;
  }

  updateUI(state) {
    const stage = this.stages[state.index];
    const next = this.stages[state.nextIndex];
    const mag = this.interpolateLog(stage.magnification, next.magnification, state.local);
    const span = this.interpolateLog(stage.spanNm, next.spanNm, state.local);

    if (this.ui.magnification) this.ui.magnification.textContent = this.formatMagnification(mag);
    if (this.ui.size) this.ui.size.textContent = this.formatSpan(span);
    if (this.ui.target) this.ui.target.textContent = stage.target;
    if (this.ui.description) this.ui.description.textContent = stage.description;
    if (this.ui.meter) this.ui.meter.style.height = `${Math.max(2, this.progress * 100)}%`;

    if (this.ui.levelName) {
      this.ui.levelName.innerHTML = `<span class="level-index">${String(state.index + 1).padStart(2, '0')} / 05</span><strong>${stage.name}</strong>`;
    }

    if (this.currentStage !== state.index) {
      this.currentStage = state.index;
      this.container.dataset.scaleStage = String(state.index);
      this.ui.buttons.forEach((button, index) => {
        button.classList.toggle('active', index === state.index);
        button.setAttribute('aria-current', index === state.index ? 'step' : 'false');
      });
    }

    if (this.ui.hint) this.ui.hint.classList.toggle('is-hidden', this.progress > 0.05);
  }

  destroy() {
    this.stop();
    this.ctx = null;
    this.canvas = null;
    this.container = null;
  }
};

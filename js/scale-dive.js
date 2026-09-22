/**
 * Chapter 4 microscope exhibit.
 *
 * A motion-interpolated 60 fps optical sequence is kept paused and addressed
 * by timestamp. Intermediate frames are calculated from the supplied footage.
 * Only wheel/drag gestures that begin inside the circular lens are captured;
 * all input outside the lens remains normal page navigation.
 */
window.HBM = window.HBM || {};

window.HBM.ScaleDive = class {
  constructor(container, canvas) {
    this.container = container;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = document.getElementById('scale-video-source');
    this.poster = new Image();
    this.poster.src = 'assets/scale-dive/microscope-source-poster.jpg';

    this.stages = [
      {
        name: '반도체 샘플', target: '칩 샘플 전체', spanNm: 60_000,
        magnification: 1, description: '현미경 렌즈 안의 실제 반도체 샘플 전체를 보고 있습니다.',
        comparison: '머리카락 한 올과 비슷한 폭', comparisonNote: '×1 · 시야 폭 약 60 μm · 머리카락 ≈ 70 μm',
      },
      {
        name: '다이 패턴', target: '기능 블록과 패턴', spanNm: 10_000,
        magnification: 6, description: '칩을 이루는 기능 블록과 반복 패턴이 분리되어 보이기 시작합니다.',
        comparison: '적혈구 한 개의 지름', comparisonNote: '×6 · 시야 폭 약 10 μm · 적혈구 ≈ 8 μm',
      },
      {
        name: '금속 배선층', target: '배선 네트워크', spanNm: 1_000,
        magnification: 60, description: '신호와 전력을 운반하는 금속 배선이 도로망처럼 연결됩니다.',
        comparison: '세균 한 마리의 길이', comparisonNote: '×60 · 시야 폭 약 1 μm · 대장균 폭 ≈ 1 μm',
      },
      {
        name: '미세 배선', target: '셀 주변 연결', spanNm: 100,
        magnification: 600, description: '트랜지스터와 셀을 잇는 미세 연결 구조가 촘촘하게 드러납니다.',
        comparison: '작은 바이러스 한 개', comparisonNote: '×600 · 시야 폭 약 100 nm · 바이러스 ≈ 80–120 nm',
      },
      {
        name: '5 nm 공정 영역', target: '나노 구조', spanNm: 5,
        magnification: 12_000, description: '5 nm는 공정 세대의 이름이며, 화면 속 한 선의 실제 폭과 정확히 같다는 뜻은 아닙니다.',
        comparison: 'DNA 이중나선 폭의 약 2.5배', comparisonNote: '×12K · 기준 폭 5 nm · DNA ≈ 2 nm',
      },
    ];

    this.progress = 0;
    this.videoReady = false;
    this.running = false;
    this.frameRate = 60;
    this.frameCount = 1962;
    this.dragging = false;
    this.hoveringLens = false;
    this.scrubTimer = null;

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
      scrubFill: document.getElementById('scope-scrub-fill'),
      frameReadout: document.getElementById('scope-frame-readout'),
    };
  }

  bindVideo() {
    if (!this.video) return;

    const ready = () => {
      this.videoReady = Number.isFinite(this.video.duration) && this.video.duration > 0;
      if (!this.videoReady) return;
      this.video.pause();
      this.frameCount = Math.max(1, Math.round(this.video.duration * this.frameRate));
      this.seekVideo(true);
      this.render();
    };

    this.video.addEventListener('loadedmetadata', ready);
    this.video.addEventListener('loadeddata', ready);
    this.video.addEventListener('seeked', () => this.render());
    this.video.addEventListener('error', () => {
      this.container.classList.add('video-fallback');
      this.render();
    });
    this.video.load();
    this.poster.addEventListener('load', () => this.render());
  }

  bindInteractions() {
    this.canvas.addEventListener('wheel', (event) => {
      if (!this.isPointInsideLens(event.clientX, event.clientY)) return;

      const deltaPixels = this.normalizedWheelDelta(event);
      const wantsPastStart = this.progress <= 0.0001 && deltaPixels < 0;
      const wantsPastEnd = this.progress >= 0.9999 && deltaPixels > 0;

      // At both ends, release the wheel back to the document so visitors can
      // enter the previous/next chapter without moving the pointer.
      if (wantsPastStart || wantsPastEnd) return;

      event.preventDefault();
      event.stopPropagation();
      const step = Math.max(-160, Math.min(160, deltaPixels)) * 0.00022;
      this.setProgress(this.progress + step);
      this.markScrubbing();
    }, { passive: false });

    this.canvas.addEventListener('pointermove', (event) => {
      const inside = this.isPointInsideLens(event.clientX, event.clientY);
      this.setLensHover(inside);

      if (!this.dragging) return;
      event.preventDefault();
      const distance = this.dragStartY - event.clientY;
      const range = Math.max(window.innerHeight * 0.72, 420);
      this.setProgress(this.dragStartProgress + distance / range);
      this.markScrubbing();
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.isPointInsideLens(event.clientX, event.clientY)) return;
      event.preventDefault();
      this.dragging = true;
      this.dragStartY = event.clientY;
      this.dragStartProgress = this.progress;
      this.canvas.setPointerCapture(event.pointerId);
      this.container.classList.add('is-dragging');
      this.markScrubbing();
    });

    const endDrag = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.container.classList.remove('is-dragging');
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.dragging) this.setLensHover(false);
    });

    this.ui.buttons.forEach((button) => {
      button.addEventListener('click', () => {
        this.setProgress(Number(button.dataset.scaleStage) / 4);
        this.markScrubbing();
      });
    });
  }

  normalizedWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  isPointInsideLens(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = (clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (clientY - rect.top) * (this.canvas.height / rect.height);
    return Math.hypot(x - this.centerX, y - this.centerY) <= this.viewportRadius;
  }

  setLensHover(inside) {
    if (inside === this.hoveringLens) return;
    this.hoveringLens = inside;
    this.container.classList.toggle('is-lens-hover', inside);
    this.render();
  }

  markScrubbing() {
    this.container.classList.add('is-scrubbing');
    if (this.ui.hint) this.ui.hint.classList.add('is-hidden');
    clearTimeout(this.scrubTimer);
    this.scrubTimer = setTimeout(() => this.container.classList.remove('is-scrubbing'), 180);
  }

  clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  setProgress(progress) {
    const next = this.clamp(progress);
    if (Math.abs(next - this.progress) < 0.00001) return;
    this.progress = next;
    this.seekVideo();
    this.render();
  }

  seekVideo(force = false) {
    if (!this.video) return;
    if (!Number.isFinite(this.video.duration) || this.video.duration <= 0) return;
    this.videoReady = true;
    this.video.pause();
    const end = Math.max(0, this.video.duration - 1 / this.frameRate);
    const wanted = this.progress * end;
    if (force || Math.abs(this.video.currentTime - wanted) > 1 / 90) {
      this.video.currentTime = wanted;
    }
  }

  start() {
    this.running = true;
    if (this.video) this.video.pause();
    this.render();
  }

  stop() {
    this.running = false;
    if (this.video) this.video.pause();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const wide = width / height > 1.35;
    this.centerX = width * (wide ? 0.39 : 0.5);
    this.centerY = height * (wide ? 0.53 : 0.46);
    this.viewportRadius = Math.min(height * (wide ? 0.40 : 0.31), width * (wide ? 0.30 : 0.43));
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

    const background = ctx.createRadialGradient(this.centerX, this.centerY, 0, this.centerX, this.centerY, this.viewportRadius * 1.9);
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
    if (this.video && this.video.readyState >= 2 && Number.isFinite(this.video.duration)) source = this.video;
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

    // Optical glass only: keep it subtle so the source frame remains intact.
    const glass = ctx.createRadialGradient(
      this.centerX - radius * 0.38, this.centerY - radius * 0.42, radius * 0.02,
      this.centerX, this.centerY, radius
    );
    glass.addColorStop(0, 'rgba(190, 245, 255, 0.045)');
    glass.addColorStop(0.76, 'rgba(13, 63, 80, 0.005)');
    glass.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = glass;
    ctx.fillRect(this.centerX - radius, this.centerY - radius, diameter, diameter);
    ctx.restore();
  }

  drawLens(ctx) {
    const radius = this.viewportRadius;
    ctx.save();

    ctx.shadowBlur = radius * (this.hoveringLens ? 0.14 : 0.08);
    ctx.shadowColor = this.hoveringLens ? 'rgba(39, 214, 255, 0.55)' : 'rgba(39, 214, 255, 0.22)';
    ctx.strokeStyle = this.hoveringLens ? 'rgba(164, 244, 255, 0.98)' : 'rgba(135, 235, 255, 0.78)';
    ctx.lineWidth = Math.max(2, radius * 0.006);
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // A single cyan arc is the actual scrub position. The source video's own
    // optical markings remain visible instead of being covered by fake ticks.
    ctx.strokeStyle = 'rgba(60, 166, 192, 0.22)';
    ctx.lineWidth = Math.max(2, radius * 0.007);
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius * 1.025, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();

    if (this.progress > 0) {
      ctx.strokeStyle = '#42ddff';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, radius * 1.025, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progress);
      ctx.stroke();
    }
    ctx.restore();
  }

  updateUI() {
    const state = this.stageState();
    const stage = this.stages[state.index];
    const next = this.stages[state.nextIndex];
    const magnification = this.interpolateLog(stage.magnification, next.magnification, state.local);
    const spanNm = this.interpolateLog(stage.spanNm, next.spanNm, state.local);
    const displayMagnification = magnification >= 1_000
      ? `×${(magnification / 1_000).toFixed(magnification >= 10_000 ? 0 : 1)}K`
      : `×${Math.round(magnification)}`;
    const displaySize = spanNm >= 999.5
      ? `${(spanNm / 1_000).toFixed(spanNm >= 10_000 ? 0 : 1)} μm`
      : `${spanNm.toFixed(spanNm >= 100 ? 0 : 1)} nm`;
    const frame = Math.min(this.frameCount, Math.max(1, Math.round(this.progress * (this.frameCount - 1)) + 1));
    const frameLabel = `FRAME ${String(frame).padStart(4, '0')} / ${String(this.frameCount).padStart(4, '0')}`;

    if (this.ui.magnification) this.ui.magnification.textContent = displayMagnification;
    if (this.ui.size) this.ui.size.textContent = displaySize;
    if (this.ui.target) this.ui.target.textContent = stage.target;
    if (this.ui.description) this.ui.description.textContent = stage.description;
    if (this.ui.comparison) this.ui.comparison.textContent = stage.comparison;
    if (this.ui.comparisonNote) this.ui.comparisonNote.textContent = stage.comparisonNote;
    if (this.ui.meter) this.ui.meter.style.height = `${this.progress * 100}%`;
    if (this.ui.scrubFill) this.ui.scrubFill.style.width = `${this.progress * 100}%`;
    if (this.ui.frameReadout) this.ui.frameReadout.textContent = frameLabel;
    if (this.ui.levelName) {
      this.ui.levelName.innerHTML = `<span class="level-index">${String(state.index + 1).padStart(2, '0')} / 05 · 60 FPS ${frameLabel}</span><strong>${stage.name}</strong>`;
    }
    this.ui.buttons.forEach((button, index) => button.classList.toggle('active', index === state.index));
    this.ui.references.forEach((item, index) => item.classList.toggle('is-active', index === state.index));
  }
};

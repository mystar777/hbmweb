/**
 * Chapter 4 microscope exhibit.
 *
 * A motion-interpolated 120 fps optical sequence is kept paused and addressed
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
    this.frameCache = document.createElement('canvas');
    this.frameCacheCtx = this.frameCache.getContext('2d', { alpha: false });

    this.stages = [
      {
        name: '반도체 샘플', target: '칩 샘플 전체', spanNm: 60_000,
        magnification: 1, description: '청색 원 안의 작은 사각형이 반도체 칩입니다. 지금은 칩 전체의 윤곽과 큰 기능 구역을 보는 단계입니다.',
        comparison: '머리카락 한 올 굵기와 거의 같아요', comparisonNote: '×1 · 시야 폭 약 60 μm · 머리카락 한 올 ≈ 70 μm',
      },
      {
        name: '다이 패턴', target: '기능 블록과 패턴', spanNm: 10_000,
        magnification: 6, description: '칩 안쪽으로 들어오면 연산과 저장 영역을 나누는 큰 기능 블록과 반복 패턴이 보이기 시작합니다.',
        comparison: '적혈구 한 개의 지름과 비슷해요', comparisonNote: '×6 · 시야 폭 약 10 μm · 적혈구 하나 ≈ 8 μm',
      },
      {
        name: '금속 배선층', target: '배선 네트워크', spanNm: 1_000,
        magnification: 60, description: '밝고 어두운 선들은 전력과 신호가 이동하는 금속 배선층입니다. 도시의 도로망처럼 칩 내부를 연결합니다.',
        comparison: '세균 한 마리의 폭 정도예요', comparisonNote: '×60 · 시야 폭 약 1 μm · 대장균의 폭 ≈ 1 μm',
      },
      {
        name: '미세 배선', target: '셀 주변 연결', spanNm: 100,
        magnification: 600, description: '굵은 배선 사이로 트랜지스터와 메모리 셀을 잇는 더 촘촘한 연결이 드러납니다. 데이터는 이 미세한 길을 따라 이동합니다.',
        comparison: '작은 바이러스 하나 크기예요', comparisonNote: '×600 · 시야 폭 약 100 nm · 작은 바이러스 ≈ 80–120 nm',
      },
      {
        name: '5 nm 공정 영역', target: '나노 구조', spanNm: 5,
        magnification: 12_000, description: '가장 작은 공정 단계입니다. 5 nm는 공정 세대의 이름이며, 화면 속 모든 선의 실제 폭이 5 nm라는 뜻은 아닙니다.',
        comparison: 'DNA 이중나선 폭의 약 2.5배예요', comparisonNote: '×12,000 · 기준 폭 5 nm · DNA 이중나선 ≈ 2 nm',
      },
    ];

    this.progress = 0;
    this.targetProgress = 0;
    this.videoReady = false;
    this.running = false;
    this.frameRate = 120;
    this.frameCount = 3924;
    this.dragging = false;
    this.hoveringLens = false;
    this.scrubTimer = null;
    this.progressAnimationId = null;
    this.lastProgressTick = 0;
    this.pendingSeekTime = null;
    this.seekFrameId = null;
    this.rangeDragging = false;

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
      scrubRange: document.getElementById('scope-scrub-range'),
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
      if (this.ui.scrubRange) this.ui.scrubRange.max = String(Math.max(1, this.frameCount - 1));
      this.cacheVideoFrame();
      this.seekVideo(true);
      this.render();
    };

    this.video.addEventListener('loadedmetadata', ready);
    this.video.addEventListener('loadeddata', ready);
    this.video.addEventListener('seeked', () => {
      // `seeked` means the requested frame is decoded and drawable. Rendering
      // here is more reliable for a paused video than waiting for a future
      // requestVideoFrameCallback, which some browsers never dispatch.
      this.cacheVideoFrame();
      this.render();
      this.flushPendingSeek();
    });
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
      const wantsPastStart = this.targetProgress <= 0.0001 && deltaPixels < 0;
      const wantsPastEnd = this.targetProgress >= 0.9999 && deltaPixels > 0;

      // At both ends, release the wheel back to the document so visitors can
      // enter the previous/next chapter without moving the pointer.
      if (wantsPastStart || wantsPastEnd) return;

      event.preventDefault();
      event.stopPropagation();
      const direction = Math.sign(deltaPixels);
      const magnitude = Math.max(28, Math.min(120, Math.abs(deltaPixels)));
      const step = direction * magnitude * 0.0001;
      const targetLead = 0.055;
      const requested = this.targetProgress + step;
      const bounded = Math.max(this.progress - targetLead, Math.min(this.progress + targetLead, requested));
      this.setProgress(bounded);
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
      this.dragStartProgress = this.targetProgress;
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

    if (this.ui.scrubRange) {
      const beginRangeDrag = () => {
        this.rangeDragging = true;
        this.container.classList.add('is-range-dragging');
        this.markScrubbing();
      };
      const endRangeDrag = () => {
        this.rangeDragging = false;
        this.container.classList.remove('is-range-dragging');
      };

      this.ui.scrubRange.addEventListener('pointerdown', beginRangeDrag);
      this.ui.scrubRange.addEventListener('pointerup', endRangeDrag);
      this.ui.scrubRange.addEventListener('pointercancel', endRangeDrag);
      this.ui.scrubRange.addEventListener('input', () => {
        const max = Math.max(1, Number(this.ui.scrubRange.max));
        this.setProgress(Number(this.ui.scrubRange.value) / max, true);
        this.markScrubbing();
      });
      this.ui.scrubRange.addEventListener('change', endRangeDrag);
    }
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

  setProgress(progress, immediate = false) {
    const next = this.clamp(progress);
    if (immediate) {
      this.targetProgress = next;
      this.progress = next;
      this.seekVideo();
      this.render();
      return;
    }
    if (Math.abs(next - this.targetProgress) < 0.000001) return;
    this.targetProgress = next;
    this.startProgressAnimation();
  }

  startProgressAnimation() {
    if (this.progressAnimationId) return;
    this.lastProgressTick = performance.now();

    const tick = (now) => {
      const elapsed = Math.min(42, Math.max(1, now - this.lastProgressTick));
      this.lastProgressTick = now;
      const remaining = this.targetProgress - this.progress;
      const settleThreshold = 0.5 / Math.max(1, this.frameCount - 1);

      if (Math.abs(remaining) <= settleThreshold) {
        this.progress = this.targetProgress;
      } else {
        // Time-based damping keeps mouse wheels and high-resolution trackpads
        // equally smooth while still following a fast reverse scrub.
        const blend = 1 - Math.exp(-elapsed / 115);
        this.progress += remaining * blend;
      }

      this.seekVideo();
      this.render();

      if (this.progress === this.targetProgress) {
        this.progressAnimationId = null;
        this.lastProgressTick = 0;
        return;
      }
      this.progressAnimationId = requestAnimationFrame(tick);
    };

    this.progressAnimationId = requestAnimationFrame(tick);
  }

  seekVideo(force = false) {
    if (!this.video) return;
    if (!Number.isFinite(this.video.duration) || this.video.duration <= 0) return;
    this.videoReady = true;
    this.video.pause();
    const end = Math.max(0, this.video.duration - 1 / this.frameRate);
    this.pendingSeekTime = this.progress * end;
    this.flushPendingSeek(force);
  }

  flushPendingSeek(force = false) {
    if (!this.video || this.pendingSeekTime === null || this.video.seeking) return;

    const wanted = this.pendingSeekTime;
    const threshold = 1 / (this.frameRate * 2);
    if (!force && Math.abs(this.video.currentTime - wanted) <= threshold) return;

    // Preserve the last decoded picture while the browser fetches/decodes the
    // next range. This prevents the poster from flashing during reverse seeks.
    this.cacheVideoFrame();
    this.pendingSeekTime = null;
    if (this.seekFrameId) cancelAnimationFrame(this.seekFrameId);
    this.seekFrameId = requestAnimationFrame(() => {
      this.seekFrameId = null;
      this.video.currentTime = wanted;
    });
  }

  cacheVideoFrame() {
    if (!this.video || !this.frameCacheCtx || this.video.readyState < 2 || this.video.seeking) return;
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) return;
    if (this.frameCache.width !== width || this.frameCache.height !== height) {
      this.frameCache.width = width;
      this.frameCache.height = height;
    }
    this.frameCacheCtx.drawImage(this.video, 0, 0, width, height);
  }

  start() {
    this.running = true;
    if (this.video) this.video.pause();
    if (Math.abs(this.targetProgress - this.progress) > 0.5 / Math.max(1, this.frameCount - 1)) {
      this.startProgressAnimation();
    }
    this.render();
  }

  stop() {
    this.running = false;
    if (this.video) this.video.pause();
    if (this.progressAnimationId) cancelAnimationFrame(this.progressAnimationId);
    this.progressAnimationId = null;
    this.lastProgressTick = 0;
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
    if (this.video && this.video.readyState >= 2 && !this.video.seeking && Number.isFinite(this.video.duration)) {
      source = this.video;
    } else if (this.frameCache.width && this.frameCache.height) {
      source = this.frameCache;
    } else if (this.poster.complete && this.poster.naturalWidth) {
      source = this.poster;
    }

    if (source) {
      const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
      const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
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
    const displayMagnification = `×${Math.round(magnification).toLocaleString('ko-KR')}`;
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
    if (this.ui.scrubRange) {
      const max = Math.max(1, Number(this.ui.scrubRange.max));
      this.ui.scrubRange.style.setProperty('--scope-progress', `${this.progress * 100}%`);
      if (!this.rangeDragging) this.ui.scrubRange.value = String(Math.round(this.progress * max));
    }
    if (this.ui.frameReadout) this.ui.frameReadout.textContent = frameLabel;
    if (this.ui.levelName) {
      this.ui.levelName.innerHTML = `<span class="level-index">${String(state.index + 1).padStart(2, '0')} / 05 · 120 FPS ${frameLabel}</span><strong>${stage.name}</strong>`;
    }
    this.ui.buttons.forEach((button, index) => button.classList.toggle('active', index === state.index));
    this.ui.references.forEach((item, index) => item.classList.toggle('is-active', index === state.index));
  }
};

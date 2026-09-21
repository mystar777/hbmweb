/**
 * HBM Storytelling — Scene Manager
 * Controls scene transitions, scroll-driven animations, and coordinates
 * particle network / scale dive modules.
 */
window.HBM = window.HBM || {};

(function () {
  'use strict';

  class SceneManager {
    constructor(particleNetwork, scaleDive) {
      this.particleNetwork = particleNetwork;
      this.scaleDive = scaleDive;
      this.scenes = [];
      this.activeSceneIndex = -1;
      this.observers = [];
      this.animatedElements = new Set();

      // Data flow canvases
      this.ddrCanvas = null;
      this.hbmCanvas = null;
      this.ddrCtx = null;
      this.hbmCtx = null;
      this.flowParticles = { ddr: [], hbm: [] };
      this.flowAnimId = null;

      // Counter animations
      this.countersAnimated = false;
      this.outroCountersAnimated = false;

      this.init();
    }

    init() {
      // Collect all scene elements
      this.scenes = Array.from(document.querySelectorAll('.scene'));

      // Set up Intersection Observer for scene visibility
      const sceneObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const index = parseInt(entry.target.dataset.sceneIndex);
              this.onSceneEnter(index, entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );

      this.scenes.forEach((scene) => {
        sceneObserver.observe(scene);
      });
      this.observers.push(sceneObserver);

      // Set up Intersection Observer for fade-in elements
      const fadeObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.animatedElements.has(entry.target)) {
              this.animatedElements.add(entry.target);
              const delay = parseInt(entry.target.dataset.delay) || 0;
              setTimeout(() => {
                entry.target.classList.add('visible');
              }, delay);
            }
          });
        },
        { threshold: 0.1 }
      );

      document.querySelectorAll('.fade-element').forEach((el) => {
        fadeObserver.observe(el);
      });
      this.observers.push(fadeObserver);

      // Set up evolution timeline observer
      const evoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        },
        { threshold: 0.2 }
      );

      document.querySelectorAll('.evo-item').forEach((el) => {
        evoObserver.observe(el);
      });
      this.observers.push(evoObserver);

      // Init data flow canvases
      this.initDataFlowCanvases();
    }

    // ---- Scene Enter/Exit Logic ----

    onSceneEnter(index, element) {
      if (this.activeSceneIndex === index) return;
      this.activeSceneIndex = index;

      // Update progress dots
      document.querySelectorAll('.progress-dots .dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });

      // Configure particle network mode based on scene
      switch (index) {
        case 0: // Opening — full neural network
          this.particleNetwork.setMode('neural');
          this.particleNetwork.setOpacity(0.6);
          break;
        case 1: // Data center — dim particles
          this.particleNetwork.setMode('idle');
          this.particleNetwork.setOpacity(0.2);
          break;
        case 2: // HBM Structure — idle
          this.particleNetwork.setMode('idle');
          this.particleNetwork.setOpacity(0.15);
          break;
        case 3: // Scale dive — hide particles
          this.particleNetwork.setOpacity(0);
          break;
        case 4: // Data flow — dataflow mode
          this.particleNetwork.setMode('dataflow');
          this.particleNetwork.setOpacity(0.3);
          this.startDataFlowAnimation();
          this.animateCounters();
          break;
        case 5: // Evolution — subtle
          this.particleNetwork.setMode('idle');
          this.particleNetwork.setOpacity(0.1);
          this.stopDataFlowAnimation();
          break;
        case 6: // Outro — converge
          this.particleNetwork.setMode('converge');
          this.particleNetwork.setOpacity(0.5);
          this.animateOutroCounters();
          break;
      }
    }

    // ---- Scroll Update (called from app.js) ----

    updateScroll(scrollY, viewportHeight) {
      const totalHeight = document.documentElement.scrollHeight - viewportHeight;
      const progress = totalHeight > 0 ? scrollY / totalHeight : 0;

      // Update progress bar
      const fill = document.getElementById('progress-fill');
      if (fill) {
        fill.style.width = (progress * 100) + '%';
      }

      // Scale Dive scroll-driven zoom (Scene 3)
      const scaleDiveSection = document.getElementById('scene-3');
      if (scaleDiveSection) {
        const rect = scaleDiveSection.getBoundingClientRect();
        const sectionHeight = scaleDiveSection.offsetHeight - viewportHeight;
        const sectionScroll = -rect.top;
        const scaleProgress = Math.max(0, Math.min(1, sectionScroll / sectionHeight));

        if (this.scaleDive && this.activeSceneIndex === 3) {
          this.scaleDive.setProgress(scaleProgress);
          this.scaleDive.render();

          // Update info panel
          this.updateScaleInfo(scaleProgress);
        }
      }
    }

    updateScaleInfo(progress) {
      const levels = [
        { name: 'HBM 패키지', mag: '×1', size: '31mm × 31mm', comp: '손톱 크기와 비슷합니다' },
        { name: 'DRAM 다이', mag: '×10', size: '~10mm × 8mm', comp: '쌀알 한 톨 위에 올라갑니다' },
        { name: 'TSV 관통 전극', mag: '×1,000', size: '직경 5~10μm', comp: '머리카락 굵기의 1/10' },
        { name: '마이크로 범프', mag: '×10,000', size: '직경 ~25μm', comp: '적혈구 3개를 나란히 놓은 크기' },
        { name: '데이터가 흐르는 곳', mag: '×100,000', size: '수 나노미터', comp: 'DNA 이중나선 굵기와 비슷합니다' },
      ];

      const idx = Math.min(Math.floor(progress * levels.length), levels.length - 1);
      const level = levels[idx];

      const nameEl = document.getElementById('scale-level-name');
      const magEl = document.getElementById('magnification');
      const sizeEl = document.getElementById('current-size');
      const compEl = document.getElementById('comparison-text');

      if (nameEl) nameEl.textContent = level.name;
      if (magEl) magEl.textContent = level.mag;
      if (sizeEl) sizeEl.textContent = level.size;
      if (compEl) compEl.textContent = level.comp;
    }

    // ---- Data Flow Comparison Animation ----

    initDataFlowCanvases() {
      this.ddrCanvas = document.getElementById('ddr-canvas');
      this.hbmCanvas = document.getElementById('hbm-canvas');

      if (this.ddrCanvas && this.hbmCanvas) {
        this.ddrCtx = this.ddrCanvas.getContext('2d');
        this.hbmCtx = this.hbmCanvas.getContext('2d');

        // Set canvas sizes
        const setCanvasSize = (canvas) => {
          const rect = canvas.parentElement.getBoundingClientRect();
          canvas.width = rect.width * window.devicePixelRatio;
          canvas.height = rect.height * window.devicePixelRatio;
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
        };

        setCanvasSize(this.ddrCanvas);
        setCanvasSize(this.hbmCanvas);

        // Initialize DDR particles (2 lanes, slow)
        const ddrW = this.ddrCanvas.width;
        const ddrH = this.ddrCanvas.height;
        for (let i = 0; i < 6; i++) {
          this.flowParticles.ddr.push({
            x: Math.random() * ddrW,
            y: ddrH * 0.4 + (i % 2) * ddrH * 0.2,
            speed: 1 + Math.random() * 0.5,
            radius: 3,
            lane: i % 2,
          });
        }

        // Initialize HBM particles (many lanes, fast)
        const hbmW = this.hbmCanvas.width;
        const hbmH = this.hbmCanvas.height;
        const lanes = 16;
        for (let i = 0; i < 48; i++) {
          const lane = i % lanes;
          this.flowParticles.hbm.push({
            x: Math.random() * hbmW,
            y: (hbmH / (lanes + 1)) * (lane + 1),
            speed: 3 + Math.random() * 2,
            radius: 2,
            lane: lane,
          });
        }
      }
    }

    startDataFlowAnimation() {
      if (this.flowAnimId) return;

      const animate = () => {
        this.drawDataFlow();
        this.flowAnimId = requestAnimationFrame(animate);
      };
      this.flowAnimId = requestAnimationFrame(animate);
    }

    stopDataFlowAnimation() {
      if (this.flowAnimId) {
        cancelAnimationFrame(this.flowAnimId);
        this.flowAnimId = null;
      }
    }

    drawDataFlow() {
      if (!this.ddrCtx || !this.hbmCtx) return;

      // --- DDR (slow, 2 lanes) ---
      const ddrCtx = this.ddrCtx;
      const ddrW = this.ddrCanvas.width;
      const ddrH = this.ddrCanvas.height;

      ddrCtx.fillStyle = 'rgba(5, 5, 15, 0.15)';
      ddrCtx.fillRect(0, 0, ddrW, ddrH);

      // Draw lanes
      ddrCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ddrCtx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const y = ddrH * 0.4 + i * ddrH * 0.2;
        ddrCtx.beginPath();
        ddrCtx.moveTo(0, y);
        ddrCtx.lineTo(ddrW, y);
        ddrCtx.stroke();
      }

      // Move and draw particles
      this.flowParticles.ddr.forEach((p) => {
        p.x += p.speed;
        if (p.x > ddrW) p.x = -4;

        ddrCtx.beginPath();
        ddrCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ddrCtx.fillStyle = 'rgba(100, 150, 200, 0.8)';
        ddrCtx.fill();
      });

      // --- HBM (fast, many lanes) ---
      const hbmCtx = this.hbmCtx;
      const hbmW = this.hbmCanvas.width;
      const hbmH = this.hbmCanvas.height;

      hbmCtx.fillStyle = 'rgba(5, 5, 15, 0.15)';
      hbmCtx.fillRect(0, 0, hbmW, hbmH);

      // Draw lanes
      hbmCtx.strokeStyle = 'rgba(0, 212, 255, 0.03)';
      hbmCtx.lineWidth = 1;
      const lanes = 16;
      for (let i = 1; i <= lanes; i++) {
        const y = (hbmH / (lanes + 1)) * i;
        hbmCtx.beginPath();
        hbmCtx.moveTo(0, y);
        hbmCtx.lineTo(hbmW, y);
        hbmCtx.stroke();
      }

      // Move and draw particles with glow
      hbmCtx.globalCompositeOperation = 'lighter';
      this.flowParticles.hbm.forEach((p) => {
        p.x += p.speed;
        if (p.x > hbmW) p.x = -4;

        hbmCtx.beginPath();
        hbmCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        hbmCtx.fillStyle = 'rgba(0, 212, 255, 0.7)';
        hbmCtx.shadowBlur = 6;
        hbmCtx.shadowColor = '#00d4ff';
        hbmCtx.fill();
      });
      hbmCtx.globalCompositeOperation = 'source-over';
      hbmCtx.shadowBlur = 0;
    }

    // ---- Counter Animations ----

    animateCounters() {
      if (this.countersAnimated) return;
      this.countersAnimated = true;

      document.querySelectorAll('.scene-dataflow .stat-value').forEach((el) => {
        const target = parseFloat(el.dataset.target);
        this.countUp(el, target, 2000);
      });
    }

    animateOutroCounters() {
      if (this.outroCountersAnimated) return;
      this.outroCountersAnimated = true;

      document.querySelectorAll('.scene-outro .stat-number').forEach((el) => {
        const target = parseInt(el.dataset.count);
        this.countUp(el, target, 2500);
      });
    }

    countUp(element, target, duration) {
      const start = 0;
      const startTime = performance.now();
      const isFloat = target % 1 !== 0;

      const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (target - start) * eased;

        if (isFloat) {
          element.textContent = current.toFixed(1);
        } else {
          element.textContent = Math.floor(current).toLocaleString();
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          if (isFloat) {
            element.textContent = target.toFixed(1);
          } else {
            element.textContent = target.toLocaleString();
          }
        }
      };

      requestAnimationFrame(update);
    }

    // ---- Cleanup ----

    destroy() {
      this.observers.forEach((obs) => obs.disconnect());
      this.observers = [];
      this.stopDataFlowAnimation();
    }

    getActiveScene() {
      return this.activeSceneIndex;
    }
  }

  window.HBM.SceneManager = SceneManager;
})();

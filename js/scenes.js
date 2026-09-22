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
      this.payloadCanvas = null;
      this.payloadCtx = null;
      this.payloadTb = 1;
      this.payloadPhase = 0;
      this.lastFlowFrame = 0;

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
        // Long-form exhibits can be several viewports tall; a low threshold
        // keeps the active scene and its animation in sync while scrolling.
        { threshold: 0.12 }
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
      this.initMuseumInteractions();
    }

    // ---- Scene Enter/Exit Logic ----

    onSceneEnter(index, element) {
      if (this.activeSceneIndex === index) return;
      this.activeSceneIndex = index;

      if (this.scaleDive && index !== 3) this.scaleDive.stop();
      this.scenes.forEach((scene, sceneIndex) => {
        scene.classList.toggle('is-active-scene', sceneIndex === index);
      });

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
          if (this.scaleDive) this.scaleDive.start();
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

      // Chapter 4 deliberately does not read page scroll position. Its video
      // is scrubbed only by wheel/drag input that begins inside the lens.
    }

    // ---- Hands-on museum interactions ----

    initMuseumInteractions() {
      this.initStackLab();
      this.initBandwidthLab();
      this.initEvolutionLab();
    }

    initStackLab() {
      const slider = document.getElementById('stack-explode');
      const stack = document.getElementById('hbm-stack');
      const output = document.getElementById('stack-gap-value');
      const detail = document.getElementById('layer-detail');
      if (!slider || !stack) return;

      const updateGap = () => {
        const value = Number(slider.value);
        const spread = value / 100;
        const layers = Array.from(stack.querySelectorAll('.stack-layer'));
        stack.style.setProperty('--stack-gap', `${Math.round(value * 0.28)}px`);
        stack.classList.toggle('is-exploded', value > 10);
        layers.forEach((layer, index) => {
          const centered = index - (layers.length - 1) / 2;
          layer.style.setProperty('--layer-offset', `${(centered * spread * 5.5).toFixed(1)}px`);
          layer.style.setProperty('--layer-depth', `${(Math.abs(centered) * spread * 2.4).toFixed(1)}px`);
        });
        if (output) output.textContent = value < 10 ? '조립 상태' : value < 42 ? '미세 분리' : value < 76 ? '층 · TSV 관찰' : '완전 분해';
        slider.setAttribute('aria-valuetext', output ? output.textContent : `${value}%`);
      };

      slider.addEventListener('input', updateGap);
      updateGap();

      const details = {
        top: ['HEAT SPREADER', '히트스프레더', '여러 층에서 생긴 열을 패키지 바깥으로 빠르게 퍼뜨립니다.'],
        base: ['BASE DIE', '베이스 로직 다이', '메모리 채널과 입출력을 제어해 GPU와 DRAM 스택 사이의 교통을 정리합니다.'],
        dram: ['DRAM DIE', 'DRAM 다이', '수십억 개의 셀이 0과 1을 저장합니다. 여러 장을 쌓아 용량을 높입니다.'],
      };

      stack.querySelectorAll('.stack-layer').forEach((layer) => {
        layer.setAttribute('tabindex', '0');
        layer.setAttribute('role', 'button');
        const showDetail = () => {
          const type = layer.dataset.layer === 'top' ? 'top' : layer.dataset.layer === 'base' ? 'base' : 'dram';
          const info = details[type];
          stack.querySelectorAll('.stack-layer').forEach((item) => item.classList.remove('selected'));
          layer.classList.add('selected');
          if (detail) detail.innerHTML = `<span class="detail-kicker">${info[0]}</span><strong>${info[1]}</strong><p>${info[2]}</p>`;
        };
        layer.addEventListener('click', showDetail);
        layer.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            showDetail();
          }
        });
      });
    }

    initBandwidthLab() {
      const slider = document.getElementById('payload-slider');
      const value = document.getElementById('payload-value');
      const ddrTime = document.getElementById('ddr-time');
      const hbmTime = document.getElementById('hbm-time');
      const ddrBar = document.getElementById('ddr-race-bar');
      const hbmBar = document.getElementById('hbm-race-bar');
      const packetCount = document.getElementById('payload-packet-count');
      const queueCount = document.getElementById('ddr-queue-count');
      const laneLoad = document.getElementById('hbm-lane-load');
      if (!slider) return;

      const formatSeconds = (seconds) => seconds >= 10 ? `${seconds.toFixed(1)}초` : `${seconds.toFixed(2)}초`;
      const update = () => {
        const payloadTb = Number(slider.value);
        const payloadGb = payloadTb * 1024;
        const ddrSeconds = payloadGb / 51.2;
        const hbmSeconds = payloadGb / 1180;
        if (value) value.textContent = `${payloadTb} TB`;
        if (ddrTime) ddrTime.textContent = formatSeconds(ddrSeconds);
        if (hbmTime) hbmTime.textContent = formatSeconds(hbmSeconds);
        if (ddrBar) ddrBar.style.transform = `scaleX(${(51.2 / 1180).toFixed(3)})`;
        if (hbmBar) hbmBar.style.transform = 'scaleX(1)';
        this.payloadTb = payloadTb;
        const visiblePackets = 18 + Math.round((payloadTb - 1) * 3.45);
        if (packetCount) packetCount.textContent = visiblePackets.toLocaleString();
        if (queueCount) queueCount.textContent = `${payloadTb} TB`;
        if (laneLoad) laneLoad.textContent = `${Math.round(4 + (payloadTb / 24) * 94)}%`;
        slider.style.setProperty('--payload-progress', `${((payloadTb - 1) / 23) * 100}%`);
        this.drawPayloadFlow(performance.now());
      };

      slider.addEventListener('input', update);
      update();
    }

    initEvolutionLab() {
      const slider = document.getElementById('evo-scrubber');
      const output = document.getElementById('evo-scrubber-value');
      const timeline = document.getElementById('evo-timeline');
      if (!slider || !timeline) return;

      const items = Array.from(timeline.querySelectorAll('.evo-item'));
      const names = items.map((item) => item.querySelector('h3')?.textContent?.trim() || 'HBM');
      const update = () => {
        const selected = Math.max(0, Math.min(items.length - 1, Number(slider.value)));
        timeline.dataset.selectedGeneration = String(selected);
        items.forEach((item, index) => {
          item.classList.toggle('is-selected', index === selected);
          item.classList.toggle('is-past', index < selected);
          item.classList.toggle('is-future', index > selected);
        });
        if (output) output.textContent = names[selected];
        slider.setAttribute('aria-valuetext', names[selected]);
      };

      slider.addEventListener('input', update);
      items.forEach((item, index) => {
        item.addEventListener('click', () => {
          slider.value = String(index);
          update();
        });
      });
      update();
    }

    // ---- Data Flow Comparison Animation ----

    initDataFlowCanvases() {
      this.ddrCanvas = document.getElementById('ddr-canvas');
      this.hbmCanvas = document.getElementById('hbm-canvas');
      this.payloadCanvas = document.getElementById('payload-flow-canvas');

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
        if (this.payloadCanvas) {
          this.payloadCtx = this.payloadCanvas.getContext('2d');
          setCanvasSize(this.payloadCanvas);
        }

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

        if (this.payloadCanvas && window.ResizeObserver) {
          this.payloadResizeObserver = new ResizeObserver(() => {
            setCanvasSize(this.payloadCanvas);
            this.drawPayloadFlow(performance.now());
          });
          this.payloadResizeObserver.observe(this.payloadCanvas.parentElement);
        }
      }
    }

    startDataFlowAnimation() {
      if (this.flowAnimId) return;

      const animate = (now) => {
        this.drawDataFlow(now);
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

    drawDataFlow(now = performance.now()) {
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
      this.drawPayloadFlow(now);
    }

    drawPayloadFlow(now = performance.now()) {
      if (!this.payloadCtx || !this.payloadCanvas) return;
      const ctx = this.payloadCtx;
      const width = this.payloadCanvas.width;
      const height = this.payloadCanvas.height;
      if (!width || !height) return;

      const delta = this.lastFlowFrame ? Math.min(now - this.lastFlowFrame, 50) : 16;
      this.lastFlowFrame = now;
      const load = Math.max(0, Math.min(1, (this.payloadTb - 1) / 23));
      this.payloadPhase = (this.payloadPhase + delta * (0.00022 + load * 0.00042)) % 1;

      ctx.clearRect(0, 0, width, height);
      const dividerY = height * 0.5;
      ctx.fillStyle = 'rgba(97, 134, 157, 0.035)';
      ctx.fillRect(0, 0, width, dividerY);
      ctx.fillStyle = 'rgba(0, 212, 255, 0.028)';
      ctx.fillRect(0, dividerY, width, dividerY);
      ctx.strokeStyle = 'rgba(122, 207, 227, 0.12)';
      ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
      ctx.beginPath();
      ctx.moveTo(0, dividerY);
      ctx.lineTo(width, dividerY);
      ctx.stroke();

      const left = width * 0.18;
      const right = width * 0.91;
      const travel = right - left;
      const ddrLaneY = [height * 0.31, height * 0.40];
      const hbmTop = height * 0.61;
      const hbmBottom = height * 0.91;
      const hbmLanes = 16;

      ctx.lineWidth = Math.max(1, width * 0.0012);
      ctx.setLineDash([width * 0.012, width * 0.012]);
      ddrLaneY.forEach((y) => {
        ctx.strokeStyle = 'rgba(148, 170, 188, 0.18)';
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      });
      for (let lane = 0; lane < hbmLanes; lane++) {
        const y = hbmTop + ((hbmBottom - hbmTop) * lane) / (hbmLanes - 1);
        ctx.strokeStyle = 'rgba(42, 195, 227, 0.11)';
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // DDR: two narrow lanes plus a queue that visibly grows with payload.
      const ddrPackets = 5 + Math.round(load * 15);
      const queueDepth = 2 + Math.round(load * 12);
      for (let queue = 0; queue < queueDepth; queue++) {
        const column = queue % 6;
        const row = Math.floor(queue / 6);
        const x = left - width * 0.025 - column * width * 0.018;
        const y = height * 0.335 + row * height * 0.052;
        ctx.fillStyle = `rgba(126, 151, 174, ${0.3 + load * 0.42})`;
        ctx.fillRect(x, y, width * 0.012, height * 0.028);
      }
      for (let i = 0; i < ddrPackets; i++) {
        const lane = i % 2;
        const position = (this.payloadPhase * 0.38 + i / ddrPackets) % 1;
        const x = left + travel * position;
        const y = ddrLaneY[lane];
        ctx.fillStyle = 'rgba(148, 171, 191, 0.84)';
        ctx.shadowBlur = width * 0.007;
        ctx.shadowColor = 'rgba(149, 180, 207, 0.55)';
        ctx.fillRect(x, y - height * 0.014, width * (0.014 + load * 0.008), height * 0.028);
      }

      // HBM: data volume occupies more parallel lanes instead of waiting.
      const hbmPackets = 13 + Math.round(load * 72);
      const activeLanes = Math.max(2, Math.min(hbmLanes, Math.round(2 + load * 14)));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < hbmPackets; i++) {
        const lane = i % activeLanes;
        const position = (this.payloadPhase * 1.8 + (i * 0.61803398875) % 1) % 1;
        const x = left + travel * position;
        const y = hbmTop + ((hbmBottom - hbmTop) * lane) / Math.max(activeLanes - 1, 1);
        const pulse = 0.68 + Math.sin(now * 0.006 + i) * 0.2;
        ctx.fillStyle = `rgba(0, 218, 255, ${pulse})`;
        ctx.shadowBlur = width * 0.011;
        ctx.shadowColor = '#00d4ff';
        ctx.fillRect(x, y - height * 0.009, width * 0.012, height * 0.018);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;

      // Source memory blocks at the left make the changing payload tangible.
      const blockHeight = height * 0.11;
      const sourceGradient = ctx.createLinearGradient(width * 0.035, 0, left, 0);
      sourceGradient.addColorStop(0, 'rgba(37, 63, 79, 0.82)');
      sourceGradient.addColorStop(1, `rgba(0, 172, 210, ${0.22 + load * 0.42})`);
      ctx.fillStyle = sourceGradient;
      ctx.fillRect(width * 0.035, dividerY - blockHeight / 2, width * 0.11, blockHeight);
      ctx.strokeStyle = 'rgba(101, 216, 240, 0.35)';
      ctx.strokeRect(width * 0.035, dividerY - blockHeight / 2, width * 0.11, blockHeight);
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
      if (this.payloadResizeObserver) this.payloadResizeObserver.disconnect();
      this.stopDataFlowAnimation();
    }

    getActiveScene() {
      return this.activeSceneIndex;
    }
  }

  window.HBM.SceneManager = SceneManager;
})();

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
      const exhibit = document.getElementById('evo-exhibit');
      const canvas = document.getElementById('evo-code-rain');
      if (!slider || !exhibit || !canvas) return;

      const ctx = canvas.getContext('2d');
      const fields = {
        current: document.getElementById('evo-counter-current'),
        year: document.getElementById('evo-year'),
        name: document.getElementById('evo-name'),
        headline: document.getElementById('evo-headline'),
        description: document.getElementById('evo-description'),
        milestone: document.getElementById('evo-milestone'),
        bandwidth: document.getElementById('evo-bandwidth'),
        capacity: document.getElementById('evo-capacity'),
        stack: document.getElementById('evo-stack'),
        interface: document.getElementById('evo-interface'),
        ratio: document.getElementById('evo-bandwidth-ratio'),
        fill: document.getElementById('evo-bandwidth-fill'),
        stackLabel: document.getElementById('evo-stack-label')
      };
      const chipLayers = Array.from(document.querySelectorAll('#evo-chip-stack .evo-chip-layers i'));

      const generations = [
        {
          name: 'HBM', year: '2013', headline: '메모리를 쌓아 올리다',
          description: '여러 DRAM을 수직으로 쌓고 TSV로 연결해, GPU 바로 옆에서 넓은 통로로 데이터를 전달하기 시작했습니다.',
          milestone: '좁고 빠른 길 여러 개 대신, 데이터가 함께 달리는 넓은 고속도로를 만들었습니다.',
          bandwidth: '128 GB/s', capacity: '1 GB', stack: '4단', stackLabel: '4-HIGH STACK', interface: '1,024-bit', ratio: 4, layers: 4
        },
        {
          name: 'HBM2', year: '2016', headline: 'GPU 가속의 동료가 되다',
          description: '용량과 속도가 함께 커지며 고성능 GPU와 가속기에 본격적으로 쓰이기 시작했습니다.',
          milestone: '한 스택에 더 많은 데이터를 담아 과학 계산과 그래픽 작업의 대기 시간을 줄였습니다.',
          bandwidth: '256 GB/s', capacity: '8 GB', stack: '8단', stackLabel: '8-HIGH STACK', interface: '1,024-bit', ratio: 8, layers: 7
        },
        {
          name: 'HBM2E', year: '2020', headline: 'AI 훈련의 속도를 끌어올리다',
          description: '더 빠른 핀 속도와 큰 용량으로, 급격히 커진 딥러닝 모델에 데이터를 쉼 없이 공급했습니다.',
          milestone: '연산 장치가 메모리를 기다리는 시간을 줄여 대규모 AI 훈련을 현실적인 속도로 만들었습니다.',
          bandwidth: '460 GB/s', capacity: '16 GB', stack: '8단', stackLabel: '8-HIGH STACK', interface: '1,024-bit', ratio: 14, layers: 7
        },
        {
          name: 'HBM3', year: '2022', headline: '대형 언어모델을 먹여 살리다',
          description: '채널 수와 전송 속도가 다시 늘어나, 수많은 행렬 연산이 동시에 데이터를 받을 수 있게 됐습니다.',
          milestone: '더 많은 AI 코어가 쉬지 않고 일하도록 메모리 대역폭을 1 TB/s에 가깝게 끌어올렸습니다.',
          bandwidth: '819 GB/s', capacity: '24 GB', stack: '12단', stackLabel: '12-HIGH STACK', interface: '1,024-bit', ratio: 25, layers: 10
        },
        {
          name: 'HBM3E', year: '2024', headline: '테라바이트의 벽을 넘다',
          description: '한 스택에서 초당 1 TB가 넘는 데이터를 옮기며, 생성형 AI 가속기의 핵심 메모리로 자리 잡았습니다.',
          milestone: '방대한 모델 가중치를 더 빠르게 읽어 AI의 학습과 답변 속도를 함께 높였습니다.',
          bandwidth: '1.18 TB/s', capacity: '36 GB', stack: '12단', stackLabel: '12-HIGH STACK', interface: '1,024-bit', ratio: 36, layers: 10
        },
        {
          name: 'HBM4', year: '2026', headline: '데이터 통로를 두 배로 넓히다',
          description: 'I/O 폭을 2,048-bit로 확장하는 차세대 HBM으로, 더 거대한 AI 시스템을 위한 대역폭을 준비합니다.',
          milestone: '통로 자체를 두 배로 넓혀 한 번에 더 많은 데이터를 주고받는 방향으로 진화합니다.',
          bandwidth: '최대 3.3 TB/s', capacity: '최대 48 GB', stack: '16단 샘플', stackLabel: '16-HIGH SAMPLE', interface: '2,048-bit', ratio: 100, layers: 12
        }
      ];

      let activeIndex = 0;
      let transitionToken = 0;
      let swapTimer = 0;
      let finishTimer = 0;
      let rainFrame = 0;

      const renderGeneration = (index) => {
        const generation = generations[index];
        exhibit.dataset.generation = String(index);
        if (fields.current) fields.current.textContent = String(index + 1).padStart(2, '0');
        Object.entries({
          year: generation.year,
          name: generation.name,
          headline: generation.headline,
          description: generation.description,
          milestone: generation.milestone,
          bandwidth: generation.bandwidth,
          capacity: generation.capacity,
          stack: generation.stack,
          interface: generation.interface,
          stackLabel: generation.stackLabel
        }).forEach(([key, value]) => {
          if (fields[key]) fields[key].textContent = value;
        });
        if (fields.ratio) fields.ratio.textContent = `HBM4 대비 ${generation.ratio}%`;
        if (fields.fill) fields.fill.style.setProperty('--meter-width', `${generation.ratio}%`);
        chipLayers.forEach((layer, layerIndex) => {
          layer.classList.toggle('is-visible', layerIndex < generation.layers);
        });
      };

      const stopRain = () => {
        cancelAnimationFrame(rainFrame);
        rainFrame = 0;
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      };

      const startRain = (token) => {
        if (!ctx) return;
        const rect = exhibit.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const width = rect.width;
        const height = rect.height;
        const fontSize = width < 600 ? 12 : 15;
        const columns = Math.ceil(width / fontSize);
        const drops = Array.from({ length: columns }, () => Math.random() * (height / fontSize));
        const speeds = drops.map(() => 0.48 + Math.random() * 1.35);
        const glyphs = ['0', '1', 'A', 'F', '7', '9', 'TSV', 'DRAM', 'HBM', '↕', '◇', '×'];

        const draw = () => {
          if (token !== transitionToken || !exhibit.classList.contains('is-transitioning')) return;
          ctx.fillStyle = 'rgba(2, 7, 13, 0.17)';
          ctx.fillRect(0, 0, width, height);
          ctx.font = `${fontSize}px "IBM Plex Mono", "Courier New", monospace`;
          ctx.textAlign = 'center';

          drops.forEach((drop, column) => {
            const x = column * fontSize + fontSize / 2;
            const y = drop * fontSize;
            const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
            ctx.fillStyle = column % 5 === 0 ? 'rgba(164, 94, 255, 0.82)' : 'rgba(0, 224, 255, 0.78)';
            ctx.fillText(glyph, x, y);
            ctx.fillStyle = 'rgba(220, 252, 255, 0.92)';
            ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y - fontSize);
            drops[column] += speeds[column];
            if (y > height + 80 && Math.random() > 0.965) drops[column] = -Math.random() * 18;
          });

          rainFrame = requestAnimationFrame(draw);
        };

        ctx.clearRect(0, 0, width, height);
        draw();
      };

      const updateScrubber = (index) => {
        const generation = generations[index];
        const progress = (index / (generations.length - 1)) * 100;
        slider.style.setProperty('--evo-progress', `${progress}%`);
        if (output) output.textContent = `${generation.name} · ${generation.year}`;
        slider.setAttribute('aria-valuetext', `${generation.name}, ${generation.year}년`);
      };

      const transitionTo = (index) => {
        const selected = Math.max(0, Math.min(generations.length - 1, index));
        updateScrubber(selected);
        transitionToken += 1;
        const token = transitionToken;
        window.clearTimeout(swapTimer);
        window.clearTimeout(finishTimer);
        stopRain();

        if (selected === activeIndex && !exhibit.classList.contains('is-transitioning')) return;
        exhibit.classList.remove('is-reforming');
        exhibit.classList.add('is-transitioning');
        startRain(token);

        swapTimer = window.setTimeout(() => {
          if (token !== transitionToken) return;
          activeIndex = selected;
          renderGeneration(activeIndex);
          exhibit.classList.add('is-reforming');
        }, 560);

        finishTimer = window.setTimeout(() => {
          if (token !== transitionToken) return;
          exhibit.classList.remove('is-transitioning', 'is-reforming');
          stopRain();
        }, 1500);
      };

      slider.addEventListener('input', () => transitionTo(Number(slider.value)));
      slider.addEventListener('change', () => transitionTo(Number(slider.value)));
      renderGeneration(activeIndex);
      updateScrubber(activeIndex);
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

/**
 * HBM Storytelling — Main Application Entry Point
 * Initializes all modules, handles scroll, resize, and navigation.
 */
window.HBM = window.HBM || {};

(function () {
  'use strict';

  class App {
    constructor() {
      this.particleNetwork = null;
      this.scaleDive = null;
      this.sceneManager = null;
      this.isReady = false;

      // Throttle scroll handler
      this.scrollTicking = false;
      this.lastScrollY = 0;

      this.init();
    }

    init() {
      // Wait for DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }

    setup() {
      // ---- Initialize Particle Network ----
      const particleCanvas = document.getElementById('particle-canvas');
      if (particleCanvas) {
        particleCanvas.width = window.innerWidth * window.devicePixelRatio;
        particleCanvas.height = window.innerHeight * window.devicePixelRatio;
        particleCanvas.style.width = window.innerWidth + 'px';
        particleCanvas.style.height = window.innerHeight + 'px';

        this.particleNetwork = new HBM.ParticleNetwork(particleCanvas, {
          nodeCount: window.innerWidth < 768 ? 40 : 80,
          connectionDistance: window.innerWidth < 768 ? 120 : 150,
        });
        this.particleNetwork.start();
      }

      // ---- Initialize Scale Dive ----
      const scaleSection = document.getElementById('scene-3');
      const scaleCanvas = document.getElementById('scale-canvas');
      if (scaleSection && scaleCanvas) {
        const rect = scaleSection.querySelector('.scale-viewport-container');
        if (rect) {
          const bounds = rect.getBoundingClientRect();
          scaleCanvas.width = bounds.width * window.devicePixelRatio;
          scaleCanvas.height = bounds.height * window.devicePixelRatio;
          scaleCanvas.style.width = bounds.width + 'px';
          scaleCanvas.style.height = bounds.height + 'px';
        }

        this.scaleDive = new HBM.ScaleDive(scaleSection, scaleCanvas);
      }

      // ---- Initialize Scene Manager ----
      this.sceneManager = new HBM.SceneManager(
        this.particleNetwork,
        this.scaleDive
      );

      // ---- Bind Events ----
      this.bindEvents();

      // ---- Initial scroll position check ----
      this.onScroll();

      this.isReady = true;
    }

    bindEvents() {
      // Scroll handler (throttled with rAF)
      window.addEventListener('scroll', () => {
        this.lastScrollY = window.scrollY;
        if (!this.scrollTicking) {
          requestAnimationFrame(() => {
            this.onScroll();
            this.scrollTicking = false;
          });
          this.scrollTicking = true;
        }
      }, { passive: true });

      // Resize handler (debounced)
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => this.onResize(), 200);
      });

      // Progress dot navigation
      document.querySelectorAll('.progress-dots .dot').forEach((dot) => {
        dot.addEventListener('click', () => {
          const sceneIndex = parseInt(dot.dataset.scene);
          const target = document.getElementById('scene-' + sceneIndex);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          const next = this.sceneManager.getActiveScene() + 1;
          if (next < 7) {
            const target = document.getElementById('scene-' + next);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          }
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          const prev = this.sceneManager.getActiveScene() - 1;
          if (prev >= 0) {
            const target = document.getElementById('scene-' + prev);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }

    onScroll() {
      const scrollY = this.lastScrollY;
      const vh = window.innerHeight;

      if (this.sceneManager) {
        this.sceneManager.updateScroll(scrollY, vh);
      }
    }

    onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio;

      // Resize particle canvas
      const particleCanvas = document.getElementById('particle-canvas');
      if (particleCanvas && this.particleNetwork) {
        particleCanvas.style.width = w + 'px';
        particleCanvas.style.height = h + 'px';
        this.particleNetwork.resize(w * dpr, h * dpr);
      }

      // Resize scale canvas
      const scaleCanvas = document.getElementById('scale-canvas');
      if (scaleCanvas && this.scaleDive) {
        const container = scaleCanvas.parentElement;
        if (container) {
          const bounds = container.getBoundingClientRect();
          scaleCanvas.width = bounds.width * dpr;
          scaleCanvas.height = bounds.height * dpr;
          scaleCanvas.style.width = bounds.width + 'px';
          scaleCanvas.style.height = bounds.height + 'px';
          this.scaleDive.resize(bounds.width * dpr, bounds.height * dpr);
        }
      }
    }
  }

  // ---- Boot ----
  window.HBM.App = App;
  window.HBM.app = new App();
})();

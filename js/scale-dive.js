window.HBM = window.HBM || {};

/**
 * Scale Dive module for HBM storytelling website.
 * Creates a microscope-like zoom-in visualization from macro to nano scale.
 */
window.HBM.ScaleDive = class {
    /**
     * @param {HTMLElement} container - DOM element for this scene
     * @param {HTMLCanvasElement} canvas - Shared Canvas element
     * @param {Object} options - Configuration options
     */
    constructor(container, canvas, options = {}) {
        this.container = container;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.options = Object.assign({
            colors: {
                primary: '#00d4ff',
                secondary: '#7b2ff7',
                accent: '#ff6b35',
                bg: '#0a0a0f',
                text: '#e0e0e0'
            }
        }, options);

        this.width = canvas.width;
        this.height = canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        
        // Viewport radius (microscope view)
        this.viewportRadius = Math.min(this.width, this.height) * 0.4;
        
        this.progress = 0;
        this.currentLevel = 0;
        this.levelProgress = 0;
        
        this.time = 0;
        
        this.levels = [
            {
                name: 'HBM 패키지',
                size: '31mm × 31mm',
                comparison: '손톱 크기와 비슷합니다',
                magBase: 1,
                magTarget: 10,
                drawIcon: this.drawFingernailIcon.bind(this),
                drawVisual: this.drawLevel0.bind(this)
            },
            {
                name: 'DRAM 다이',
                size: '~10mm × 8mm',
                comparison: '쌀알 한 톨 위에 올라갑니다',
                magBase: 10,
                magTarget: 100,
                drawIcon: this.drawRiceIcon.bind(this),
                drawVisual: this.drawLevel1.bind(this)
            },
            {
                name: 'TSV 관통 전극',
                size: '직경 5~10μm',
                comparison: '머리카락 굵기의 1/10',
                magBase: 100,
                magTarget: 1000,
                drawIcon: this.drawHairIcon.bind(this),
                drawVisual: this.drawLevel2.bind(this)
            },
            {
                name: '마이크로 범프',
                size: '직경 ~25μm',
                comparison: '적혈구 3개를 나란히 놓은 크기',
                magBase: 1000,
                magTarget: 10000,
                drawIcon: this.drawRBCIcon.bind(this),
                drawVisual: this.drawLevel3.bind(this)
            },
            {
                name: '데이터가 흐르는 곳',
                size: '수 나노미터의 회로',
                comparison: 'DNA 이중나선 굵기와 비슷합니다',
                magBase: 10000,
                magTarget: 100000,
                drawIcon: this.drawDNAIcon.bind(this),
                drawVisual: this.drawLevel4.bind(this)
            }
        ];
    }

    /**
     * Update the progress of the scene (0 to 1)
     * @param {number} progress 
     */
    setProgress(progress) {
        this.progress = Math.max(0, Math.min(1, progress));
        
        const totalLevels = this.levels.length;
        const rawLevel = this.progress * totalLevels;
        
        this.currentLevel = Math.min(Math.floor(rawLevel), totalLevels - 1);
        
        // If we're at exactly 1.0 progress, set to the end of the last level
        if (this.progress === 1) {
            this.currentLevel = totalLevels - 1;
            this.levelProgress = 1;
        } else {
            this.levelProgress = rawLevel - this.currentLevel;
        }
    }

    /**
     * Handle canvas resize
     * @param {number} width 
     * @param {number} height 
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.viewportRadius = Math.min(this.width, this.height) * 0.4;
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Clear references
        this.ctx = null;
        this.canvas = null;
        this.container = null;
    }

    /**
     * Render the scene
     */
    render() {
        if (!this.ctx) return;
        
        this.time += 0.01;
        const ctx = this.ctx;
        
        ctx.save();
        
        // Draw background
        ctx.fillStyle = this.options.colors.bg;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw tunnel effect around viewport
        this.drawTunnel(ctx);
        
        // Create clipping region for viewport
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw inner background
        ctx.fillStyle = '#050508';
        ctx.fillRect(this.centerX - this.viewportRadius, this.centerY - this.viewportRadius, this.viewportRadius * 2, this.viewportRadius * 2);
        
        // Determine levels to blend
        const levelData = this.levels[this.currentLevel];
        const nextLevelData = this.levels[Math.min(this.currentLevel + 1, this.levels.length - 1)];
        
        // Crossfade between levels in the latter half of level progress
        let alpha = 1;
        let nextAlpha = 0;
        
        if (this.levelProgress > 0.8 && this.currentLevel < this.levels.length - 1) {
            const blend = (this.levelProgress - 0.8) / 0.2;
            alpha = 1 - blend;
            nextAlpha = blend;
        }
        
        // Draw current visual
        if (alpha > 0) {
            ctx.globalAlpha = alpha;
            ctx.save();
            ctx.translate(this.centerX, this.centerY);
            // Add slight continuous zoom effect within the level
            const localZoom = 1 + this.levelProgress * 0.5;
            ctx.scale(localZoom, localZoom);
            levelData.drawVisual(ctx);
            ctx.restore();
        }
        
        // Draw next visual blending in
        if (nextAlpha > 0) {
            ctx.globalAlpha = nextAlpha;
            ctx.save();
            ctx.translate(this.centerX, this.centerY);
            // It starts zoomed out and zooms in
            const nextLocalZoom = 0.5 + this.levelProgress * 0.5;
            ctx.scale(nextLocalZoom, nextLocalZoom);
            nextLevelData.drawVisual(ctx);
            ctx.restore();
        }
        
        ctx.globalAlpha = 1;
        
        // Draw viewport border and glow
        this.drawViewportBorder(ctx);
        
        // Draw UI Elements (Scale Bar, Comparison)
        this.drawUI(ctx, levelData, alpha, nextLevelData, nextAlpha);
        
        ctx.restore();
    }
    
    drawTunnel(ctx) {
        ctx.save();
        ctx.translate(this.centerX, this.centerY);
        
        const rings = 8;
        for (let i = 0; i < rings; i++) {
            // Calculate base ring position
            const ringOffset = (i / rings + this.progress * 2) % 1;
            // Map 0-1 to radius from viewport up to edge of screen
            const maxRadius = Math.max(this.width, this.height);
            const r = this.viewportRadius + ringOffset * (maxRadius - this.viewportRadius);
            
            // Draw ring
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.1 * (1 - ringOffset)})`;
            ctx.lineWidth = 2 + ringOffset * 5;
            ctx.stroke();
            
            // Draw rotating dashes
            ctx.save();
            ctx.rotate(this.time * 0.5 * (i % 2 === 0 ? 1 : -1));
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.setLineDash([20 * ringOffset, 40 * ringOffset]);
            ctx.strokeStyle = `rgba(123, 47, 247, ${0.2 * (1 - ringOffset)})`;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
    
    drawViewportBorder(ctx) {
        // Inner shadow / glow
        const grad = ctx.createRadialGradient(
            this.centerX, this.centerY, this.viewportRadius * 0.8,
            this.centerX, this.centerY, this.viewportRadius
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0, 212, 255, 0.3)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Solid border
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this.options.colors.primary;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Outer glow
        ctx.shadowColor = this.options.colors.primary;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY - this.viewportRadius);
        ctx.lineTo(this.centerX, this.centerY - this.viewportRadius + 30);
        ctx.moveTo(this.centerX, this.centerY + this.viewportRadius - 30);
        ctx.lineTo(this.centerX, this.centerY + this.viewportRadius);
        ctx.moveTo(this.centerX - this.viewportRadius, this.centerY);
        ctx.lineTo(this.centerX - this.viewportRadius + 30, this.centerY);
        ctx.moveTo(this.centerX + this.viewportRadius - 30, this.centerY);
        ctx.lineTo(this.centerX + this.viewportRadius, this.centerY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawUI(ctx, currentLvl, alpha, nextLvl, nextAlpha) {
        // --- Scale Bar (Bottom Right) ---
        const scaleBaseMag = currentLvl.magBase;
        const scaleTargetMag = currentLvl.magTarget;
        
        // Interpolate magnification
        let currentMag = scaleBaseMag + (scaleTargetMag - scaleBaseMag) * this.levelProgress;
        
        const scaleX = this.centerX + this.viewportRadius * 0.4;
        const scaleY = this.centerY + this.viewportRadius * 0.7;
        
        ctx.fillStyle = this.options.colors.text;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`×${Math.floor(currentMag).toLocaleString()}`, scaleX + 80, scaleY);
        
        // Interpolate size text (fade out current, fade in next if transitioning)
        ctx.font = '14px sans-serif';
        ctx.globalAlpha = alpha;
        ctx.fillText(currentLvl.size, scaleX + 80, scaleY + 20);
        
        if (nextAlpha > 0) {
            ctx.globalAlpha = nextAlpha;
            ctx.fillText(nextLvl.size, scaleX + 80, scaleY + 20);
        }
        ctx.globalAlpha = 1;
        
        // Draw scale line
        ctx.strokeStyle = this.options.colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(scaleX - 40, scaleY + 25);
        ctx.lineTo(scaleX + 80, scaleY + 25);
        ctx.moveTo(scaleX - 40, scaleY + 20);
        ctx.lineTo(scaleX - 40, scaleY + 30);
        ctx.moveTo(scaleX + 80, scaleY + 20);
        ctx.lineTo(scaleX + 80, scaleY + 30);
        ctx.stroke();
        
        // --- Comparison Panel (Left) ---
        const panelX = this.centerX - this.viewportRadius * 0.8;
        const panelY = this.centerY;
        
        const drawPanelInfo = (lvl, opacity) => {
            if (opacity <= 0) return;
            ctx.globalAlpha = opacity;
            
            // Name
            ctx.fillStyle = this.options.colors.primary;
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(lvl.name, panelX, panelY - 40);
            
            // Comparison text
            ctx.fillStyle = this.options.colors.text;
            ctx.font = '14px sans-serif';
            ctx.fillText(lvl.comparison, panelX, panelY - 15);
            
            // Icon
            ctx.save();
            ctx.translate(panelX + 20, panelY + 30);
            lvl.drawIcon(ctx);
            ctx.restore();
            
            ctx.globalAlpha = 1;
        };
        
        drawPanelInfo(currentLvl, alpha);
        drawPanelInfo(nextLvl, nextAlpha);
    }
    
    // --- Level Visuals ---
    
    // Level 0: HBM Package
    drawLevel0(ctx) {
        const size = this.viewportRadius * 0.6;
        
        // Draw package outline
        ctx.strokeStyle = this.options.colors.secondary;
        ctx.lineWidth = 2;
        ctx.strokeRect(-size, -size, size * 2, size * 2);
        
        // Draw inner die area
        ctx.fillStyle = 'rgba(123, 47, 247, 0.1)';
        ctx.fillRect(-size*0.8, -size*0.8, size*1.6, size*1.6);
        ctx.strokeRect(-size*0.8, -size*0.8, size*1.6, size*1.6);
        
        // Draw pin array pattern
        ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
        const pinSpacing = size / 5;
        for (let x = -size + pinSpacing/2; x < size; x += pinSpacing) {
            for (let y = -size + pinSpacing/2; y < size; y += pinSpacing) {
                // Skip center area for some structure
                if (Math.abs(x) < size*0.4 && Math.abs(y) < size*0.4) continue;
                ctx.beginPath();
                ctx.arc(x, y, pinSpacing * 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Level 1: DRAM Die
    drawLevel1(ctx) {
        const width = this.viewportRadius * 0.8;
        const height = this.viewportRadius * 0.6;
        
        // Die outline
        ctx.strokeStyle = this.options.colors.primary;
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(0, 212, 255, 0.05)';
        ctx.fillRect(-width, -height, width * 2, height * 2);
        ctx.strokeRect(-width, -height, width * 2, height * 2);
        
        // Memory banks (grid)
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 1;
        
        const cols = 8;
        const rows = 4;
        const cellW = (width * 2) / cols;
        const cellH = (height * 2) / rows;
        
        for (let i = 0; i <= cols; i++) {
            ctx.beginPath();
            ctx.moveTo(-width + i * cellW, -height);
            ctx.lineTo(-width + i * cellW, height);
            ctx.stroke();
        }
        for (let i = 0; i <= rows; i++) {
            ctx.beginPath();
            ctx.moveTo(-width, -height + i * cellH);
            ctx.lineTo(width, -height + i * cellH);
            ctx.stroke();
        }
        
        // Central logic area
        ctx.fillStyle = 'rgba(123, 47, 247, 0.3)';
        ctx.fillRect(-width * 0.1, -height, width * 0.2, height * 2);
    }
    
    // Level 2: TSV
    drawLevel2(ctx) {
        // Cross section of silicon with vertical copper pillars
        const numPillars = 5;
        const spacing = this.viewportRadius * 0.4;
        const pWidth = this.viewportRadius * 0.1;
        const pHeight = this.viewportRadius * 1.5;
        
        // Draw silicon layers
        ctx.fillStyle = 'rgba(50, 50, 70, 0.5)';
        ctx.fillRect(-this.viewportRadius, -pHeight/2, this.viewportRadius*2, pHeight);
        
        // Draw horizontal layer lines
        ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
        ctx.lineWidth = 1;
        for (let i = -pHeight/2; i < pHeight/2; i += 40) {
            ctx.beginPath();
            ctx.moveTo(-this.viewportRadius, i);
            ctx.lineTo(this.viewportRadius, i);
            ctx.stroke();
        }
        
        // Draw TSV Pillars
        const startX = -((numPillars - 1) * spacing) / 2;
        
        for (let i = 0; i < numPillars; i++) {
            const x = startX + i * spacing;
            
            // Copper gradient
            const grad = ctx.createLinearGradient(x - pWidth/2, 0, x + pWidth/2, 0);
            grad.addColorStop(0, '#8B4513');
            grad.addColorStop(0.5, '#D2691E');
            grad.addColorStop(1, '#8B4513');
            
            ctx.fillStyle = grad;
            ctx.fillRect(x - pWidth/2, -pHeight/2, pWidth, pHeight);
            
            // Data flow animation along TSV
            const flowOffset = (this.time * 50 + i * 100) % pHeight;
            ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(x, -pHeight/2 + flowOffset, pWidth/3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Level 3: Microbumps
    drawLevel3(ctx) {
        // Top and bottom substrate
        ctx.fillStyle = 'rgba(50, 50, 70, 0.6)';
        ctx.fillRect(-this.viewportRadius, -this.viewportRadius*0.8, this.viewportRadius*2, this.viewportRadius*0.4);
        ctx.fillRect(-this.viewportRadius, this.viewportRadius*0.4, this.viewportRadius*2, this.viewportRadius*0.4);
        
        // Solder bumps connecting them
        const numBumps = 3;
        const spacing = this.viewportRadius * 0.6;
        const startX = -((numBumps - 1) * spacing) / 2;
        
        for (let i = 0; i < numBumps; i++) {
            const x = startX + i * spacing;
            
            // Upper pad
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x - 30, -this.viewportRadius*0.4, 60, 20);
            
            // Lower pad
            ctx.fillRect(x - 30, this.viewportRadius*0.4 - 20, 60, 20);
            
            // The bump (oval-ish)
            ctx.beginPath();
            ctx.ellipse(x, 0, 45, 60, 0, 0, Math.PI * 2);
            
            const grad = ctx.createRadialGradient(x - 10, -10, 5, x, 0, 50);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.5, '#A9A9A9');
            grad.addColorStop(1, '#696969');
            
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#4A4A4A';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    // Level 4: Data Traces (Nano scale)
    drawLevel4(ctx) {
        ctx.strokeStyle = this.options.colors.primary;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const paths = [
            [[-150, -100], [-50, -100], [0, -50], [100, -50], [150, 0]],
            [[-150, 50], [-100, 50], [-50, 0], [50, 0], [100, 100], [150, 100]],
            [[-100, -150], [0, -150], [50, -100], [150, -100]],
            [[-150, 150], [-50, 150], [0, 100], [150, 100]]
        ];
        
        paths.forEach((path, idx) => {
            // Draw trace
            ctx.beginPath();
            ctx.moveTo(path[0][0] * 1.5, path[0][1] * 1.5);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i][0] * 1.5, path[i][1] * 1.5);
            }
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
            ctx.stroke();
            
            // Draw glowing data packet moving along trace
            // Calculate total length roughly
            const totalLen = path.length * 100;
            const t = ((this.time * 30 + idx * 200) % totalLen) / totalLen;
            
            // Find current segment
            const segs = path.length - 1;
            const currentSeg = Math.min(Math.floor(t * segs), segs - 1);
            const segT = (t * segs) - currentSeg;
            
            const p1 = path[currentSeg];
            const p2 = path[currentSeg + 1];
            
            const px = p1[0] + (p2[0] - p1[0]) * segT;
            const py = p1[1] + (p2[1] - p1[1]) * segT;
            
            ctx.beginPath();
            ctx.arc(px * 1.5, py * 1.5, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.shadowColor = this.options.colors.primary;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
    
    // --- Icons for comparison ---
    
    drawFingernailIcon(ctx) {
        ctx.strokeStyle = this.options.colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Finger outline
        ctx.arc(0, 20, 20, Math.PI, 0);
        ctx.lineTo(20, 40);
        ctx.lineTo(-20, 40);
        ctx.closePath();
        ctx.stroke();
        
        // Fingernail
        ctx.beginPath();
        ctx.arc(0, 15, 12, Math.PI, 0);
        ctx.stroke();
    }
    
    drawRiceIcon(ctx) {
        ctx.strokeStyle = this.options.colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 25, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawHairIcon(ctx) {
        ctx.strokeStyle = this.options.colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, -20);
        ctx.bezierCurveTo(0, -10, -10, 10, 15, 20);
        ctx.stroke();
        
        // Zoom circle to show cross section
        ctx.beginPath();
        ctx.arc(-15, -20, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-15, -20, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawRBCIcon(ctx) {
        ctx.strokeStyle = this.options.colors.text;
        ctx.fillStyle = 'rgba(255, 107, 53, 0.5)';
        ctx.lineWidth = 2;
        
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.ellipse(i * 15, 0, 8, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Inner dimple
            ctx.beginPath();
            ctx.ellipse(i * 15, 0, 3, 5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    drawDNAIcon(ctx) {
        ctx.strokeStyle = this.options.colors.text;
        ctx.lineWidth = 2;
        
        for (let i = -20; i <= 20; i += 5) {
            const y = i;
            const x1 = Math.sin(i * 0.2) * 10;
            const x2 = Math.sin(i * 0.2 + Math.PI) * 10;
            
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(x1, y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x2, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};

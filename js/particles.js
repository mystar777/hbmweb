window.HBM = window.HBM || {};

(function() {
    class ParticleNetwork {
        constructor(canvas, options = {}) {
            this.canvas = canvas;
            // Use alpha: true for transparent background
            this.ctx = canvas.getContext('2d', { alpha: true });
            
            this.options = Object.assign({
                nodeCount: 80,
                connectionDistance: 150,
                particleSpeed: 1.5,
                colors: { 
                    node: '#00d4ff', 
                    connection: '#1a3a5c', 
                    particle: '#ffffff', 
                    nodePulse: '#7b2ff7' 
                },
                glowIntensity: 0.8
            }, options);
            
            this.width = canvas.width;
            this.height = canvas.height;
            
            this.nodes = [];
            this.particles = [];
            this.mode = 'neural';
            
            this.isRunning = false;
            this.animationId = null;
            this.lastTime = 0;
            this.opacity = 1.0;
            
            // Performance monitoring
            this.frameTimes = [];
            this.lowPerfThreshold = 20; // ms
            this.isLowPerf = false;
            
            this.initNetwork();
        }
        
        initNetwork() {
            this.nodes = [];
            this.particles = [];
            
            const count = this.isLowPerf ? Math.floor(this.options.nodeCount * 0.5) : this.options.nodeCount;
            
            // Create nodes
            for (let i = 0; i < count; i++) {
                // Determine color bias (mostly cyan, some purple)
                const isPurple = Math.random() < 0.2;
                
                this.nodes.push({
                    id: i,
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    baseX: 0, // Set later based on mode
                    baseY: 0,
                    driftOffsetX: Math.random() * Math.PI * 2,
                    driftOffsetY: Math.random() * Math.PI * 2,
                    driftSpeedX: 0.0005 + Math.random() * 0.001,
                    driftSpeedY: 0.0005 + Math.random() * 0.001,
                    driftAmplitudeX: 15 + Math.random() * 15,
                    driftAmplitudeY: 15 + Math.random() * 15,
                    targetX: 0,
                    targetY: 0,
                    radius: 2 + Math.random() * 3,
                    connections: [],
                    pulsePhase: Math.random() * Math.PI * 2,
                    pulseIntensity: 0,
                    baseOpacity: 0.3 + Math.random() * 0.5,
                    color: isPurple ? this.options.colors.nodePulse : this.options.colors.node
                });
            }
            
            this._applyModeLayout(this.mode);
            
            // Instantly move to targets for initial layout
            this.nodes.forEach(node => {
                node.x = node.targetX;
                node.y = node.targetY;
                node.baseX = node.targetX;
                node.baseY = node.targetY;
            });
            
            this.reconnectNodes();
            this.initParticles();
        }
        
        reconnectNodes() {
            // Clear existing connections
            this.nodes.forEach(node => { node.connections = []; });
            
            for (let i = 0; i < this.nodes.length; i++) {
                const nodeA = this.nodes[i];
                const distances = [];
                
                for (let j = 0; j < this.nodes.length; j++) {
                    if (i === j) continue;
                    const nodeB = this.nodes[j];
                    const dx = nodeA.baseX - nodeB.baseX;
                    const dy = nodeA.baseY - nodeB.baseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < this.options.connectionDistance) {
                        distances.push({ node: nodeB, dist: dist });
                    }
                }
                
                // Sort by distance and connect 2-4 nearest
                distances.sort((a, b) => a.dist - b.dist);
                const connectCount = 2 + Math.floor(Math.random() * 3);
                
                for (let k = 0; k < Math.min(connectCount, distances.length); k++) {
                    const targetNode = distances[k].node;
                    // Avoid duplicate connections if possible, though undirected is fine for rendering
                    if (!nodeA.connections.includes(targetNode)) {
                        nodeA.connections.push(targetNode);
                        if (!targetNode.connections.includes(nodeA)) {
                            targetNode.connections.push(nodeA);
                        }
                    }
                }
            }
        }
        
        initParticles() {
            const particleCount = this.isLowPerf ? 20 : (this.mode === 'idle' ? 10 : 40);
            this.particles = [];
            
            for (let i = 0; i < particleCount; i++) {
                this.spawnParticle();
            }
        }
        
        spawnParticle() {
            // Find a random node with connections
            let startNode = null;
            let attempts = 0;
            while (!startNode && attempts < 10) {
                const candidate = this.nodes[Math.floor(Math.random() * this.nodes.length)];
                if (candidate.connections.length > 0) {
                    startNode = candidate;
                }
                attempts++;
            }
            
            if (!startNode) return; // Fail safe
            
            const targetNode = startNode.connections[Math.floor(Math.random() * startNode.connections.length)];
            
            const speedMultiplier = this.mode === 'converge' ? 2.5 : (this.mode === 'idle' ? 0.5 : 1.0);
            
            this.particles.push({
                fromNode: startNode,
                toNode: targetNode,
                progress: 0, // 0 to 1
                speed: (this.options.particleSpeed * speedMultiplier) / 100 + (Math.random() * 0.01),
                trail: [], // Store previous positions {x, y}
                maxTrail: 5 + Math.floor(Math.random() * 4)
            });
        }
        
        setMode(mode) {
            if (this.mode === mode) return;
            this.mode = mode;
            this._applyModeLayout(mode);
            
            // Adjust particle count for idle mode
            if (mode === 'idle' && this.particles.length > 10) {
                this.particles.length = 10;
            } else if (mode !== 'idle' && this.particles.length < 40 && !this.isLowPerf) {
                while(this.particles.length < 40) this.spawnParticle();
            }
            
            // Reconnect based on new targets so particles know where to go next
            // We use targetX/Y for distance calculation here
            this.nodes.forEach(node => {
                node.baseX = node.targetX;
                node.baseY = node.targetY;
            });
            this.reconnectNodes();
        }
        
        _applyModeLayout(mode) {
            const cx = this.width / 2;
            const cy = this.height / 2;
            
            this.nodes.forEach((node, i) => {
                switch(mode) {
                    case 'neural':
                    case 'idle':
                        // Spread randomly
                        node.targetX = Math.random() * this.width;
                        node.targetY = Math.random() * this.height;
                        break;
                        
                    case 'dataflow':
                        // CPU (left), HBM (center col), GPU (right)
                        const totalNodes = this.nodes.length;
                        const part = i % 3; // 0: CPU, 1: HBM, 2: GPU
                        
                        if (part === 0) { // CPU block
                            node.targetX = this.width * 0.2 + (Math.random() * 100 - 50);
                            node.targetY = cy + (Math.random() * 300 - 150);
                        } else if (part === 1) { // HBM stack (vertical)
                            node.targetX = cx + (Math.random() * 40 - 20);
                            node.targetY = cy + (Math.random() * 400 - 200);
                        } else { // GPU block
                            node.targetX = this.width * 0.8 + (Math.random() * 100 - 50);
                            node.targetY = cy + (Math.random() * 300 - 150);
                        }
                        break;
                        
                    case 'converge':
                        // Tight cluster in center
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * 100;
                        node.targetX = cx + Math.cos(angle) * dist;
                        node.targetY = cy + Math.sin(angle) * dist;
                        break;
                }
            });
        }
        
        resize(width, height) {
            const oldWidth = this.width || width;
            const oldHeight = this.height || height;
            
            this.width = width;
            this.height = height;
            this.canvas.width = width;
            this.canvas.height = height;
            
            const ratioX = width / oldWidth;
            const ratioY = height / oldHeight;
            
            this.nodes.forEach(node => {
                node.targetX *= ratioX;
                node.targetY *= ratioY;
                node.baseX *= ratioX;
                node.baseY *= ratioY;
                node.x *= ratioX;
                node.y *= ratioY;
            });
        }
        
        setOpacity(value) {
            this.opacity = Math.max(0, Math.min(1, value));
        }
        
        start() {
            if (this.isRunning) return;
            this.isRunning = true;
            this.lastTime = performance.now();
            this.animationId = requestAnimationFrame((time) => this.loop(time));
        }
        
        stop() {
            this.isRunning = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
        
        loop(time) {
            if (!this.isRunning) return;
            
            const deltaTime = time - this.lastTime;
            this.lastTime = time;
            
            // Performance monitoring
            this.frameTimes.push(deltaTime);
            if (this.frameTimes.length > 60) {
                this.frameTimes.shift();
                const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
                if (avg > this.lowPerfThreshold && !this.isLowPerf) {
                    this.isLowPerf = true;
                    // Downgrade quality gracefully
                    this.nodes = this.nodes.slice(0, Math.floor(this.options.nodeCount * 0.5));
                    this.particles = this.particles.slice(0, 20);
                    this.reconnectNodes();
                }
            }
            
            this.update(deltaTime, time);
            this.draw();
            
            this.animationId = requestAnimationFrame((t) => this.loop(t));
        }
        
        update(deltaTime, time) {
            const dtMult = deltaTime / 16.66; // Normalize to 60fps
            
            // Update Nodes
            this.nodes.forEach(node => {
                // Smoothly move baseX/Y towards targetX/Y for mode transitions
                node.baseX += (node.targetX - node.baseX) * 0.05 * dtMult;
                node.baseY += (node.targetY - node.baseY) * 0.05 * dtMult;
                
                // Drift animation
                node.driftOffsetX += node.driftSpeedX * deltaTime;
                node.driftOffsetY += node.driftSpeedY * deltaTime;
                
                const driftX = Math.sin(node.driftOffsetX) * node.driftAmplitudeX;
                const driftY = Math.cos(node.driftOffsetY) * node.driftAmplitudeY;
                
                node.x = node.baseX + driftX;
                node.y = node.baseY + driftY;
                
                // Pulse decay
                if (node.pulseIntensity > 0) {
                    node.pulseIntensity = Math.max(0, node.pulseIntensity - 0.02 * dtMult);
                }
            });
            
            // Update Particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                
                // Store current position in trail before moving
                const currentX = p.fromNode.x + (p.toNode.x - p.fromNode.x) * p.progress;
                const currentY = p.fromNode.y + (p.toNode.y - p.fromNode.y) * p.progress;
                
                p.trail.unshift({ x: currentX, y: currentY });
                if (p.trail.length > p.maxTrail) {
                    p.trail.pop();
                }
                
                // Move particle
                p.progress += p.speed * dtMult;
                
                if (p.progress >= 1) {
                    // Reached target
                    p.toNode.pulseIntensity = 1.0; // Trigger pulse
                    
                    // Pick next destination
                    const nextOptions = p.toNode.connections;
                    if (nextOptions.length > 0) {
                        p.fromNode = p.toNode;
                        // Avoid going back exactly where we came from if possible
                        let next = nextOptions[Math.floor(Math.random() * nextOptions.length)];
                        if (next === p.fromNode && nextOptions.length > 1) {
                            const filtered = nextOptions.filter(n => n !== p.fromNode);
                            next = filtered[Math.floor(Math.random() * filtered.length)];
                        }
                        
                        p.toNode = next;
                        p.progress = 0;
                    } else {
                        // Dead end, remove and respawn
                        this.particles.splice(i, 1);
                        this.spawnParticle();
                    }
                }
            }
        }
        
        draw() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);
            
            if (this.opacity <= 0) return;
            
            ctx.globalAlpha = this.opacity;
            
            // Draw connections
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = 1;
            
            // Optimization: draw all lines of same color in one path
            ctx.beginPath();
            ctx.strokeStyle = this.options.colors.connection;
            
            // Keep track of drawn lines to avoid drawing a-b and b-a
            const drawn = new Set();
            
            this.nodes.forEach(nodeA => {
                nodeA.connections.forEach(nodeB => {
                    const id1 = Math.min(nodeA.id, nodeB.id);
                    const id2 = Math.max(nodeA.id, nodeB.id);
                    const key = `${id1}-${id2}`;
                    
                    if (!drawn.has(key)) {
                        drawn.add(key);
                        
                        const dx = nodeA.x - nodeB.x;
                        const dy = nodeA.y - nodeB.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        // Only draw if within distance (some might stretch during transitions)
                        if (dist < this.options.connectionDistance * 1.5) {
                            ctx.moveTo(nodeA.x, nodeA.y);
                            ctx.lineTo(nodeB.x, nodeB.y);
                        }
                    }
                });
            });
            ctx.globalAlpha = 0.3 * this.opacity;
            ctx.stroke();
            
            // Draw nodes
            const time = performance.now();
            this.nodes.forEach(node => {
                const idlePulse = (Math.sin(time * 0.002 + node.pulsePhase) + 1) * 0.5; // 0 to 1
                const totalIntensity = Math.min(1, node.pulseIntensity + idlePulse * 0.5);
                
                ctx.globalAlpha = (node.baseOpacity + totalIntensity * 0.5) * this.opacity;
                
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (node.pulseIntensity * 2), 0, Math.PI * 2);
                
                // Radial gradient for node
                const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius + (node.pulseIntensity * 2));
                grad.addColorStop(0, node.color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                
                ctx.fillStyle = grad;
                ctx.fill();
            });
            
            // Draw particles (Additive blending for glow)
            ctx.globalCompositeOperation = 'lighter';
            
            this.particles.forEach(p => {
                if (p.trail.length === 0) return;
                
                // Draw trail
                ctx.beginPath();
                ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let i = 1; i < p.trail.length; i++) {
                    ctx.lineTo(p.trail[i].x, p.trail[i].y);
                }
                
                ctx.strokeStyle = this.options.colors.particle;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.5 * this.opacity;
                ctx.stroke();
                
                // Draw particle head
                const head = p.trail[0];
                ctx.beginPath();
                ctx.arc(head.x, head.y, 2, 0, Math.PI * 2);
                
                ctx.shadowBlur = 10 * this.options.glowIntensity;
                ctx.shadowColor = this.options.colors.particle;
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = this.opacity;
                ctx.fill();
                
                // Reset shadow for next drawings
                ctx.shadowBlur = 0;
            });
            
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    
    window.HBM.ParticleNetwork = ParticleNetwork;
})();

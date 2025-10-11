export const defaultParticleNetwork = {
    "color1": "#ffffff",
    "multiplier": 1,
    "distance": 1,
};

// Global variables to track the current animation
let currentAnimationId = null;
let currentCleanup = null;
let isInitialized = false;
let globalHandleResize = null; // Store reference to the resize handler

// Utility function to convert hex color to RGB values
function hexToRgb(hex) {
    // Remove the hash if present
    hex = hex.replace(/^#/, '');
    
    // Handle 3-digit hex codes
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    // Parse RGB values
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    
    return { r, g, b };
}

export function drawParticleNetwork(settings) {
    // CRITICAL: Clean up any existing animation first
    if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
        currentAnimationId = null;
    }
    
    // Clean up existing event listeners
    if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
    }
    
    // Remove any existing resize listener
    if (globalHandleResize) {
        window.removeEventListener('resize', globalHandleResize);
        globalHandleResize = null;
    }
    
    // Reset initialization flag
    isInitialized = false;

    const canvas = document.getElementById('noiseCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width = canvas.width;
    let height = canvas.height;
    const multiplier = settings && (settings.multiplier !== undefined && settings.multiplier !== null) ? settings.multiplier : defaultParticleNetwork.multiplier;
    const distance = settings && (settings.distance !== undefined && settings.distance !== null) ? settings.distance : defaultParticleNetwork.distance;
    const color1 = settings && (settings.color1 !== undefined && settings.color1 !== null) ? settings.color1 : defaultParticleNetwork.color1;
    // Convert colors to RGB for alpha blending
    const color1Rgb = hexToRgb(color1);

    // Resize canvas to match container or window
    function resizeCanvas() {
        const container = canvas.parentElement;
        if (container) {
            // Resize to container dimensions
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        } else {
            // Fallback: resize to window dimensions
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        
        width = canvas.width;
        height = canvas.height;
        
        // Recalculate particle parameters based on new dimensions
        updateParticleParameters();
    }

    // Update particle-related parameters when canvas resizes
    function updateParticleParameters() {
        const newPointCount = Math.floor(width / 5) * multiplier;
        const newMaxDistance = Math.floor(width / 5) * distance;
        
        // Adjust existing points to new canvas bounds
        for (let p of points) {
            p.x = Math.min(p.x, width);
            p.y = Math.min(p.y, height);
        }
        
        // Add or remove points as needed
        while (points.length < newPointCount) {
            points.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5
            });
        }
        while (points.length > newPointCount) {
            points.pop();
        }
        
        // Update MAX_DISTANCE for the drawing function
        MAX_DISTANCE = newMaxDistance;
    }

    let POINT_COUNT = Math.floor(width / 5);
    let MAX_DISTANCE = Math.floor(width / 5);
    let points = [];
    
    // Spatial partitioning grid
    let gridSize;
    let gridCols;
    let gridRows;
    let spatialGrid;

    // Initialize points only if not already initialized, or force reinit
    function initializePoints() {
        points = [];
        POINT_COUNT = Math.floor(width / 5) * multiplier;
        MAX_DISTANCE = Math.floor(width / 5) * distance;
        
        // Initialize spatial grid
        gridSize = MAX_DISTANCE;
        gridCols = Math.ceil(width / gridSize);
        gridRows = Math.ceil(height / gridSize);
        
        for (let i = 0; i < POINT_COUNT; i++) {
            points.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5
            });
        }
    }

    // Create spatial grid for efficient neighbor finding
    function updateSpatialGrid() {
        spatialGrid = new Array(gridCols * gridRows);
        for (let i = 0; i < spatialGrid.length; i++) {
            spatialGrid[i] = [];
        }
        
        // Assign points to grid cells
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const gridX = Math.floor(point.x / gridSize);
            const gridY = Math.floor(point.y / gridSize);
            const gridIndex = gridY * gridCols + gridX;
            
            if (gridIndex >= 0 && gridIndex < spatialGrid.length) {
                spatialGrid[gridIndex].push(i);
            }
        }
    }

    // Get nearby points for a given point using spatial grid
    function getNearbyPoints(pointIndex) {
        const point = points[pointIndex];
        const gridX = Math.floor(point.x / gridSize);
        const gridY = Math.floor(point.y / gridSize);
        const nearby = [];
        
        // Check surrounding grid cells (3x3 area)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const checkX = gridX + dx;
                const checkY = gridY + dy;
                
                if (checkX >= 0 && checkX < gridCols && checkY >= 0 && checkY < gridRows) {
                    const gridIndex = checkY * gridCols + checkX;
                    nearby.push(...spatialGrid[gridIndex]);
                }
            }
        }
        
        return nearby;
    }

    // Set up resize handling
    function handleResize() {
        console.log('Resizing canvas');
        // Debounce resize events to avoid excessive recalculation
        clearTimeout(handleResize.timeout);
        handleResize.timeout = setTimeout(() => {
            resizeCanvas();
        }, 100);
    }

    // Store the resize handler globally and add listener only once
    if (!isInitialized) {
        globalHandleResize = handleResize;
        window.addEventListener('resize', globalHandleResize);
        isInitialized = true;
    }

    // Initial setup
    initializePoints();
    resizeCanvas();

    function draw() {
        // Safety check: if animation was cancelled, don't continue
        if (!currentAnimationId) {
            return;
        }
        
        const frameStartTime = performance.now();
        
        ctx.clearRect(0, 0, width, height);

        // Move points
        for (let p of points) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;
        }

        // Update spatial grid for efficient collision detection
        updateSpatialGrid();

        // Draw lines between close points (optimized with spatial partitioning)
        const maxDistanceSquared = MAX_DISTANCE * MAX_DISTANCE;
        const drawnConnections = new Set(); // Avoid duplicate connections
        const linesToDraw = []; // Batch line drawing
        
        for (let i = 0; i < points.length; i++) {
            const nearbyIndices = getNearbyPoints(i);
            
            for (let j of nearbyIndices) {
                if (j <= i) continue; // Only check each pair once
                
                const connectionId = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (drawnConnections.has(connectionId)) continue;
                drawnConnections.add(connectionId);
                
                const dx = points[i].x - points[j].x;
                const dy = points[i].y - points[j].y;
                const distSquared = dx * dx + dy * dy;

                if (distSquared < maxDistanceSquared) {
                    // Only calculate sqrt when we know we need to draw
                    const dist = Math.sqrt(distSquared);
                    const alpha = 1 - dist / MAX_DISTANCE;
                    linesToDraw.push({
                        from: points[i],
                        to: points[j],
                        alpha: alpha
                    });
                }
            }
        }

        // Batch draw all lines
        for (let line of linesToDraw) {
            ctx.strokeStyle = `rgba(${color1Rgb.r},${color1Rgb.g},${color1Rgb.b},${line.alpha})`;
            ctx.beginPath();
            ctx.moveTo(line.from.x, line.from.y);
            ctx.lineTo(line.to.x, line.to.y);
            ctx.stroke();
        }

        // Batch draw all points
        ctx.fillStyle = color1;
        for (let p of points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        
        // Safety check before scheduling next frame
        if (currentAnimationId) {
            currentAnimationId = requestAnimationFrame(draw);
        }
    }

    // Start the animation and store the ID
    console.log('Starting new particle animation instance');
    currentAnimationId = requestAnimationFrame(draw);

    // Store cleanup function
    currentCleanup = function() {
        console.log('Cleaning up particle animation instance');
        if (currentAnimationId) {
            cancelAnimationFrame(currentAnimationId);
            currentAnimationId = null;
        }
        if (globalHandleResize) {
            window.removeEventListener('resize', globalHandleResize);
            globalHandleResize = null;
        }
        if (handleResize.timeout) {
            clearTimeout(handleResize.timeout);
        }
        isInitialized = false;
        
        // Clear performance monitoring
    };

    // Return cleanup function for manual cleanup if needed
    return currentCleanup;
}

// Function to update settings without recreating the entire animation
export function updateParticleSettings(settings) {
    // If no animation is running, start it
    if (!currentAnimationId) {
        return drawParticleNetwork(settings);
    }
    
    // Otherwise, just update the settings and let the existing animation continue
    // This would require refactoring to make settings globally accessible
    // For now, we'll restart with new settings
    return drawParticleNetwork(settings);
}
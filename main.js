console.log("main.js: Script start");
// Step 1: Set up basic Three.js scene, camera, and WebGLRenderer
let scene, camera, renderer;
let audioReady = false; // Will be false, so no audio-dependent logic runs
let frameCount = 0; // For less frequent logging in animate()

// Audio Components - Initialized to null or default
let audioContext = null;
let analyser = null;
let source = null;
let dataArray = null;

// --- Constants for Particle System & Audio Analysis ---
const MAX_PARTICLES = 8000;
const PARTICLE_LIFESPAN = 3.0;
const GRAVITY = -0.012;
const PARTICLE_ORIGIN_Y = -3;
const PARTICLE_SIZE = 0.06; // This is the "production" size, debug material will override
const ANALYSER_FFT_SIZE = 512;

// Beat Detection
const BEAT_TRESHOLD_MULTIPLIER = 1.35;
const BEAT_COOLDOWN = 0.12;
let lastBeatTime = 0;
let energyHistory = new Array(30).fill(0);
let energyHistoryIndex = 0;
let beatDetectedThisFrame = false; // Will be set by analyzeAudio

// --- Particle System Variables ---
let particlePool = [];
let particlesMesh = null;
let positions = null;
let colors = null;

function initThreeJS() {
    // Get Canvas Element and Log
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) {
        console.error("initThreeJS: Canvas element #visualizerCanvas not found!");
        return; 
    }
    console.log("initThreeJS: Found canvas element:", canvas);

    // Initialize Renderer with Canvas
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    console.log("initThreeJS: WebGLRenderer initialized with canvas element.");

    // Set Renderer Size using canvas clientWidth/clientHeight
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    console.log(`initThreeJS: Renderer size set to: ${canvas.clientWidth}w x ${canvas.clientHeight}h`);

    // Set Renderer Clear Color
    renderer.setClearColor(0x113355); // A distinct dark blue
    console.log("initThreeJS: Renderer clear color set to dark blue (0x113355).");

    // Log Renderer Instance
    console.log("initThreeJS: Renderer instance:", renderer);

    // Scene Initialization (after renderer)
    scene = new THREE.Scene();
    console.log("initThreeJS: Scene created:", scene);

    // Camera Initialization and Positioning (after scene)
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 1); // Positioned to view a small cube at origin
    camera.lookAt(0, 0, 0); // Look at the origin
    console.log(`initThreeJS: PerspectiveCamera created. Position: (0,0,1), Aspect: ${camera.aspect}`, camera);

    // Test Cube Re-verification (after scene and camera)
    const cubeGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red
    const testCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    scene.add(testCube);
    console.log("initThreeJS: Red test cube (0.2x0.2x0.2) added to scene at (0,0,0).");
    
    // Handle window resize (should also use canvas client dimensions)
    window.addEventListener('resize', () => {
        if (canvas && camera && renderer) {
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            console.log(`Resized: Renderer size set to: ${canvas.clientWidth}w x ${canvas.clientHeight}h`);
        }
    });
}

function initFountainParticles() {
    const particlesGeometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);
    particlePool = []; // Ensure pool is reset if function is ever called again

    for (let i = 0; i < MAX_PARTICLES; i++) {
        particlePool.push({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            lifespan: 0,
            isActive: false,
            color: new THREE.Color() // Will be set in emitParticle or by debug material
        });

        // Debug: Initialize first 5 particles at the origin point of the fountain.
        if (i < 5) {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = PARTICLE_ORIGIN_Y; 
            positions[i * 3 + 2] = 0;
        } else {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = -1000; // Off-screen
            positions[i * 3 + 2] = 0;
        }
        colors[i * 3 + 0] = 0; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 0; // Default to green for attribute
    }
    console.log(`Particle pool initialized with ${particlePool.length} particles.`);
    console.log(`Particle geometry position attribute count (vertices): ${MAX_PARTICLES}`);

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Debugging particle material settings
    const debugParticleMaterial = new THREE.PointsMaterial({
        size: 0.5, 
        color: 0x00ff00, // Bright green
        vertexColors: false, 
        transparent: false, 
        blending: THREE.NormalBlending,
    });
    console.log(`Particle material set with size: ${debugParticleMaterial.size}, color: #${debugParticleMaterial.color.getHexString()}, vertexColors: ${debugParticleMaterial.vertexColors}, transparent: ${debugParticleMaterial.transparent}`);

    particlesMesh = new THREE.Points(particlesGeometry, debugParticleMaterial);
    scene.add(particlesMesh);
    console.log("particlesMesh added to scene");
}

function emitParticle(bassAvg, trebleAvg, isBeat) {
    // --- Debugging: Log function call ---
    console.log("emitParticle called - current active particles (before emit):", particlePool.filter(p => p.isActive).length);

    let particle = null;
    let particleIndex = -1; 

    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!particlePool[i].isActive) {
            particle = particlePool[i];
            particleIndex = i; 
            break;
        }
    }

    if (!particle) return; 
    
    // --- Debugging: Override Particle Properties ---
    particle.isActive = true;
    particle.position.set(0, PARTICLE_ORIGIN_Y + 0.1, 0); 
    particle.velocity.set(0, 0.05, 0); 
    particle.lifespan = PARTICLE_LIFESPAN * 2; 
    particle.color.setRGB(0,0,1); // Set internal particle color to blue for logging

    if (particleIndex !== -1) {
        console.log(`Emitted particle ${particleIndex}: pos(${particle.position.x.toFixed(2)},${particle.position.y.toFixed(2)},${particle.position.z.toFixed(2)}), vel(${particle.velocity.x.toFixed(2)},${particle.velocity.y.toFixed(2)},${particle.velocity.z.toFixed(2)}), lifespan: ${particle.lifespan.toFixed(2)}, color(r,g,b): (${particle.color.r.toFixed(2)}, ${particle.color.g.toFixed(2)}, ${particle.color.b.toFixed(2)})`);
    }
}

function updateParticles() {
    console.log(`updateParticles called. Active: ${particlePool.filter(p => p.isActive).length}`);
    if (!particlesMesh) return;

    const positionsAttribute = particlesMesh.geometry.attributes.position;
    const colorsAttribute = particlesMesh.geometry.attributes.color;

    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (p.isActive) {
            p.velocity.y += GRAVITY;
            p.position.add(p.velocity);
            p.lifespan -= 1 / 60; 

            if (i === 0) { // Log for particle 0 if active
                console.log(`Particle 0 - Pos Y: ${p.position.y.toFixed(3)}, Vel Y: ${p.velocity.y.toFixed(3)}, Lifespan: ${p.lifespan.toFixed(2)}`);
            }

            if (p.lifespan <= 0 || p.position.y < PARTICLE_ORIGIN_Y - 1) {
                console.log(`Deactivating particle ${i} due to lifespan (${p.lifespan.toFixed(2)})/boundary (${p.position.y.toFixed(2)})`);
                p.isActive = false;
                positionsAttribute.setXYZ(i, 0, -1000, 0); 
            } else {
                positionsAttribute.setXYZ(i, p.position.x, p.position.y, p.position.z);
                colorsAttribute.setXYZ(i, p.color.r, p.color.g, p.color.b); // Will be green due to material
            }
        }
    }
    positionsAttribute.needsUpdate = true;
    console.log("Setting positions.needsUpdate = true");
    colorsAttribute.needsUpdate = true; 
    console.log("Setting colors.needsUpdate = true");
}

function analyzeAudio() {
    console.log("analyzeAudio called");
    if (!analyser) {
        console.warn("analyzeAudio called when analyser is not initialized");
        return; 
    }
    if (!dataArray) {
        console.warn("analyzeAudio called when dataArray is not initialized");
        return; 
    }
    analyser.getByteFrequencyData(dataArray);
    console.log(`Raw dataArray (first 10): ${Array.from(dataArray.slice(0, 10))}`);

    const bufferLength = analyser.frequencyBinCount;
    const bassEndIndex = Math.floor(bufferLength * 0.2);
    let bassSum = 0;
    for (let i = 0; i < bassEndIndex; i++) { bassSum += dataArray[i]; }
    const bassAverage = bassEndIndex > 0 ? bassSum / bassEndIndex : 0;

    const trebleStartIndex = Math.floor(bufferLength * 0.5);
    const trebleEndIndex = Math.floor(bufferLength * 0.8);
    let trebleSum = 0;
    for (let i = trebleStartIndex; i < trebleEndIndex; i++) { trebleSum += dataArray[i]; }
    const trebleAverage = (trebleEndIndex > trebleStartIndex) ? trebleSum / (trebleEndIndex - trebleStartIndex) : 0;
    
    let currentEnergy = bassAverage; 
    energyHistory[energyHistoryIndex] = currentEnergy;
    energyHistoryIndex = (energyHistoryIndex + 1) % energyHistory.length;
    let avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;

    let isBeat = false;
    const currentTime = audioContext ? audioContext.currentTime : 0; // Guard for audioContext
    if (currentEnergy > avgEnergy * BEAT_TRESHOLD_MULTIPLIER && (currentTime - lastBeatTime) > BEAT_COOLDOWN) {
        isBeat = true;
        lastBeatTime = currentTime;
    }
    beatDetectedThisFrame = isBeat;

    console.log(`Audio Features - Bass: ${bassAverage.toFixed(2)}, Treble: ${trebleAverage.toFixed(2)}, Beat Detected: ${beatDetectedThisFrame}`);
    console.log(`Beat Detection - Current Bass Energy: ${currentEnergy.toFixed(2)}, Avg Energy: ${avgEnergy.toFixed(2)}, Threshold Multiplier: ${BEAT_TRESHOLD_MULTIPLIER}, Cooldown: ${BEAT_COOLDOWN}`);
    return { bassAverage, trebleAverage, isBeat };
}

// Helper function for resetting beat detection state
function resetBeatDetectionHistory() {
    energyHistory.fill(0);
    lastBeatTime = 0;
    energyHistoryIndex = 0; // Ensure this is also reset
    beatDetectedThisFrame = false;
    console.log("Beat detection history reset.");
}

async function loadAndPlayAudioFromURL(audioURL) {
    console.log(`Attempting to load audio from URL: ${audioURL}`);
    audioReady = false; // Reset audio readiness

    // 1. Cleanup existing AudioContext and Source if they exist
    if (source) {
        try {
            source.stop();
        } catch (e) {
            console.warn("Error stopping previous source:", e);
        }
        source.disconnect();
        source = null;
    }
    if (audioContext) {
        try {
            await audioContext.close();
            console.log("Previous AudioContext closed.");
        } catch (e) {
            console.warn("Error closing previous AudioContext:", e);
        }
        audioContext = null;
    }

    // 2. Create new AudioContext
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("New AudioContext created.");

        // 3. Fetch Audio Data
        const response = await fetch(audioURL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log("Audio data fetched from URL.");

        // 4. Decode Audio Data
        // Use promise-based decodeAudioData
        const audioBuffer = await new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
        console.log("Audio data decoded successfully.");

        // 5. Setup Analyser and Source
        analyser = audioContext.createAnalyser();
        analyser.fftSize = ANALYSER_FFT_SIZE; // Use existing constant
        // Initialize dataArray based on new analyser settings
        dataArray = new Uint8Array(analyser.frequencyBinCount);


        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true; // Make the audio loop

        // 6. Connect nodes
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        // 7. Start playback
        source.start(0);
        console.log("Audio playing from URL. audioReady = true.");
        audioReady = true;

        // Reset beat detection history if applicable
        if (typeof resetBeatDetectionHistory === 'function') {
            resetBeatDetectionHistory();
        }

    } catch (error) {
        console.error("Error in loadAndPlayAudioFromURL:", error);
        audioReady = false;
        // Ensure audioContext is closed on error if it was created
        if (audioContext && audioContext.state !== 'closed') {
            try { 
                await audioContext.close(); 
                console.log("AudioContext closed on failure path.");
            } catch(e) { 
                console.error("Error closing audio context on failure path:", e); 
            }
        }
        audioContext = null; // Ensure context is null after error
    }
}

// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    // console.log("animate: requestAnimationFrame scheduled."); // Too spammy for now
    // console.log("animate: Function Entered. audioReady:", audioReady); // Too spammy for now

    frameCount++;
    if (frameCount % 60 === 0) { 
        console.log("animate: Still animating... audioReady:", audioReady);
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    } else {
        console.warn("animate: renderer, scene, or camera not ready for rendering.");
    }

    if (audioReady) {
        let audioFeatures = {};
        if (analyser && audioContext && audioContext.state === 'running') {
             const features = analyzeAudio(); // analyzeAudio now returns undefined if analyser or dataArray is null
             if(features) audioFeatures = features; else audioFeatures = { bassAverage: 0, trebleAverage: 0, isBeat: false };
        } else {
            audioFeatures = { bassAverage: 0, trebleAverage: 0, isBeat: false };
        }

        if (analyser) { 
            const particlesToEmit = beatDetectedThisFrame ? 25 + Math.floor(audioFeatures.bassAverage / 15) : 2 + Math.floor(audioFeatures.bassAverage / 30);
            for (let i = 0; i < particlesToEmit; i++) {
                if (Math.random() < 0.8 || beatDetectedThisFrame) {
                    emitParticle(audioFeatures.bassAverage, audioFeatures.trebleAverage, beatDetectedThisFrame);
                }
            }
        }
        updateParticles(); 
    }
}

// Initialize and start animation
initThreeJS();
initFountainParticles();
animate();
console.log("main.js: Initial animate() call made.");

// --- Audio Setup ---
// No audioFile event listener - audio will be loaded via URL

loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3");

console.log("main.js: Script end");

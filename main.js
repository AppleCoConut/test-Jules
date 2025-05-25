console.log("main.js: Script start");

// DOM Element Reference for the new on-canvas button
const onCanvasStartButton = document.getElementById('onCanvasStartButton');
console.log("main.js: Reference to #onCanvasStartButton:", onCanvasStartButton);

// Step 1: Set up basic Three.js scene, camera, and WebGLRenderer
let scene, camera, renderer;
let audioReady = false; 
let audioDataLoaded = false; // New flag
let sourceWasStarted = false; // Flag to track if source.start(0) has been called
// let frameCount = 0; // Removed for this task

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
const PARTICLE_SIZE = 0.1; // Adjusted for debugging visibility
const ANALYSER_FFT_SIZE = 512;
console.log("Global PARTICLE_ORIGIN_Y:", PARTICLE_ORIGIN_Y); 
console.log("Global PARTICLE_SIZE set to 0.1 for debugging visibility."); // New log for particle size

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
    renderer.setClearColor(0xFF00FF, 1); // Magenta, fully opaque
    console.error("initThreeJS: Renderer CLEAR COLOR ATTEMPTED SET TO MAGENTA (0xFF00FF).");

    // Log Renderer Instance
    console.log("initThreeJS: Renderer instance:", renderer);

    // Scene Initialization (after renderer)
    scene = new THREE.Scene();
    console.log("initThreeJS: Scene created:", scene);

    // Camera Initialization and Positioning (after scene)
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 10); // Restored original camera position for the fountain
    camera.lookAt(0, 0, 0); // Look at the origin (or scene.position)
    // console.log(`initThreeJS: PerspectiveCamera created. Position: (0,0,10), Aspect: ${camera.aspect}`, camera); // Old log
    console.log(`initThreeJS: Camera properties - near: ${camera.near}, far: ${camera.far}, fov: ${camera.fov}, aspect: ${camera.aspect.toFixed(2)}, position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);

    // Test Cube Re-verification (after scene and camera) - NOW COMMENTED OUT
    // const cubeGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    // const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red
    // const testCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    // scene.add(testCube);
    // console.log("initThreeJS: Red test cube (0.2x0.2x0.2) added to scene at (0,0,0)."); // Commented out
    
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

        // Initialize all particles off-screen initially
        // // Debug: Initialize first 5 particles at the origin point of the fountain.
        // if (i < 5) {
        //     positions[i * 3 + 0] = 0;
        //     positions[i * 3 + 1] = PARTICLE_ORIGIN_Y; 
        //     positions[i * 3 + 2] = 0;
        // } else {
        positions[i * 3 + 0] = 0;
        positions[i * 3 + 1] = -1000; // Off-screen
        positions[i * 3 + 2] = 0;
        // }
        // Initialize colors (will be overwritten by emitParticle logic if vertexColors is true)
        colors[i * 3 + 0] = 0.5; colors[i * 3 + 1] = 0.5; colors[i * 3 + 2] = 0.5; // Default to grey
    }
    console.log(`Particle pool initialized with ${particlePool.length} particles.`);
    console.log(`Particle geometry position attribute count (vertices): ${MAX_PARTICLES}`);

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Modified particle material for debugging visibility
    const particleMaterial = new THREE.PointsMaterial({
        size: PARTICLE_SIZE,       // Should now use the 0.1 value
        vertexColors: true,        // Must be true
        transparent: false,        // Set to false for initial opaque visibility test
        opacity: 1.0,              // Opacity is 1.0
        blending: THREE.NormalBlending, // Change to NormalBlending for simpler rendering
        depthWrite: false          // Keep as false
    });
    // Updated log for material properties
    console.log(`initFountainParticles: Particle material created - size: ${particleMaterial.size}, vertexColors: ${particleMaterial.vertexColors}, transparent: ${particleMaterial.transparent}, opacity: ${particleMaterial.opacity}, blending: ${particleMaterial.blending}, depthWrite: ${particleMaterial.depthWrite}`);

    particlesMesh = new THREE.Points(particlesGeometry, particleMaterial); 
    scene.add(particlesMesh);
    console.log("particlesMesh added to scene");
}

function emitParticle(bassAvg, trebleAvg, isBeat) {
    // --- Debugging: Log function call ---
    // console.log("emitParticle called - current active particles (before emit):", particlePool.filter(p => p.isActive).length); // Can be spammy

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
    
    // --- Original Audio-Reactive Particle Properties ---
    particle.isActive = true;
    particle.lifespan = PARTICLE_LIFESPAN + (Math.random() * 0.5 - 0.25); // slight variation

    // Initial position at the origin
    particle.position.set(
        (Math.random() - 0.5) * 0.2, // Small spread at base
        PARTICLE_ORIGIN_Y,
        (Math.random() - 0.5) * 0.2
    );

    // Initial velocity influenced by bass and beat
    const baseVelocityY = 0.10 + (bassAvg / 255) * 0.10; // Increased base and bass influence
    const velocityMultiplier = isBeat ? 1.8 + (Math.random() * 0.7) : 1.0; // More explosive on beat
    
    particle.velocity.set(
        (Math.random() - 0.5) * 0.035 * (1 + bassAvg / 100), // Wider spread, more bass influence
        baseVelocityY * velocityMultiplier,
        (Math.random() - 0.5) * 0.035 * (1 + bassAvg / 100)
    );

    // Color influenced by treble - Tuned for vibrant, modern feel
    // const trebleNormalized = Math.min(trebleAvg / 180, 1.0); // Adjusted treble sensitivity
    // if (isBeat) {
    //     // Flashy reds, oranges, yellows on beat
    //     particle.color.setHSL(Math.random() * 0.15 + 0.0, 1.0, 0.75); 
    // } else {
    //     // Normal particles: Cool base (cyan/blue) moving to warmer (light purple/pink) with treble
    //     particle.color.setHSL(0.55 + trebleNormalized * 0.20, 0.9, 0.6 + trebleNormalized * 0.15);
    // }

    // --- Force color to white for debugging visibility ---
    particle.color.setRGB(1.0, 1.0, 1.0); // Set internal THREE.Color object to white

    if (particleIndex !== -1 && colors) { // 'colors' is the global Float32Array for the color attribute
        const colorOffset = particleIndex * 3;
        colors[colorOffset + 0] = 1.0; // R
        colors[colorOffset + 1] = 1.0; // G
        colors[colorOffset + 2] = 1.0; // B
        // Note: particlesMesh.geometry.attributes.color.needsUpdate will be set in updateParticles()
        console.log(`emitParticle: Setting particle ${particleIndex} (array offset ${colorOffset}) color to WHITE.`);
    }
    // --- End of Original Audio-Reactive Particle Properties ---

    // --- Debugging: Override Particle Properties (Now Commented Out) ---
    // particle.isActive = true;
    // particle.position.set(0, PARTICLE_ORIGIN_Y + 0.1, 0); 
    // particle.velocity.set(0, 0.05, 0); 
    // particle.lifespan = PARTICLE_LIFESPAN * 2; 
    // particle.color.setRGB(0,0,1); // Set internal particle color to blue for logging

    // --- Debugging: Log Particle Properties (Still useful to see the audio-reactive values) ---
    if (particleIndex !== -1) {
        // Updated log to match subtask format
        console.log(`emitParticle: Activating particle ${particleIndex}. Initial - Pos: (${particle.position.x.toFixed(2)}, ${particle.position.y.toFixed(2)}, ${particle.position.z.toFixed(2)}), Vel: (${particle.velocity.x.toFixed(2)}, ${particle.velocity.y.toFixed(2)}, ${particle.velocity.z.toFixed(2)}), Color: (${particle.color.r.toFixed(2)}, ${particle.color.g.toFixed(2)}, ${particle.color.b.toFixed(2)}), Lifespan: ${particle.lifespan.toFixed(2)}`);
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
    console.log("loadAndPlayAudioFromURL: Called with URL:", audioURL);
    audioReady = false; // Still used by animate loop, but not set to true here
    audioDataLoaded = false; // Reset this new flag
    console.log("loadAndPlayAudioFromURL: audioReady & audioDataLoaded set to false initially.");

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
        console.log("loadAndPlayAudioFromURL: New AudioContext created.", audioContext);
        console.log("loadAndPlayAudioFromURL: AudioContext initial state:", audioContext.state); // Log 1

        // 3. Fetch Audio Data
        console.log("loadAndPlayAudioFromURL: About to fetch."); // Log 2
        const response = await fetch(audioURL);
        console.log("loadAndPlayAudioFromURL: Fetch response status:", response.status, "ok:", response.ok); // Log 3a
        if (!response.ok) { // Log 3b
            console.error(`loadAndPlayAudioFromURL: HTTP error! status: ${response.status}`); 
            throw new Error(`HTTP error! status: ${response.status}`); 
        }

        console.log("loadAndPlayAudioFromURL: About to get arrayBuffer."); // Log 4
        const arrayBuffer = await response.arrayBuffer();
        console.log("loadAndPlayAudioFromURL: Got arrayBuffer, length:", arrayBuffer.byteLength); // Log 5

        // 4. Decode Audio Data
        console.log("loadAndPlayAudioFromURL: About to decodeAudioData."); // Log 6
        const audioBuffer = await new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, 
                (decodedBuffer) => { // Success callback
                    console.log("loadAndPlayAudioFromURL: decodeAudioData SUCCEEDED."); // Log 7a
                    resolve(decodedBuffer);
                },
                (error) => { // Error callback
                    console.error("loadAndPlayAudioFromURL: decodeAudioData FAILED:", error); // Log 8
                    // audioReady = false; // Not set here anymore
                    audioDataLoaded = false; // Ensure this is false on decode failure
                    reject(error);
                }
            );
        });
        // console.log("Audio data decoded successfully."); // Covered by Log 7a

        // 5. Setup Analyser and Source
        console.log("loadAndPlayAudioFromURL: Setting up Analyser and Source.");
        analyser = audioContext.createAnalyser();
        analyser.fftSize = ANALYSER_FFT_SIZE; // Use existing constant
        
        // Log AnalyserNode properties
        console.log(`loadAndPlayAudioFromURL: AnalyserNode properties - fftSize: ${analyser.fftSize}, frequencyBinCount: ${analyser.frequencyBinCount}, minDecibels: ${analyser.minDecibels}, maxDecibels: ${analyser.maxDecibels}, smoothingTimeConstant: ${analyser.smoothingTimeConstant}`);
        
        // Initialize dataArray based on new analyser settings
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        console.log("loadAndPlayAudioFromURL: Analyser created (with properties logged), dataArray initialized.");

        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true; // Make the audio loop
        console.log("loadAndPlayAudioFromURL: AudioBufferSourceNode created and buffer assigned.");

        // 6. Connect nodes
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        console.log("loadAndPlayAudioFromURL: Source connected to Analyser, Analyser to Destination.");

        // 7. Data loaded and graph prepared. DO NOT START PLAYBACK.
        audioDataLoaded = true;
        console.log("loadAndPlayAudioFromURL: Audio data loaded and decoded successfully. audioDataLoaded = true.");

        // Make the #onCanvasStartButton visible
        if (onCanvasStartButton) { // onCanvasStartButton is the global const
            onCanvasStartButton.style.display = 'block'; // Or 'inline-block'
            console.log("loadAndPlayAudioFromURL: #onCanvasStartButton display set to 'block'.");
        } else {
            console.warn("loadAndPlayAudioFromURL: #onCanvasStartButton element not found, cannot make it visible.");
        }
        // NO source.start(0);
        // NO audioContext.resume();
        // NO audioReady = true;
        // NO showAudioInteractionOverlay() or hideAudioInteractionOverlay() calls
        // NO resetBeatDetectionHistory() call here, will be called by interaction handler

    } catch (error) {
        console.error("loadAndPlayAudioFromURL: MAIN CATCH BLOCK error:", error);
        // audioReady = false; // audioReady is not the primary flag here anymore
        audioDataLoaded = false; // Ensure this is false on any error in the loading process

        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().then(() => {
                console.log("loadAndPlayAudioFromURL: AudioContext closed in main catch block due to error.");
            }).catch(e => {
                console.error("loadAndPlayAudioFromURL: Error closing AudioContext in main catch block:", e);
            });
        }
        audioContext = null; 
        // Do NOT show the #onCanvasStartButton if loading fails.
        // If an overlay was shown by a previous attempt, it might still be there,
        // or the user might need to re-trigger if a new interaction mechanism is added for errors.
        // For now, just log the error and ensure flags are reset.
    }
}

// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // Unconditional Render Call
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    } else {
        // This warning is important if rendering setup is incomplete
        console.warn("animate: renderer, scene, or camera not ready for rendering.");
    }

    // Log audioReady state after rendering attempt
    console.log("animate: current audioReady state:", audioReady);

    /*
    if (audioReady) {
        // Optional: console.log("animate: audioReady is true, processing audio.");
        
        // Call analyzeAudio. It should handle cases where analyser might still be null
        // and return default/empty audioFeatures if necessary.
        const audioFeatures = analyzeAudio() || { bassAverage: 0, trebleAverage: 0, isBeat: false };
        
        // Particle Emission Logic - Restored and Instrumented
        if (analyser) { // Ensure analyser is available before using audioFeatures that depend on it
            const particlesToEmit = beatDetectedThisFrame ? 25 + Math.floor(audioFeatures.bassAverage / 15) : 2 + Math.floor(audioFeatures.bassAverage / 30);
            
            // Logging for Emission Decision
            console.log(`Particle Emission Logic - beatDetectedThisFrame: ${beatDetectedThisFrame}, bassAverage: ${audioFeatures.bassAverage ? audioFeatures.bassAverage.toFixed(2) : 'N/A'}, particlesToEmit: ${particlesToEmit}`);

            for (let i = 0; i < particlesToEmit; i++) {
                if (Math.random() < 0.8 || beatDetectedThisFrame) { // Probabilistic emission, but always emit on beat
                    emitParticle(audioFeatures.bassAverage, audioFeatures.trebleAverage, beatDetectedThisFrame);
                }
            }
        }
        
        updateParticles(); // updateParticles itself has debugging logs for active particles
    } else {
        // Optional: console.log("animate: audioReady is false, skipping audio processing.");
        // No audio-dependent logic here.
        // The 5 static debug particles from initFountainParticles and the test cube will still be visible.
        // No new particles will be emitted, and existing ones won't be updated by updateParticles.
    }
    */
}

// Initialize and start animation
console.error("main.js: PREPARING TO CALL initThreeJS() globally.");
initThreeJS();
console.error("main.js: CALL to initThreeJS() globally COMPLETED.");
initFountainParticles();
animate();
console.log("main.js: Initial animate() call made.");

// --- Audio Setup ---
// No audioFile event listener - audio will be loaded via URL

// --- Audio Interaction Logic (New: Centered around onCanvasStartButton and startAudioFromButtonClick) ---
async function startAudioFromButtonClick() {
    console.log("startAudioFromButtonClick function called.");

    if (!audioDataLoaded || !audioContext) {
        console.error("startAudioFromButtonClick: Audio data not loaded or AudioContext not ready. Cannot start.");
        return;
    }

    if (audioContext.state === 'closed') {
        console.error("startAudioFromButtonClick: AudioContext is closed. Attempting to reload all audio.");
        if (onCanvasStartButton) onCanvasStartButton.style.display = 'none'; 
        await loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3"); 
        return;
    }

    console.log("startAudioFromButtonClick: Current AudioContext state:", audioContext.state);
    if (audioContext.state === 'suspended') {
        console.log("startAudioFromButtonClick: AudioContext is suspended, attempting to resume...");
        try {
            await audioContext.resume();
            console.log("startAudioFromButtonClick: AudioContext.resume() promise resolved. New state:", audioContext.state);
        } catch (err) {
            console.error("startAudioFromButtonClick: Error during audioContext.resume():", err);
            return; 
        }
    }

    if (audioContext.state === 'running') {
        if (source && !sourceWasStarted) {
            try {
                source.start(0);
                sourceWasStarted = true; 
                console.log("startAudioFromButtonClick: source.start(0) called successfully.");
            } catch (err) {
                console.error("startAudioFromButtonClick: Error calling source.start(0):", err);
                return; 
            }
        } else if (source && sourceWasStarted) {
            console.log("startAudioFromButtonClick: Source already started previously.");
        } else {
            console.error("startAudioFromButtonClick: Source node not available to start.");
            return; 
        }

        audioReady = true; 
        console.log("startAudioFromButtonClick: audioReady definitively set to TRUE.");

        if (onCanvasStartButton) { 
            onCanvasStartButton.style.display = 'none';
            console.log("startAudioFromButtonClick: #onCanvasStartButton display set to 'none'.");
        }

        if (typeof resetBeatDetectionHistory === 'function') {
            resetBeatDetectionHistory();
        }
    } else {
        console.error("startAudioFromButtonClick: AudioContext could not be resumed to 'running' state. Current state:", audioContext.state);
        // Button should remain visible for another user attempt if resume failed or context isn't running.
        if (onCanvasStartButton) onCanvasStartButton.style.display = 'block'; // Ensure it's visible
    }
}

// Event listener for the new on-canvas button
if (onCanvasStartButton) {
    onCanvasStartButton.addEventListener('click', startAudioFromButtonClick);
    console.log("Event listener added to #onCanvasStartButton to call startAudioFromButtonClick.");
} else {
    console.warn("#onCanvasStartButton element not found when trying to add event listener.");
}
// --- End of New Audio Interaction Logic ---


loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3");

console.log("main.js: Script end");

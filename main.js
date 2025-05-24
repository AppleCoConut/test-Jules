console.log("main.js: Script start");

// DOM Element References for Audio Interaction Overlay
const audioNoticeOverlay = document.getElementById('audioNoticeOverlay');
const startAudioButton = document.getElementById('startAudioButton');
console.log("main.js: Reference to #audioNoticeOverlay:", audioNoticeOverlay);
console.log("main.js: Reference to #startAudioButton:", startAudioButton);

// Step 1: Set up basic Three.js scene, camera, and WebGLRenderer
let scene, camera, renderer;
let audioReady = false; 
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

    // Restore original particle material
    const particleMaterial = new THREE.PointsMaterial({
        size: PARTICLE_SIZE, // Use defined PARTICLE_SIZE
        vertexColors: true,  // Enable vertex colors for audio-reactive colors
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending // For a brighter effect
    });
    console.log(`Particle material restored to: size: ${particleMaterial.size}, vertexColors: ${particleMaterial.vertexColors}, transparent: ${particleMaterial.transparent}, blending: ${particleMaterial.blending}`);

    particlesMesh = new THREE.Points(particlesGeometry, particleMaterial); // Use original material
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
    const trebleNormalized = Math.min(trebleAvg / 180, 1.0); // Adjusted treble sensitivity
    if (isBeat) {
        // Flashy reds, oranges, yellows on beat
        particle.color.setHSL(Math.random() * 0.15 + 0.0, 1.0, 0.75); 
    } else {
        // Normal particles: Cool base (cyan/blue) moving to warmer (light purple/pink) with treble
        particle.color.setHSL(0.55 + trebleNormalized * 0.20, 0.9, 0.6 + trebleNormalized * 0.15);
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
    console.log("loadAndPlayAudioFromURL: Called with URL:", audioURL); // Log 1
    audioReady = false; // Reset audio readiness
    console.log("loadAndPlayAudioFromURL: audioReady set to false initially.");

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
                    audioReady = false; // Ensure audioReady is false on decode failure
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

        // 7. Start playback
        console.log("loadAndPlayAudioFromURL: About to call source.start(0)."); // Log 9
        source.start(0);

        // New robust logic for AudioContext state check and resume
        console.log("loadAndPlayAudioFromURL: Checking AudioContext state post source.start(). Current state:", audioContext.state);
        if (audioContext.state === 'running') {
            console.log("loadAndPlayAudioFromURL: Context is already running. Setting audioReady = true.");
            audioReady = true; // Set audioReady
            console.log("loadAndPlayAudioFromURL: audioReady definitively set to TRUE (context was running).");
            if (typeof resetBeatDetectionHistory === 'function') { // Check if function exists
                resetBeatDetectionHistory();
            }
        } else {
            console.log("loadAndPlayAudioFromURL: Context is `" + audioContext.state + "`. Attempting to resume...");
            try {
                await audioContext.resume(); // Use await as we are in an async function
                console.log("loadAndPlayAudioFromURL: AudioContext.resume() promise resolved. New state:", audioContext.state);
                if (audioContext.state === 'running') {
                    audioReady = true; // Set audioReady
                    console.log("loadAndPlayAudioFromURL: audioReady definitively set to TRUE (after successful resume).");
                    if (typeof resetBeatDetectionHistory === 'function') { // Check if function exists
                        resetBeatDetectionHistory();
                    }
                } else {
                    console.warn("loadAndPlayAudioFromURL: AudioContext state is still not 'running' after resume. State:", audioContext.state);
                    audioReady = false; // Explicitly ensure audioReady is false
                    console.log("loadAndPlayAudioFromURL: Condition met to show overlay (state not 'running' post-resume). audioContext.state:", audioContext.state, "Calling showAudioInteractionOverlay()...");
                    if (typeof showAudioInteractionOverlay === 'function') { // Check if function exists
                        showAudioInteractionOverlay();
                    }
                }
            } catch (err) {
                console.error("loadAndPlayAudioFromURL: Error during audioContext.resume():", err);
                audioReady = false; // Explicitly ensure audioReady is false
                console.log("loadAndPlayAudioFromURL: Condition met to show overlay (error during resume). Error:", err, "Calling showAudioInteractionOverlay()...");
                if (typeof showAudioInteractionOverlay === 'function') { // Check if function exists
                    showAudioInteractionOverlay();
                }
            }
        }
        // End of new robust logic

    } catch (error) {
        console.error("loadAndPlayAudioFromURL: MAIN CATCH BLOCK error:", error); // Ensure 'error' is logged
        audioReady = false; // Already present, ensure it stays

        // Attempt to close audioContext if it exists and isn't already closed
        if (audioContext && audioContext.state !== 'closed') {
            try {
                // No 'await' here if we don't want the catch block to be async itself,
                // or add 'async' to the catch block if necessary, but typically not done.
                // For simplicity, fire-and-forget close or make this outer catch also async if critical.
                // However, the main goal is to show the overlay.
                audioContext.close().then(() => {
                    console.log("loadAndPlayAudioFromURL: AudioContext closed in main catch block.");
                }).catch(e => {
                    console.error("loadAndPlayAudioFromURL: Error closing AudioContext in main catch block:", e);
                });
            } catch (e) { // Catch synchronous errors from calling close() itself, though unlikely
                console.error("loadAndPlayAudioFromURL: Synchronous error calling audioContext.close() in main catch:", e);
            }
        }
        audioContext = null; // Already present, ensure it stays

        // Add the call to showAudioInteractionOverlay
        if (typeof showAudioInteractionOverlay === 'function') {
            console.log("loadAndPlayAudioFromURL: Main catch block calling showAudioInteractionOverlay()."); // Add this log
            showAudioInteractionOverlay();
        } else {
            console.error("loadAndPlayAudioFromURL: showAudioInteractionOverlay function not found in main catch block!"); // Should not happen
        }
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

    if (audioReady) {
        // Optional: console.log("animate: audioReady is true, processing audio.");
        
        // Call analyzeAudio. It should handle cases where analyser might still be null
        // and return default/empty audioFeatures if necessary.
        const audioFeatures = analyzeAudio() || { bassAverage: 0, trebleAverage: 0, isBeat: false };
        
        // For now, we are not calling emitParticle here based on subtask instructions.
        // Particle emission logic will be re-added later.
        // if (analyser) { 
        //     const particlesToEmit = beatDetectedThisFrame ? 25 + Math.floor(audioFeatures.bassAverage / 15) : 2 + Math.floor(audioFeatures.bassAverage / 30);
        //     for (let i = 0; i < particlesToEmit; i++) {
        //         if (Math.random() < 0.8 || beatDetectedThisFrame) {
        //             emitParticle(audioFeatures.bassAverage, audioFeatures.trebleAverage, beatDetectedThisFrame);
        //         }
        //     }
        // }
        
        updateParticles(); // updateParticles itself has debugging logs for active particles
    } else {
        // Optional: console.log("animate: audioReady is false, skipping audio processing.");
        // No audio-dependent logic here.
        // The 5 static debug particles from initFountainParticles and the test cube will still be visible.
        // No new particles will be emitted, and existing ones won't be updated by updateParticles.
    }
}

// Initialize and start animation
initThreeJS();
initFountainParticles();
animate();
console.log("main.js: Initial animate() call made.");

// --- Audio Setup ---
// No audioFile event listener - audio will be loaded via URL

// --- Audio Interaction Overlay Logic ---
function showAudioInteractionOverlay() {
    console.log("showAudioInteractionOverlay: Function called.");
    if (audioNoticeOverlay) { // audioNoticeOverlay is the global const
        console.log("showAudioInteractionOverlay: #audioNoticeOverlay DOM element IS found. Current display style (before change):", audioNoticeOverlay.style.display);
        audioNoticeOverlay.style.display = 'block'; // Or 'flex' if it's a flex container and needs to be for centering
        console.log("showAudioInteractionOverlay: Set display to 'block'. New display style (after change):", audioNoticeOverlay.style.display);
    } else {
        console.error("showAudioInteractionOverlay: #audioNoticeOverlay DOM element NOT FOUND when trying to show it! Check ID and script load order if 'Reference to #audioNoticeOverlay' log at top of main.js was null.");
    }
}

function hideAudioInteractionOverlay() {
    if (audioNoticeOverlay) {
        audioNoticeOverlay.style.display = 'none';
        console.log("Audio interaction overlay hidden.");
    }
}

function handleAudioInteraction() {
    console.log("handleAudioInteraction called.");
    if (!audioContext) { 
        console.warn("handleAudioInteraction: AudioContext is not yet created. Attempting to load audio first.");
        loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3"); 
        hideAudioInteractionOverlay(); 
        return;
    }

    if (audioContext.state === 'closed') {
        console.warn("handleAudioInteraction: AudioContext is closed. Re-creating and loading audio.");
        loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3"); 
        hideAudioInteractionOverlay(); 
        return;
    }

    if (audioContext.state === 'suspended') {
        console.log("User interaction: AudioContext is suspended, attempting to resume...");
        audioContext.resume().then(() => {
            console.log("User interaction: AudioContext.resume() promise resolved. New state:", audioContext.state);
            if (audioContext.state === 'running') {
                audioReady = true; 
                console.log("User interaction: audioReady definitively set to TRUE.");
                if (typeof resetBeatDetectionHistory === 'function') {
                    resetBeatDetectionHistory();
                }
                hideAudioInteractionOverlay();
            } else {
                console.warn("User interaction: Resume completed, but context still not 'running'. State:", audioContext.state);
            }
        }).catch(err => {
            console.error("User interaction: Error resuming AudioContext:", err);
        });
    } else if (audioContext.state === 'running') {
        console.log("User interaction: AudioContext already running.");
        audioReady = true; 
        hideAudioInteractionOverlay();
    }
}

if (startAudioButton) {
    startAudioButton.addEventListener('click', function(event) {
        event.stopPropagation(); 
        handleAudioInteraction();
    });
    console.log("Event listener added to #startAudioButton.");
} else {
    console.warn("#startAudioButton element not found for event listener.");
}

if (audioNoticeOverlay) {
    audioNoticeOverlay.addEventListener('click', handleAudioInteraction);
    console.log("Event listener added to #audioNoticeOverlay.");
} else {
    console.warn("#audioNoticeOverlay element not found for event listener.");
}

// --- End of Audio Interaction Overlay Logic ---

loadAndPlayAudioFromURL("https://applecoconut.github.io/test-Jules/test1.mp3");

console.log("main.js: Script end");

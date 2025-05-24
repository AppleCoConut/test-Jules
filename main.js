// Step 1: Set up basic Three.js scene, camera, and WebGLRenderer
let scene, camera, renderer;

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 10); // Adjusted camera position

    // Renderer
    const canvas = document.getElementById('visualizerCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.appendChild(renderer.domElement); // Already attached via canvas element

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Step 4: Create a basic render loop
// --- Constants for Particle System & Audio Analysis (Tuned for "Battle Without Honor or Humanity") ---
const MAX_PARTICLES = 8000; // Increased for density
const PARTICLE_LIFESPAN = 3.0; // Increased for hang time
const GRAVITY = -0.012; // Reduced for more hang time
const PARTICLE_ORIGIN_Y = -3;
const PARTICLE_SIZE = 0.06; // Slightly larger particles

// Beat Detection
const BEAT_TRESHOLD_MULTIPLIER = 1.35; // Slightly higher to catch more significant peaks
const BEAT_COOLDOWN = 0.12; // Slightly shorter for potentially faster beats
let lastBeatTime = 0;
let energyHistory = new Array(30).fill(0); // For running average of energy
let energyHistoryIndex = 0;
let beatDetectedThisFrame = false;

// Audio Data
let dataArray; // Uint8Array for frequency data

// --- Particle System Variables ---
let particlePool = [];
let particlesMesh;
let positions;
let colors;

function initFountainParticles() {
    const particlesGeometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);

    for (let i = 0; i < MAX_PARTICLES; i++) {
        particlePool.push({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            lifespan: 0,
            isActive: false,
            color: new THREE.Color(0xffffff) // Default color
        });
        // Initialize positions off-screen and colors
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -1000; // Start off-screen
        positions[i * 3 + 2] = 0;
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMaterial = new THREE.PointsMaterial({
        size: PARTICLE_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending // For a brighter effect
    });

    particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);
    console.log("Fountain particle system initialized.");
}

function emitParticle(bassAvg, trebleAvg, isBeat) {
    let particle = null;
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!particlePool[i].isActive) {
            particle = particlePool[i];
            break;
        }
    }

    if (!particle) return; // Pool is full

    particle.isActive = true;
    particle.lifespan = PARTICLE_LIFESPAN + (Math.random() * 0.5 - 0.25); // slight variation

    // Initial position
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
}

function updateParticles() {
    if (!particlesMesh) return;

    const positionsAttribute = particlesMesh.geometry.attributes.position;
    const colorsAttribute = particlesMesh.geometry.attributes.color;

    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (p.isActive) {
            p.velocity.y += GRAVITY;
            p.position.add(p.velocity);
            p.lifespan -= 1 / 60; // Assuming 60 FPS

            if (p.lifespan <= 0 || p.position.y < PARTICLE_ORIGIN_Y - 1) { // Recycle if below origin too
                p.isActive = false;
                positionsAttribute.setXYZ(i, 0, -1000, 0); // Move off-screen
            } else {
                positionsAttribute.setXYZ(i, p.position.x, p.position.y, p.position.z);
                colorsAttribute.setXYZ(i, p.color.r, p.color.g, p.color.b);
            }
        }
    }
    positionsAttribute.needsUpdate = true;
    colorsAttribute.needsUpdate = true;
}

function analyzeAudio() {
    if (!analyser) return { bassAverage: 0, trebleAverage: 0, isBeat: false };

    analyser.getByteFrequencyData(dataArray);

    const bufferLength = analyser.frequencyBinCount; // dataArray.length

    // Bass: e.g., first 20% of frequencies
    const bassEndIndex = Math.floor(bufferLength * 0.2);
    let bassSum = 0;
    for (let i = 0; i < bassEndIndex; i++) {
        bassSum += dataArray[i];
    }
    const bassAverage = bassEndIndex > 0 ? bassSum / bassEndIndex : 0;

    // Treble: e.g., frequencies from 50% to 70% (adjust as needed)
    const trebleStartIndex = Math.floor(bufferLength * 0.5);
    const trebleEndIndex = Math.floor(bufferLength * 0.8);
    let trebleSum = 0;
    for (let i = trebleStartIndex; i < trebleEndIndex; i++) {
        trebleSum += dataArray[i];
    }
    const trebleAverage = (trebleEndIndex > trebleStartIndex) ? trebleSum / (trebleEndIndex - trebleStartIndex) : 0;
    
    // Beat Detection (Simple energy-based)
    // Using bass frequencies for beat detection as they often carry the rhythm
    let currentEnergy = bassAverage; 

    // Calculate running average of energy
    energyHistory[energyHistoryIndex] = currentEnergy;
    energyHistoryIndex = (energyHistoryIndex + 1) % energyHistory.length;
    let avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;

    let isBeat = false;
    const currentTime = audioContext.currentTime;
    if (currentEnergy > avgEnergy * BEAT_TRESHOLD_MULTIPLIER && (currentTime - lastBeatTime) > BEAT_COOLDOWN) {
        isBeat = true;
        lastBeatTime = currentTime;
    }
    beatDetectedThisFrame = isBeat; // Store for particle emission

    return { bassAverage, trebleAverage, isBeat };
}


// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    let audioFeatures = { bassAverage: 0, trebleAverage: 0, isBeat: false };
    if (analyser && audioContext && audioContext.state === 'running') {
        audioFeatures = analyzeAudio();
    }

    // Particle Emission Logic
    if (analyser) { // Only emit if audio is playing and analyser is ready
        // Increased particle emission rates, more sensitive to bass
        const particlesToEmit = beatDetectedThisFrame ? 25 + Math.floor(audioFeatures.bassAverage / 15) : 2 + Math.floor(audioFeatures.bassAverage / 30) ; 
        for (let i = 0; i < particlesToEmit; i++) {
             if (Math.random() < 0.8 || beatDetectedThisFrame) { // Increased general emission probability
                emitParticle(audioFeatures.bassAverage, audioFeatures.trebleAverage, beatDetectedThisFrame);
             }
        }
    }
    
    updateParticles();
    renderer.render(scene, camera);
}

// Initialize and start animation
initThreeJS();
initFountainParticles(); // Initialize our new particle system
animate();

// --- Audio Setup ---
let audioContext, analyser, source;
const audioFileElement = document.getElementById('audioFile');

audioFileElement.addEventListener('change', function(event) {
    if (event.target.files.length === 0) {
        return;
    }
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function(fileEvent) {
        const arrayBuffer = fileEvent.target.result;

        if (audioContext && audioContext.state === 'running') {
            audioContext.close(); // Close previous context before creating a new one
        }
        audioContext = new AudioContext();
        
        if (source) {
            source.disconnect(); // Disconnect old source
        }

        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            source = audioContext.createBufferSource();
            source.buffer = buffer;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512; // Increased FFT size for better frequency resolution
            dataArray = new Uint8Array(analyser.frequencyBinCount); // Initialize dataArray

            source.connect(analyser);
            analyser.connect(audioContext.destination);
            
            // Reset beat detection history for new song
            energyHistory.fill(0);
            lastBeatTime = 0;

            source.start(0);
            console.log("Audio playing");
            // Ensure camera is correctly positioned if it was changed by user interaction (not implemented here)
            camera.lookAt(scene.position); 


        }, function(e) {
            console.error("Error decoding audio data", e);
        });
    };

    reader.readAsArrayBuffer(file);
});

console.log("main.js loaded with fountain particle system and audio analysis.");

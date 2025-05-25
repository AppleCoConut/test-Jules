console.log("main.js: Script start -- Barebones Test");

const canvas = document.getElementById('visualizerCanvas');

if (canvas) {
    console.log("main.js: Found canvas element:", canvas);
    // Log dimensions after a short delay to allow CSS to apply and layout to settle.
    setTimeout(() => {
        const currentCanvas = document.getElementById('visualizerCanvas');
        if (currentCanvas) {
            console.log("main.js: Canvas getBoundingClientRect():", currentCanvas.getBoundingClientRect());
            console.log("main.js: Canvas offsetWidth:", currentCanvas.offsetWidth, "offsetHeight:", currentCanvas.offsetHeight);
        } else {
            console.warn("main.js: Canvas #visualizerCanvas no longer found in setTimeout.");
        }
    }, 100); // 100ms delay
} else {
    console.error("main.js: Canvas element #visualizerCanvas NOT FOUND!");
}

console.log("main.js: Script end -- Barebones Test");

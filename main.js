console.log("main.js: Script start -- Barebones Test");

const canvas = document.getElementById('visualizerCanvas');

if (canvas) {
    console.log("main.js: Found canvas element:", canvas);
    // Log dimensions after a short delay to allow CSS to apply and layout to settle.
    setTimeout(() => {
        // Re-fetch the element inside setTimeout to be absolutely sure,
        // though using the 'canvas' variable from outer scope should be fine.
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

console.log("main.js: Attempting to apply styles directly via JavaScript...");

// Style the body
document.body.style.backgroundColor = "#CCCCCC"; // Light grey for body
document.body.style.color = "#111111"; // Dark text for any potential default browser messages

if (canvas) { // 'canvas' variable should still be in scope from the earlier check
    canvas.style.width = "80vw";
    canvas.style.height = "70vh";
    canvas.style.display = "block";
    canvas.style.border = "5px dashed green"; // Different style for clear distinction
    canvas.style.backgroundColor = "purple";    // Different color for clear distinction
    canvas.style.margin = "20px";
    console.log("main.js: Styles applied via JavaScript to body and canvas.");
} else {
    // This case should ideally not be hit if the earlier canvas check was successful.
    console.warn("main.js: Cannot apply JS styles to canvas, as canvas variable was not valid here (or was nullified).");
}

console.log("main.js: Script end -- Barebones Test");

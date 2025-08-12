const fs = require("fs");
const { createCanvas } = require("canvas");

// Create menu bar icon (small)
const menuSize = 32;
const menuCanvas = createCanvas(menuSize, menuSize);
const menuCtx = menuCanvas.getContext("2d");

menuCtx.clearRect(0, 0, menuSize, menuSize);
menuCtx.fillStyle = "white";
menuCtx.font = "bold 20px Arial";
menuCtx.textAlign = "center";
menuCtx.textBaseline = "middle";
menuCtx.fillText("G", menuSize / 2, menuSize / 2);

const menuBuffer = menuCanvas.toBuffer("image/png");
fs.writeFileSync("menu-icon.png", menuBuffer);

// Create app icon (large)
const appSize = 512;
const appCanvas = createCanvas(appSize, appSize);
const appCtx = appCanvas.getContext("2d");

// Create a gradient background
const gradient = appCtx.createLinearGradient(0, 0, appSize, appSize);
gradient.addColorStop(0, "#4CAF50");
gradient.addColorStop(1, "#2E7D32");
appCtx.fillStyle = gradient;
appCtx.fillRect(0, 0, appSize, appSize);

// Add some rounded corners effect
appCtx.globalCompositeOperation = "destination-in";
appCtx.beginPath();
appCtx.roundRect(0, 0, appSize, appSize, 50);
appCtx.fill();
appCtx.globalCompositeOperation = "source-over";

// Draw white "M"
appCtx.fillStyle = "white";
appCtx.font = "bold 300px Arial";
appCtx.textAlign = "center";
appCtx.textBaseline = "middle";
appCtx.fillText("M", appSize / 2, appSize / 2);

const appBuffer = appCanvas.toBuffer("image/png");
fs.writeFileSync("../icon.png", appBuffer);

console.log("Icons created successfully");

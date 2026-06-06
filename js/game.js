import { Player } from "./player.js";
import { loadLevel } from "./level.js";
import { keys, applyInput } from "./input.js";

import { applyPhysics, resolvePlayerBlocking } from "./physics.js";
import { updateLevel1 } from "../LevelLogic/World1/Level1.js";
import { updateLevel2 } from "../LevelLogic/World1/Level2.js";

import { updateLevel3 } from "../LevelLogic/World1/Level3.js";
import { updateLevel4 } from "../LevelLogic/World1/Level4.js";
import { updateLevel5 } from "../LevelLogic/World1/Level5.js";
import { io } from "./socket.io.esm.min.js";

const socket = io("https://syncsteps67-bot.onrender.com", {
    transports: ["websocket", "polling"]
});

/* =========================
   GAME STATE
========================= */

export const STATE = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    SETTINGS: "settings",
    SUPPORT: "support",
    LEVEL_SELECT: "level_select",
    CHAR_SELECT: "char_select",
    LOBBY: "lobby",
};

let gameState = STATE.MENU;

/* ======================
   GAME DATA
========================= */

let players = [];
let platforms = [];
let buttons = [];
let goal = null;

// Door is always unlocked for now (key system removed)
let doorUnlocked = true;

let cameraX = 0;
let currentLevelIndex = 0;
const MAX_LEVELS = 15;

let currentWorld = 1; // supports Levels/World1, World2 etc

let isLoadingLevel = false;

let mouseX = 0;
let mouseY = 0;


let graphicsSmoothCamera = true;
let graphicsClouds = true;

let displayShowFPS = true;


let soundVolume = 100;


let settingsTab = "graphics";

let previousState = STATE.MENU;

// Floating fluffy clouds
function createCloud(x, y, speed) {
    const parts = [];
    const count = 4 + Math.floor(Math.random() * 3); // 4–6 blobs

    for (let i = 0; i < count; i++) {
        parts.push({
            ox: (Math.random() - 0.5) * 40,
            oy: (Math.random() - 0.5) * 20,
            r: 16 + Math.random() * 12
        });
    }

    return { x, y, speed, parts };
}

let clouds = [];

// FPS COUNTER
let fps = 0;
let frameCount = 0;
let lastFpsUpdate = performance.now();


let selectedMode = "single";

// ROOM SYSTEM

let roomCode = null;
let lobbyPlayers = 1;
let isHost = false;

let myPlayerIndex = 0;

// READY system variables
let isReady = false;
let readyPlayers = {};

let lobbyCountdown = null;
let lobbyCountdownStarted = false;
let lobbyCountdownStartTime = 0;

let lockedPlayers = {};

let selectedCharacterIndex = 0;
let characterSlide = 0;          // current slide offset
let characterTargetSlide = 0;    // target slide offset

let charAnimFrame = [];
let charAnimTimer = [];

// Player color selection system
let selectingPlayer = 1;
let selectedColorP1 = "green";
let selectedColorP2 = "purple";

const characterSprites = [];

const characterColorsList = ["blue", "green", "pink", "purple", "yellow"];

for (let i = 0; i < characterColorsList.length; i++) {
    const color = characterColorsList[i];
    const img = new Image();

    img.src = new URL(`../assets/images/marvy/${color}/marvy_main_${color}_shaded.png`, import.meta.url).href;

    characterSprites.push(img);
}

// Initialize per-character animation arrays
for (let i = 0; i < characterSprites.length; i++) {
    charAnimFrame[i] = Math.floor(Math.random() * 10); // random start frame
    charAnimTimer[i] = Math.floor(Math.random() * 24);
}

const characterColors = characterColorsList;

const EMPTY_PLAYERS = [];

const TITLE_IMAGE = new Image();
// Resolve path relative to this JS file so it always works
TITLE_IMAGE.src = new URL("../assets/images/name/design_2.png", import.meta.url).href;

let TITLE_CACHE = null;

TITLE_IMAGE.onload = () => {
    console.log("TITLE IMAGE LOADED");

    // Pre-scale the image once to avoid resizing every frame
    const w = 720;
    const h = 280;

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;

    const offCtx = off.getContext("2d");
    // Restore crisp rendering for the logo
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "low";
    offCtx.drawImage(TITLE_IMAGE, 0, 0, w, h);

    TITLE_CACHE = off;
};

TITLE_IMAGE.onerror = () => {
    console.error("TITLE IMAGE FAILED TO LOAD. Check path: assets/name/design_1.png");
};

// =========================
// BUTTON SPRITES
// =========================
const BUTTON_IDLE = new Image();
BUTTON_IDLE.src = new URL("../assets/images/button/button_idle.png", import.meta.url).href;

const BUTTON_PRESSED = new Image();
BUTTON_PRESSED.src = new URL("../assets/images/button/button_push.png", import.meta.url).href;

// =========================
// GOAL SPRITE
// =========================
const GOAL_IDLE = new Image();
GOAL_IDLE.src = new URL("../assets/images/door/door_idle.png", import.meta.url).href;

const GOAL_OPEN = new Image();
GOAL_OPEN.src = new URL("../assets/images/door/door_open.png", import.meta.url).href;

/* =========================
   START GAME
========================= */

// ROOM FUNCTIONS

function createRoom() {
    console.log("CREATE BUTTON CLICKED");
    isHost = true;
    socket.emit("createRoom");
}

function joinRoom(code) {
    if (!code) {
        console.log("No room code entered");
        return;
    }
    code = code.trim().toUpperCase();
    console.log("Joining room:", code);
    roomCode = code;
    isHost = false;
    socket.emit("joinRoom", code);
    gameState = STATE.LOBBY;
}

// SOCKET EVENT LISTENERS (top-level only, no duplicates)
socket.on("roomCreated", (code) => {
    console.log("Room created:", code);
    roomCode = code;
    lobbyPlayers = 1;
    gameState = STATE.LOBBY;
});

socket.on("playersUpdate", (serverPlayers) => {
    console.log("Players update:", serverPlayers);
    players = serverPlayers;
    lobbyPlayers = serverPlayers.length;
    myPlayerIndex = serverPlayers.findIndex(p => p.id === socket.id);
    console.log("MY PLAYER INDEX:", myPlayerIndex);
});

socket.on("playerCount", (count) => {
    console.log("Player count:", count);
    lobbyPlayers = count;
});

// READY state update from server
socket.on("readyUpdate", (data) => {
    readyPlayers = data;
    // Sync local player state with server
    if (readyPlayers[socket.id] !== undefined) {
        isReady = readyPlayers[socket.id];
    }
    console.log("Ready state:", readyPlayers);

    // START GAME COUNTDOWN WHEN BOTH PLAYERS READY
    const readyCount = Object.values(readyPlayers).filter(v => v).length;

    if (lobbyPlayers >= 2 && readyCount >= 2) {
        if (!lobbyCountdownStarted) {
            lobbyCountdownStarted = true;
            lobbyCountdownStartTime = Date.now();
            lobbyCountdown = 10;
        }
    } else {
        lobbyCountdownStarted = false;
        lobbyCountdown = null;
    }
});

socket.on("lockUpdate", (data) => {
    lockedPlayers = data;
});

// LIVE PLAYER MOVEMENT SYNC
socket.on("playerMove", (data) => {

    if (selectedMode !== "multi") return;

    const otherPlayer = players[data.index];

    if (!otherPlayer) return;

    // never overwrite locally controlled player
    if (data.index === myPlayerIndex) return;

    otherPlayer.x = data.x;
    otherPlayer.y = data.y;
    otherPlayer.vx = data.vx;
    otherPlayer.vy = data.vy;

    // optional animation sync
    if (data.direction !== undefined) {
        otherPlayer.direction = data.direction;
    }

    if (data.frame !== undefined) {
        otherPlayer.frame = data.frame;
    }
});
// Toggle ready state and emit to server
function toggleReady() {
    // optimistic UI update
    isReady = !isReady;
    if (!readyPlayers) readyPlayers = {};
    readyPlayers[socket.id] = isReady;

    console.log("Toggling ready ->", isReady);
    socket.emit("playerReady", isReady);
}

function toggleLock() {
    const current = !!lockedPlayers[socket.id];

    lockedPlayers[socket.id] = !current;

    socket.emit("playerLock", !current);
}

// Lobby color change function
function changeLobbyColor(direction) {
    const currentIndex = characterColors.indexOf(
        players.find(p => p.id === socket.id)?.color || "green"
    );

    let newIndex = currentIndex + direction;

    if (newIndex < 0) newIndex = characterColors.length - 1;
    if (newIndex >= characterColors.length) newIndex = 0;

    const newColor = characterColors[newIndex];

    console.log("Changing color:", newColor);

    socket.emit("changeColor", newColor);
}

export async function startGame(canvas, ctx) {

    console.log("START GAME RUNNING");

    // Ensure canvas can receive keyboard focus
    canvas.tabIndex = 1;
    canvas.focus();

    // Make canvas fullscreen
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Regenerate clouds based on screen size
        clouds = [];

        // Number of clouds based on screen width (sideways density)
        const cloudCount = Math.max(4, Math.floor(canvas.width / 250));

        for (let i = 0; i < cloudCount; i++) {
            // Spread clouds across the width instead of stacking vertically
            const spacing = canvas.width / cloudCount;
            const x = i * spacing + Math.random() * spacing;

            // Keep clouds roughly in the sky band (not spread vertically too much)
            const y = 80 + Math.random() * 120;

            const speed = 0.1 + Math.random() * 0.15;

            clouds.push(createCloud(x, y, speed));
        }
    }

    resizeCanvas();

    // Update canvas when window size changes
    window.addEventListener("resize", resizeCanvas);
    // Disable smoothing so sprites stay sharp
    ctx.imageSmoothingEnabled = false;

    // Refocus canvas if user clicks anywhere
    window.addEventListener("click", () => {
        canvas.focus();
    });

    // Persistent menu players so animation frames advance
    const menuPlayers = [
        // Purple player on left platform
        new Player(canvas.width * 0.2 - 60 + 40, canvas.height * 0.65 - 54, {}, "purple"),

        // Green player on center platform
        new Player(canvas.width * 0.4 + 40, canvas.height * 0.80 + 30 - 54, {}, "green")
    ];

    // Cache menu gradient (performance optimization)
    const menuGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    menuGradient.addColorStop(0, "#6dd5fa");
    menuGradient.addColorStop(1, "#cfefff");

    // Track mouse position
    canvas.addEventListener("mousemove", e => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    // Handle mouse clicks
    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        console.log("MOUSEDOWN EVENT", gameState, mouseX, mouseY);
        // CHARACTER SELECT ARROW CLICKS
        if (gameState === STATE.CHAR_SELECT) {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            const leftArrow = {
                x: centerX - 220,
                y: centerY - 30,
                w: 60,
                h: 60
            };

            const rightArrow = {
                x: centerX + 160,
                y: centerY - 30,
                w: 60,
                h: 60
            };

            // LEFT ARROW
            if (
                mouseX > leftArrow.x &&
                mouseX < leftArrow.x + leftArrow.w &&
                mouseY > leftArrow.y &&
                mouseY < leftArrow.y + leftArrow.h
            ) {
                selectedCharacterIndex--;
                characterTargetSlide = selectedCharacterIndex;
            }

            // RIGHT ARROW
            if (
                mouseX > rightArrow.x &&
                mouseX < rightArrow.x + rightArrow.w &&
                mouseY > rightArrow.y &&
                mouseY < rightArrow.y + rightArrow.h
            ) {
                selectedCharacterIndex++;
                characterTargetSlide = selectedCharacterIndex;
            }

            if (selectedCharacterIndex < 0) selectedCharacterIndex = characterSprites.length - 1;
            if (selectedCharacterIndex >= characterSprites.length) selectedCharacterIndex = 0;
            characterTargetSlide = selectedCharacterIndex;

            // click center character to confirm
            const confirmBox = {
                x: centerX - 80,
                y: centerY - 80,
                w: 160,
                h: 160
            };

            if (
                mouseX > confirmBox.x &&
                mouseX < confirmBox.x + confirmBox.w &&
                mouseY > confirmBox.y &&
                mouseY < confirmBox.y + confirmBox.h
            ) {
                const chosenColor = characterColors[selectedCharacterIndex];

                if (selectingPlayer === 1) {
                    selectedColorP1 = chosenColor;
                    selectingPlayer = 2;
                    selectedCharacterIndex = 0;
                    characterTargetSlide = 0;
                } else {
                    selectedColorP2 = chosenColor;
                    selectingPlayer = 1;
                    gameState = STATE.LEVEL_SELECT;
                }
            }

            return;
        }
        // LEVEL SELECT CLICK
        if (gameState === STATE.LEVEL_SELECT) {
            const cols = 5;
            const size = 50;
            const gap = 20;
            const startX = canvas.width / 2 - (cols * size + (cols - 1) * gap) / 2;
            const startY = canvas.height / 2 - 80;

            for (let i = 0; i < MAX_LEVELS; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);

                const x = startX + col * (size + gap);
                const y = startY + row * (size + gap);

                if (
                    mouseX > x &&
                    mouseX < x + size &&
                    mouseY > y &&
                    mouseY < y + size
                ) {
                    currentLevelIndex = i;
                    gameState = STATE.PLAYING;
                    loadCurrentLevel();
                }
            }
        }

        if (gameState === STATE.MENU) {

            const centerX = canvas.width / 2;

            // CREATE ROOM CLICK
            if (
                mouseX > centerX - 110 &&
                mouseX < centerX + 110 &&
                mouseY > canvas.height / 2 + 80 &&
                mouseY < canvas.height / 2 + 80 + 32
            ) {
                console.log("Create button area clicked");
                createRoom();
            }

            // JOIN ROOM CLICK
            if (
                mouseX > centerX - 110 &&
                mouseX < centerX + 110 &&
                mouseY > canvas.height / 2 + 130 &&
                mouseY < canvas.height / 2 + 130 + 32
            ) {
                console.log("JOIN BUTTON CLICKED");

                let code = prompt("Enter Room Code:");

                if (!code) {
                    console.log("No code entered");
                    return;
                }

                code = code.trim().toUpperCase();
                console.log("Attempting join:", code);

                joinRoom(code);
            }

            // SINGLE PLAYER CLICK
            if (
                mouseX > centerX - 110 &&
                mouseX < centerX + 110 &&
                mouseY > canvas.height / 2 - 40 &&
                mouseY < canvas.height / 2 - 40 + 32
            ) {
                selectedMode = "single";
                gameState = STATE.PLAYING;
                loadCurrentLevel();
            }

            // MULTIPLAYER CLICK → open character select screen
            if (
                mouseX > centerX - 110 &&
                mouseX < centerX + 110 &&
                mouseY > canvas.height / 2 &&
                mouseY < canvas.height / 2 + 32
            ) {
                selectedMode = "multi";
                gameState = STATE.CHAR_SELECT;
                selectingPlayer = 1;
                selectedColorP1 = null;
                selectedColorP2 = null;
                selectedCharacterIndex = 0;
                characterTargetSlide = 0;
            }

            // CHALLENGES CLICK
            if (
                mouseX > centerX - 110 &&
                mouseX < centerX + 110 &&
                mouseY > canvas.height / 2 + 40 &&
                mouseY < canvas.height / 2 + 40 + 32
            ) {
                selectedMode = "challenge";
                gameState = STATE.PLAYING;
                loadCurrentLevel();
            }

            const gearX = canvas.width - 55;
            const gearY = 35;

            const supportX = canvas.width - 20;
            const supportY = 35;

            // SETTINGS CLICK
            if (
                mouseX > gearX - 20 &&
                mouseX < gearX + 5 &&
                mouseY > gearY - 20 &&
                mouseY < gearY + 5
            ) {
                previousState = STATE.MENU;
                gameState = STATE.SETTINGS;
            }

            // SUPPORT CLICK
            if (
                mouseX > supportX - 20 &&
                mouseX < supportX + 5 &&
                mouseY > supportY - 20 &&
                mouseY < supportY + 5
            ) {
                gameState = STATE.SUPPORT;
            }
        }

        // LOBBY READY BUTTON CLICK
        if (gameState === STATE.LOBBY) {
            const platY = canvas.height / 2;

            // LOCK BUTTONS
            const myIndex = players.findIndex(p => p.id === socket.id);
            const isLeftPlayer = myIndex === 0;

            const lockBtnX = isLeftPlayer ? 70 : canvas.width - 150;
            const lockBtnY = platY + 170;
            const lockBtnW = 80;
            const lockBtnH = 36;

            const clickedLock = (
                mouseX >= lockBtnX &&
                mouseX <= lockBtnX + lockBtnW &&
                mouseY >= lockBtnY &&
                mouseY <= lockBtnY + lockBtnH
            );

            if (clickedLock) {
                toggleLock();
            }

            const btnX = canvas.width / 2 - 100;
            const btnY = platY + 150;
            const btnW = 200;
            const btnH = 40;

            const clickedReady = (
                mouseX > btnX &&
                mouseX < btnX + btnW &&
                mouseY > btnY &&
                mouseY < btnY + btnH
            );

            if (clickedReady) {
                console.log("READY BUTTON CLICKED");
                toggleReady();
            }

            // MY PLAYER COLOR BUTTONS
            const myPlayer = players.find(p => p.id === socket.id);

            if (myPlayer) {

                const myIndex = players.findIndex(p => p.id === socket.id);
                const isLeftPlayer = myIndex === 0;

                for (let i = 0; i < characterSprites.length; i++) {

                    const bx = isLeftPlayer ? 90 : canvas.width - 130;
                    const by = platY - 120 + i * 55;
                    const bw = 40;
                    const bh = 40;

                    const clicked = (
                        mouseX >= bx &&
                        mouseX <= bx + bw &&
                        mouseY >= by &&
                        mouseY <= by + bh
                    );

                    if (clicked) {
                        if (lockedPlayers[socket.id]) return;

                        const newColor = characterColors[i];

                        // BLOCK selecting colors already locked by another player
                        const otherLockedPlayer = players.find(p => {
                            return (
                                p.id !== socket.id &&
                                lockedPlayers[p.id] &&
                                p.color === newColor
                            );
                        });

                        if (otherLockedPlayer) {
                            console.log("COLOR ALREADY LOCKED BY OTHER PLAYER");
                            return;
                        }

                        console.log("COLOR BUTTON CLICKED:", newColor);

                        // instant local update
                        myPlayer.color = newColor;

                        // sync to server
                        socket.emit("changeColor", newColor);
                    }
                }
            }
        }

        if (gameState === STATE.PAUSED) {

            const centerX = canvas.width / 2;
            const btnWidth = 220;
            const btnHeight = 34;

            const options = ["Resume", "Settings", "Menu"];

            for (let i = 0; i < options.length; i++) {
                const y = canvas.height / 2 - 40 + i * 50;

                const hover = (
                    mouseX > centerX - btnWidth/2 &&
                    mouseX < centerX + btnWidth/2 &&
                    mouseY > y &&
                    mouseY < y + btnHeight
                );

                if (hover) {
                    if (options[i] === "Resume") gameState = STATE.PLAYING;
                    if (options[i] === "Settings") {
                        previousState = STATE.PAUSED;
                        gameState = STATE.SETTINGS;
                    }
                    if (options[i] === "Menu") gameState = STATE.MENU;
                }
            }
        }

            const centerX = canvas.width / 2;

            // TAB CLICKS
            if (mouseY > 150 && mouseY < 185) {
                if (mouseX > centerX - 220 && mouseX < centerX - 110) settingsTab = "graphics";
                if (mouseX > centerX - 110 && mouseX < centerX) settingsTab = "display";
                if (mouseX > centerX && mouseX < centerX + 110) settingsTab = "controls";
                if (mouseX > centerX + 110 && mouseX < centerX + 220) settingsTab = "sound";
            }

            // Graphics tab actions
            if (settingsTab === "graphics") {

                // Smooth camera toggle
                if (
                    mouseX > centerX - 200 &&
                    mouseX < centerX + 200 &&
                    mouseY > 230 &&
                    mouseY < 270
                ) {
                    graphicsSmoothCamera = !graphicsSmoothCamera;
                }

                // Clouds toggle
                if (
                    mouseX > centerX - 200 &&
                    mouseX < centerX + 200 &&
                    mouseY > 280 &&
                    mouseY < 320
                ) {
                    graphicsClouds = !graphicsClouds;
                }
            }

            // Display tab actions
            if (settingsTab === "display") {
                if (
                    mouseX > centerX - 200 &&
                    mouseX < centerX + 200 &&
                    mouseY > 230 &&
                    mouseY < 270
                ) {
                    displayShowFPS = !displayShowFPS;
                }
            }

            // Sound tab actions
            if (settingsTab === "sound") {
                if (
                    mouseX > centerX - 200 &&
                    mouseX < centerX + 200 &&
                    mouseY > 230 &&
                    mouseY < 270
                ) {
                    soundVolume += 10;
                    if (soundVolume > 100) soundVolume = 0;
                }
            }

        }
    );

    requestAnimationFrame(gameLoop);

    function gameLoop(time) {
        // FPS calculation
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastFpsUpdate = now;
        }
        if (gameState === STATE.CHAR_SELECT) {

            ctx.clearRect(0,0,canvas.width,canvas.height);

            // sky background
            ctx.fillStyle = menuGradient;
            ctx.fillRect(0,0,canvas.width,canvas.height);

            // Smooth sliding animation
            characterSlide += (characterTargetSlide - characterSlide) * 0.15;

            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            ctx.font = "42px Arial";
            ctx.fillText("Select Character", canvas.width/2, 120);

            // Player indicator
            ctx.font = "26px Arial";
            ctx.fillText(
                selectingPlayer === 1 ? "Player 1 Select" : "Player 2 Select",
                canvas.width/2,
                170
            );

            const centerX = canvas.width/2;
            const centerY = canvas.height / 2;

            // Full ground platform under character selection
            const platformHeight = 24;
            const platformY = centerY + 60;
            const groundHeight = canvas.height - platformY;

            // Base full-width platform
            ctx.fillStyle = "#fff2a8";
            ctx.fillRect(0, platformY, canvas.width, groundHeight);

            // Top highlight
            ctx.fillStyle = "#fff7c6";
            ctx.fillRect(0, platformY, canvas.width, 5);

            // Bottom shadow
            ctx.fillStyle = "#e2d176";
            ctx.fillRect(0, canvas.height - 5, canvas.width, 5);

            // Texture
            ctx.fillStyle = "#f0e08a";
            for (let tx = 6; tx < canvas.width - 6; tx += 18) {
                for (let ty = platformY + 6; ty < canvas.height - 6; ty += 10) {
                    ctx.fillRect(tx, ty, 6, 3);
                }
            }

            const leftArrowX = centerX - 200;
            const rightArrowX = centerX + 200;

            ctx.fillStyle = "rgba(255,255,255,0.25)";

            ctx.beginPath();
            ctx.roundRect(leftArrowX - 30, centerY - 30, 60, 60, 10);
            ctx.fill();

            ctx.beginPath();
            ctx.roundRect(rightArrowX - 30, centerY - 30, 60, 60, 10);
            ctx.fill();

            ctx.fillStyle = "white";
            ctx.font = "32px Arial";
            ctx.fillText("<", leftArrowX, centerY + 10);
            ctx.fillText(">", rightArrowX, centerY + 10);

            // draw carousel
            for (let i = 0; i < characterSprites.length; i++) {

                const offset = (i - characterSlide) * 150;

                let sprite = characterSprites[i];
                let frameX = 0;

                const frameWidth = 20;
                const frameHeight = 27;

                if (sprite.complete && sprite.naturalWidth > 0) {
                    charAnimTimer[i]++;
                    if (charAnimTimer[i] > 24) {
                        charAnimFrame[i]++;
                        charAnimTimer[i] = 0;
                    }
                    const totalFrames = Math.floor(sprite.naturalWidth / frameWidth);
                    frameX = charAnimFrame[i] % Math.max(1, totalFrames);
                }

                const size = i === selectedCharacterIndex ? 80 : 60;

                if (sprite.complete && sprite.naturalWidth > 0) {
                    ctx.drawImage(
                        sprite,
                        frameX * 20, 0, 20, 27,
                        centerX + offset - size/2,
                        platformY - size,
                        size,
                        size
                    );
                }
            }

            ctx.font = "18px Arial";
            ctx.fillText("Click arrows to change character", canvas.width/2, canvas.height - 120);
            ctx.fillText("Click character to continue", canvas.width/2, canvas.height - 90);

            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === STATE.LEVEL_SELECT) {

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#1e1e2f";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            ctx.font = "42px Arial";
            ctx.fillText("Select Level", canvas.width / 2, 150);

            const cols = 5;
            const size = 50;
            const gap = 20;
            const startX = canvas.width / 2 - (cols * size + (cols - 1) * gap) / 2;
            const startY = canvas.height / 2 - 80;

            ctx.font = "22px Arial";

            for (let i = 0; i < MAX_LEVELS; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);

                const x = startX + col * (size + gap);
                const y = startY + row * (size + gap);

                const hover = (
                    mouseX > x &&
                    mouseX < x + size &&
                    mouseY > y &&
                    mouseY < y + size
                );

                ctx.fillStyle = hover ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";
                ctx.strokeStyle = "white";

                ctx.beginPath();
                ctx.roundRect(x, y, size, size, 8);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "white";
                ctx.fillText(i + 1, x + size / 2, y + size / 2 + 1);
            }

            ctx.font = "18px Arial";
            ctx.fillText("Press ESC to return", canvas.width / 2, canvas.height - 80);

            if (keys["Escape"]) {
                gameState = STATE.MENU;
                keys["Escape"] = false;
            }

            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === STATE.SUPPORT) {

            ctx.clearRect(0,0,canvas.width,canvas.height);

            ctx.fillStyle = "#1e1e2f";
            ctx.fillRect(0,0,canvas.width,canvas.height);

            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            ctx.font = "42px Arial";
            ctx.fillText("Support", canvas.width/2, 120);

            ctx.font = "22px Arial";
            ctx.fillText("Game created by Om", canvas.width/2, 220);
            ctx.fillText("Thank you for playing!", canvas.width/2, 260);

            ctx.font = "18px Arial";
            ctx.fillText("Press ESC to return", canvas.width/2, 420);

            if (keys["Escape"]) {
                gameState = previousState;
                keys["Escape"] = false;
            }

            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === STATE.SETTINGS) {

            ctx.clearRect(0,0,canvas.width,canvas.height);

            ctx.fillStyle = "#1e1e2f";
            ctx.fillRect(0,0,canvas.width,canvas.height);

            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            ctx.font = "42px Arial";
            ctx.fillText("Settings", canvas.width/2, 110);

            const centerX = canvas.width/2;

            // Draw Tabs
            const tabs = ["graphics","display","controls","sound"];
            const labels = ["Graphics","Display","Controls","Sound"];

            for (let i = 0; i < tabs.length; i++) {
                const x = centerX - 220 + i * 110;
                const active = settingsTab === tabs[i];

                ctx.fillStyle = active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)";
                ctx.strokeStyle = "white";

                ctx.beginPath();
                ctx.roundRect(x, 150, 110, 35, 8);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "white";
                ctx.font = "18px Arial";
                ctx.fillText(labels[i], x + 55, 168);
            }

            ctx.font = "24px Arial";

            if (settingsTab === "graphics") {
                ctx.fillText("Smooth Camera: " + (graphicsSmoothCamera ? "ON" : "OFF"), centerX, 250);
                ctx.fillText("Clouds: " + (graphicsClouds ? "ON" : "OFF"), centerX, 300);
            }

            if (settingsTab === "display") {
                ctx.fillText("Show FPS: " + (displayShowFPS ? "ON" : "OFF"), centerX, 250);
            }

            if (settingsTab === "controls") {
                ctx.fillText("Player 1: WASD", centerX, 250);
                ctx.fillText("Player 2: Arrow Keys", centerX, 290);
            }

            if (settingsTab === "sound") {
                ctx.fillText("Volume: " + soundVolume + "%", centerX, 250);
            }

            ctx.font = "18px Arial";
            ctx.fillText("Press ESC to return", canvas.width/2, 420);

            if (keys["Escape"]) {
                gameState = previousState;
                keys["Escape"] = false;
            }

            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === STATE.MENU) {

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Gradient sky background (cached)
            ctx.fillStyle = menuGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (graphicsClouds) {
                // --- Floating clouds ---
                ctx.fillStyle = "rgba(255,255,255,0.9)";

                for (let i = 0; i < clouds.length; i++) {
                    const c = clouds[i];

                    // Move cloud
                    c.x += c.speed;

                    // Wrap around screen
                    if (c.x > canvas.width + 80) {
                        c.x = -80;
                    }

                    // Draw fluffy cloud from random blobs
                    for (let j = 0; j < c.parts.length; j++) {
                        const p = c.parts[j];
                        ctx.beginPath();
                        ctx.arc(c.x + p.ox, c.y + p.oy, p.r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // Decorative platforms (same style as in‑game platforms)
            const menuPlatforms = [
                { x: canvas.width * 0.2 - 60, y: canvas.height * 0.65, w: 120, h: 20 },
                { x: canvas.width * 0.72, y: canvas.height * 0.67, w: 120, h: 20 },
                { x: canvas.width * 0.4, y: canvas.height * 0.80 + 30, w: 120, h: 20 }
            ];

            for (let i = 0; i < menuPlatforms.length; i++) {
                const p = menuPlatforms[i];

                // Base pastel platform
                ctx.fillStyle = "#fff2a8";
                ctx.fillRect(p.x, p.y, p.w, p.h);

                // Top highlight
                ctx.fillStyle = "#fff7c6";
                ctx.fillRect(p.x, p.y, p.w, 4);

                // Bottom shadow
                ctx.fillStyle = "#e2d176";
                ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);

                // Pixel texture
                ctx.fillStyle = "#f0e08a";
                for (let tx = p.x + 6; tx < p.x + p.w - 6; tx += 18) {
                    for (let ty = p.y + 6; ty < p.y + p.h - 6; ty += 10) {
                        ctx.fillRect(tx, ty, 6, 3);
                    }
                }
            }

            // Decorative goal using idle door sprite
            if (GOAL_IDLE.complete && GOAL_IDLE.naturalWidth > 0) {
                ctx.drawImage(
                    GOAL_IDLE,
                    canvas.width * 0.72 + 45,
                    canvas.height * 0.67 - 40,
                    30,
                    40
                );
            } else {
                ctx.fillStyle = "green";
                ctx.fillRect(canvas.width * 0.72 + 45, canvas.height * 0.67 - 40, 30, 40);
            }

            // Draw idle players
            for (let i = 0; i < menuPlayers.length; i++) {
                const p = menuPlayers[i];
                p.vx = 0;
                p.draw(ctx);
            }

            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            const titleWidth = 720;
            const titleHeight = 280;
            const titleX = canvas.width / 2 - titleWidth / 2;
            const titleY = canvas.height / 2 - 370;

            // Draw logo image when available (use cached, pre-scaled image)
            if (TITLE_CACHE) {
                ctx.drawImage(TITLE_CACHE, titleX, titleY);
            }

            ctx.font = "22px Arial";

            const centerX = canvas.width / 2;

            const btnWidth = 220;
            const btnHeight = 32;

            ctx.textBaseline = "middle";

            const singleHover = (
                mouseX > centerX - btnWidth/2 &&
                mouseX < centerX + btnWidth/2 &&
                mouseY > canvas.height / 2 - 40 &&
                mouseY < canvas.height / 2 - 40 + btnHeight
            );

            const multiHover = (
                mouseX > centerX - btnWidth/2 &&
                mouseX < centerX + btnWidth/2 &&
                mouseY > canvas.height / 2 &&
                mouseY < canvas.height / 2 + btnHeight
            );

            const challengeHover = (
                mouseX > centerX - btnWidth/2 &&
                mouseX < centerX + btnWidth/2 &&
                mouseY > canvas.height / 2 + 40 &&
                mouseY < canvas.height / 2 + 40 + btnHeight
            );

            // Button colors
            const normalColor = "rgba(255,255,255,0.18)";
            const hoverColor = "rgba(255,255,255,0.35)";

            // --- Single Player button ---
            ctx.fillStyle = singleHover ? hoverColor : normalColor;
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(centerX - btnWidth/2, canvas.height/2 - 40, btnWidth, btnHeight, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "white";
            ctx.fillText("Single Player", centerX, canvas.height/2 - 40 + btnHeight/2);

            // --- Multiplayer button ---
            ctx.fillStyle = multiHover ? hoverColor : normalColor;
            ctx.strokeStyle = "white";
            ctx.beginPath();
            ctx.roundRect(centerX - btnWidth/2, canvas.height/2, btnWidth, btnHeight, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "white";
            ctx.fillText("Multiplayer", centerX, canvas.height/2 + btnHeight/2);

            // --- Challenges button ---
            ctx.fillStyle = challengeHover ? hoverColor : normalColor;
            ctx.strokeStyle = "white";
            ctx.beginPath();
            ctx.roundRect(centerX - btnWidth/2, canvas.height/2 + 40, btnWidth, btnHeight, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "white";
            ctx.fillText("Challenges", centerX, canvas.height/2 + 40 + btnHeight/2);

            // --- Create Room ---
const createY = canvas.height / 2 + 90;

ctx.fillStyle = normalColor;
ctx.beginPath();
ctx.roundRect(centerX - btnWidth/2, createY, btnWidth, btnHeight, 12);
ctx.fill();
ctx.stroke();

ctx.fillStyle = "white";
ctx.fillText("Create Room", centerX, createY + btnHeight/2);

// --- Join Room ---
const joinY = canvas.height / 2 + 130;

ctx.fillStyle = normalColor;
ctx.beginPath();
ctx.roundRect(centerX - btnWidth/2, joinY, btnWidth, btnHeight, 12);
ctx.fill();
ctx.stroke();

ctx.fillStyle = "white";
ctx.fillText("Join Room", centerX, joinY + btnHeight/2);

            // Settings and Support icons (top-right corner, horizontal)
            const gearHover = mouseX > canvas.width - 75 && mouseX < canvas.width - 35 && mouseY > 15 && mouseY < 55;
            const supportHover = mouseX > canvas.width - 40 && mouseX < canvas.width && mouseY > 15 && mouseY < 55;

            ctx.fillStyle = supportHover ? "#ffff99" : "white";
            ctx.fillText("🎧", canvas.width - 20, 35);

            ctx.fillStyle = gearHover ? "#ffff99" : "white";
            ctx.fillText("⚙", canvas.width - 55, 35);


            requestAnimationFrame(gameLoop);
            return;
        }

        // ...existing code...
        if (gameState === STATE.LOBBY) {

            ctx.clearRect(0,0,canvas.width,canvas.height);

            // USE SAME SKY AS MENU
            ctx.fillStyle = menuGradient;
            ctx.fillRect(0,0,canvas.width,canvas.height);

            // PLATFORM (same style as game)
            const platW = 300;
            const platH = 20;
            const platX = canvas.width/2 - platW/2;
            const platY = canvas.height/2;

            ctx.fillStyle = "#fff2a8";
            ctx.fillRect(platX, platY, platW, platH);

            ctx.fillStyle = "#fff7c6";
            ctx.fillRect(platX, platY, platW, 4);

            ctx.fillStyle = "#e2d176";
            ctx.fillRect(platX, platY + platH - 4, platW, 4);

            // GOAL in center
            const goalX = canvas.width/2 - 15;
            const goalY = platY - 40;

            if (GOAL_IDLE.complete && GOAL_IDLE.naturalWidth > 0) {
                ctx.drawImage(GOAL_IDLE, goalX, goalY, 30, 40);
            } else {
                ctx.fillStyle = "green";
                ctx.fillRect(goalX, goalY, 30, 40);
            }

            // PLAYER 1 COLOR BUTTONS
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("PLAYER 1", 110, platY - 160);

            for (let i = 0; i < characterSprites.length; i++) {
                const sprite = characterSprites[i];

                const bx = 90;
                const by = platY - 120 + i * 55;

                const player1 = players[0];
                const player1Locked = player1 && lockedPlayers[player1.id];

                const selected = (
                    player1 &&
                    player1Locked &&
                    player1.color === characterColors[i]
                );

                const lockedByOther = players.find(p => {
                    return (
                        player1 &&
                        p.id !== player1.id &&
                        lockedPlayers[p.id] &&
                        p.color === characterColors[i]
                    );
                });

                ctx.fillStyle = selected
                    ? "rgba(0,255,120,0.45)"
                    : lockedByOther
                        ? "rgba(255,0,0,0.30)"
                        : "rgba(255,255,255,0.15)";

                ctx.beginPath();
                ctx.roundRect(bx, by, 40, 40, 8);
                ctx.fill();

                if (selected) {
                    ctx.strokeStyle = "lime";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                if (sprite.complete && sprite.naturalWidth > 0) {
                    ctx.drawImage(sprite, 0, 0, 20, 27, bx + 8, by + 4, 24, 32);
                }
            }

            // PLAYER 1 LOCK BUTTON
            const player1 = players[0];
            const p1Locked = player1 && lockedPlayers[player1.id];

            ctx.fillStyle = p1Locked
                ? "rgba(0,255,100,0.45)"
                : "rgba(255,255,255,0.15)";

            ctx.beginPath();
            ctx.roundRect(70, platY + 170, 80, 36, 8);
            ctx.fill();

            ctx.fillStyle = "white";
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.fillText(
                p1Locked ? "LOCKED" : "LOCK",
                110,
                platY + 192
            );

            // PLAYER 2 COLOR BUTTONS
            if (lobbyPlayers >= 2) {
                ctx.fillStyle = "white";
                ctx.fillText("PLAYER 2", canvas.width - 110, platY - 160);

                for (let i = 0; i < characterSprites.length; i++) {
                    const sprite = characterSprites[i];

                    const bx = canvas.width - 130;
                    const by = platY - 120 + i * 55;

                    const player2 = players[1];
                    const player2Locked = player2 && lockedPlayers[player2.id];

                    const selected = (
                        player2 &&
                        player2Locked &&
                        player2.color === characterColors[i]
                    );

                    const lockedByOther = players.find(p => {
                        return (
                            player2 &&
                            p.id !== player2.id &&
                            lockedPlayers[p.id] &&
                            p.color === characterColors[i]
                        );
                    });

                    ctx.fillStyle = selected
                        ? "rgba(0,255,120,0.45)"
                        : lockedByOther
                            ? "rgba(255,0,0,0.30)"
                            : "rgba(255,255,255,0.15)";

                    ctx.beginPath();
                    ctx.roundRect(bx, by, 40, 40, 8);
                    ctx.fill();

                    if (selected) {
                        ctx.strokeStyle = "lime";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }

                    if (sprite.complete && sprite.naturalWidth > 0) {
                        ctx.drawImage(sprite, 0, 0, 20, 27, bx + 8, by + 4, 24, 32);
                    }
                }

                // PLAYER 2 LOCK BUTTON
                const player2Locked = players[1] && lockedPlayers[players[1].id];

                ctx.fillStyle = player2Locked
                    ? "rgba(0,255,100,0.45)"
                    : "rgba(255,255,255,0.15)";

                ctx.beginPath();
                ctx.roundRect(canvas.width - 150, platY + 170, 80, 36, 8);
                ctx.fill();

                ctx.fillStyle = "white";
                ctx.font = "16px Arial";
                ctx.textAlign = "center";
                ctx.fillText(
                    player2Locked ? "LOCKED" : "LOCK",
                    canvas.width - 110,
                    platY + 192
                );
            }

            // PLAYER POSITIONS
            const spacing = 140; // distance from center (goal)
            const p1X = canvas.width/2 - spacing;
            const p2X = canvas.width/2 + spacing - 60; // adjust for player width
            const playerHeight = 60; // same as sprite draw size
            const pY = platY - playerHeight;

            // ===== DRAW PLAYER SPRITES (REAL LOOK) =====
            const frameWidth = 20;
            const frameHeight = 27;
            // const size = 60;

            function drawLobbyPlayer(x, y, color) {
                const index = Math.max(0, characterColors.indexOf(color));
                const sprite = characterSprites[index];

                let frameX = 0;

                if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                    charAnimTimer[index]++;
                    if (charAnimTimer[index] > 24) {
                        charAnimFrame[index]++;
                        charAnimTimer[index] = 0;
                    }

                    const totalFrames = Math.floor(sprite.naturalWidth / frameWidth);
                    frameX = charAnimFrame[index] % Math.max(1, totalFrames);

                    const sizeH = 60;
                    const sizeW = (frameWidth / frameHeight) * sizeH;

                    ctx.drawImage(
                        sprite,
                        frameX * frameWidth, 0,
                        frameWidth, frameHeight,
                        x, y,
                        sizeW, sizeH
                    );
                }
            }

            // DRAW PLAYERS (fallback if server not synced yet)
            if (players.length === 0) {
                // fallback local preview
                drawLobbyPlayer(p1X, pY, selectedColorP1 || "green");
                // Show readiness above player (no ready state available)
                ctx.fillStyle = "gray";
                ctx.font = "16px Arial";
                ctx.textAlign = "center";
                ctx.fillText("NOT READY", p1X + 22, pY - 20);

                if (lobbyPlayers >= 2) {
                    drawLobbyPlayer(p2X, pY, selectedColorP2 || "purple");
                    ctx.fillStyle = "gray";
                    ctx.fillText("NOT READY", p2X + 22, pY - 20);
                }
            } else {
                for (let i = 0; i < players.length; i++) {
                    const p = players[i];

                    const defaultColor = (i === 0 ? "green" : "purple");

                    // ALWAYS use synced server color live
                    const color = p.color || defaultColor;

                    // assign proper position per player
                    const x = i === 0 ? p1X : p2X;

                    drawLobbyPlayer(x, pY, color);

                    // Show readiness above player using player.id
                    const isPlayerReady = !!readyPlayers[p.id];

                    ctx.fillStyle = isPlayerReady ? "lime" : "red";
                    ctx.font = "16px Arial";
                    ctx.textAlign = "center";

                    ctx.fillText(
                        isPlayerReady ? "READY" : "NOT READY",
                        x + 22,
                        pY - 20
                    );
                }
            }

            // TEXT
            ctx.fillStyle = "white";
            ctx.font = "22px Arial";
            ctx.fillText("Room: " + roomCode, canvas.width/2, 120);

            ctx.font = "18px Arial";
            ctx.fillText("Players: " + lobbyPlayers + " / 2", canvas.width/2, platY + 80);

            // AUTO START COUNTDOWN
            if (lobbyCountdownStarted) {

                const elapsed = Math.floor((Date.now() - lobbyCountdownStartTime) / 1000);
                const remaining = Math.max(0, 10 - elapsed);

                lobbyCountdown = remaining;

                ctx.fillStyle = "white";
                ctx.font = "28px Arial";
                ctx.textAlign = "center";

                ctx.fillText(
                    "Game starting in " + remaining,
                    canvas.width / 2,
                    platY + 115
                );

                // AUTO START
                if (remaining <= 0) {
                    lobbyCountdownStarted = false;

                    selectedMode = "multi";
                    gameState = STATE.PLAYING;

                    loadCurrentLevel();
                }
            }

            // READY button UI
            const btnX = canvas.width / 2 - 100;
            const btnY = platY + 150;
            const btnW = 200;
            const btnH = 40;

            ctx.fillStyle = isReady ? "rgba(0,255,0,0.4)" : "rgba(255,255,255,0.2)";
            ctx.strokeStyle = "white";

            ctx.beginPath();
            ctx.roundRect(btnX, btnY, btnW, btnH, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText(isReady ? "READY ✔" : "READY", canvas.width/2, btnY + 25);

            // (HOME BUTTON REMOVED)

            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === STATE.PLAYING && players.length > 0) {

            // ESC pauses the game
            if (keys["Escape"]) {
                gameState = STATE.PAUSED;
                keys["Escape"] = false;
            }

            // INPUT
            for (let i = 0; i < players.length; i++) {
                const p = players[i];

                if (p.inDoor) continue;

                // MULTIPLAYER CONTROL FILTER
                if (selectedMode === "multi") {

                    // only allow local user to control their own player
                    if (i !== myPlayerIndex) {
                        continue;
                    }
                }

                applyInput(p, keys);

                // Slightly reduce player movement speed
                p.vx *= 0.7;
            }

            // PHYSICS (allows player stacking)
            for (let i = 0; i < players.length; i++) {
                const p = players[i];

                if (p.inDoor) continue;

                applyPhysics(p, platforms, players);

                // SEND LIVE PLAYER POSITION
                if (selectedMode === "multi" && i === myPlayerIndex) {

                    socket.emit("playerMove", {
                        index: i,
                        x: p.x,
                        y: p.y,
                        vx: p.vx,
                        vy: p.vy,
                        direction: p.direction,
                        frame: p.frame
                    });
                }
            }

            // Prevent players from overlapping (treat players like solid bodies)
            if (players.length > 1) {
                resolvePlayerBlocking(players);
            }
            // Run level‑specific mechanics
            if (currentLevelIndex === 0) {
                updateLevel1({ players, platforms, buttons });
            }

            if (currentLevelIndex === 1) {
                updateLevel2({ players, platforms, buttons });
            }

            if (currentLevelIndex === 2) {
                updateLevel3({ players, platforms, buttons });
            }

            if (currentLevelIndex === 3) {
                updateLevel4({ players, platforms, buttons });
            }

            if (currentLevelIndex === 4) {
                const level5Context = { players, platforms, buttons, goal };
                updateLevel5(level5Context);
                window.game = level5Context; // expose timer for HUD
            }

            // VOID CHECK (restart level if any player falls below map)
            for (let i = 0; i < players.length; i++) {
                const p = players[i];

                if (p.y > 1200) { // below level
                    console.log("Player fell into void – restarting level");
                    loadCurrentLevel();
                    break; // do not stop the game loop
                }
            }

            // GOAL CHECK
            if (goal && !isLoadingLevel) {
                // Players enter the door
                if (doorUnlocked) {
                    for (let i = 0; i < players.length; i++) {
                        const p = players[i];
                        if (p.inDoor) continue;
                        const touchingDoor = (
                            p.x < goal.x + goal.w &&
                            p.x + p.w > goal.x &&
                            p.y < goal.y + goal.h &&
                            p.y + p.h > goal.y
                        );
                        if (touchingDoor) {
                            // mark player as finished
                            p.inDoor = true;

                            // completely disable collisions and movement
                            p.vx = 0;
                            p.vy = 0;
                            p.onGround = false;

                            // move far outside world safely
                            p.x = -999999;
                            p.y = -999999;

                            // disable physical body
                            p.w = 0;
                            p.h = 0;
                        }
                    }
                    const allEntered = players.every(p => p.inDoor);
                    if (allEntered) {
                        isLoadingLevel = true;
                        loadNextLevel().then(() => {
                            isLoadingLevel = false;
                        });
                    }
                }
            }

            // CAMERA FOLLOW
            // If any player just entered the door, keep the camera fixed
            const activePlayers = players.filter(p => !p.inDoor);

            if (activePlayers.length === players.length) {
                const avgX = activePlayers.reduce((sum, p) => sum + p.x, 0) / activePlayers.length;
                cameraX = Math.max(0, avgX - canvas.width / 2);
            }
            // otherwise do nothing so the camera stays where it was
        }

        /* =========================
           DRAW
        ========================= */

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Same sky gradient as menu
        ctx.fillStyle = menuGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (graphicsClouds) {
            // --- Floating clouds (also visible during gameplay) ---
            ctx.fillStyle = "rgba(255,255,255,0.9)";

            for (let i = 0; i < clouds.length; i++) {
                const c = clouds[i];

                // Move cloud slowly
                c.x += c.speed;

                // Wrap around screen
                if (c.x > canvas.width + 80) {
                    c.x = -80;
                }

                // Draw fluffy cloud from random blobs
                for (let j = 0; j < c.parts.length; j++) {
                    const p = c.parts[j];
                    ctx.beginPath();
                    ctx.arc(c.x + p.ox, c.y + p.oy, p.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.save();
        ctx.translate(-cameraX, 0);

        // Platforms (draw back-to-front based on Y so underground platforms render behind)
        const sortedPlatforms = [...platforms].sort((a, b) => a.y - b.y);

        for (let i = 0; i < sortedPlatforms.length; i++) {
            const p = sortedPlatforms[i];

            // Base pastel platform
            ctx.fillStyle = "#fff2a8";
            ctx.fillRect(p.x, p.y, p.w, p.h);

            // Top highlight
            ctx.fillStyle = "#fff7c6";
            ctx.fillRect(p.x, p.y, p.w, 4);

            // Bottom shadow
            ctx.fillStyle = "#e2d176";
            ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);

            // Pixel texture blocks (fixed grid so it doesn't flicker)
            ctx.fillStyle = "#f0e08a";
            for (let tx = p.x + 6; tx < p.x + p.w - 6; tx += 18) {
                for (let ty = p.y + 6; ty < p.y + p.h - 6; ty += 10) {
                    ctx.fillRect(tx, ty, 6, 3);
                }
            }

        }

        // Buttons
        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];

            let playerCount = 0;

            for (let j = 0; j < players.length; j++) {
                const p = players[j];

                const standingOnButton = (
                    p.x + p.w > b.x &&
                    p.x < b.x + b.w &&
                    p.y + p.h >= b.y - 14 &&
                    p.y + p.h <= b.y + 14
                );

                if (standingOnButton) {
                    playerCount++;
                }
            }

            const required = b.playersRequired || 1;
            const pressed = playerCount >= required;

            // Button sprite rendering
            const sprite = pressed ? BUTTON_PRESSED : BUTTON_IDLE;

            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                const drawHeight = pressed ? b.h - 3 : b.h;
                const drawY = pressed ? b.y + 3 : b.y;
                ctx.drawImage(sprite, b.x, drawY, b.w, drawHeight);
            } else {
                ctx.fillStyle = pressed ? "#cc4444" : "#ff6b6b";
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            // No platform-modifying logic here; handled by level2.js
        }

        // Goal
        if (goal) {

            const sprite = doorUnlocked ? GOAL_OPEN : GOAL_IDLE;

            const drawWidth = goal.w;
            const drawHeight = goal.h;

            if (sprite.complete && sprite.naturalWidth > 0) {
                ctx.drawImage(sprite, goal.x, goal.y, drawWidth, drawHeight);
            } else {
                ctx.fillStyle = "green";
                ctx.fillRect(goal.x, goal.y, drawWidth, drawHeight);
            }
        }

        // Players
        for (let i = 0; i < players.length; i++) {
            const p = players[i];

            if (p.inDoor) continue;

            p.draw(ctx);

            // Draw player coordinates above the player (debug)
            ctx.fillStyle = "black";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";
            ctx.fillText(`(${Math.round(p.x)}, ${Math.round(p.y)})`, p.x, p.y - 8);
        }

        ctx.restore();

        // Pause menu overlay (PAUSED state)
        if (gameState === STATE.PAUSED) {
            if (keys["Escape"]) {
                gameState = STATE.PLAYING;
                keys["Escape"] = false;
            }
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#1e1e2f";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;

            ctx.textAlign = "center";
            ctx.font = "42px Arial";
            ctx.fillStyle = "white";
            ctx.fillText("Paused", canvas.width / 2, canvas.height / 2 - 100);

            const centerX = canvas.width / 2;
            const btnWidth = 220;
            const btnHeight = 34;
            const options = ["Resume", "Settings", "Menu"];

            ctx.font = "24px Arial";
            ctx.textBaseline = "middle";
            for (let i = 0; i < options.length; i++) {
                const y = canvas.height / 2 - 40 + i * 50;
                const hover = (
                    mouseX > centerX - btnWidth/2 &&
                    mouseX < centerX + btnWidth/2 &&
                    mouseY > y &&
                    mouseY < y + btnHeight
                );
                ctx.fillStyle = hover ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)";
                ctx.strokeStyle = "white";
                ctx.beginPath();
                ctx.roundRect(centerX - btnWidth/2, y, btnWidth, btnHeight, 12);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "white";
                ctx.fillText(options[i], centerX, y + btnHeight/2);
                // Keyboard selection removed from here
            }
            ctx.restore();
        }

        // Level timer display (used in level 5 puzzle)
        if (gameState === STATE.PLAYING && window.game) {
            ctx.fillStyle = "black";
            ctx.font = "36px Arial";
            ctx.textAlign = "center";

            let timeText = "";

            // Prefer formatted timer with milliseconds
            if (window.game.levelTimerDisplay) {
                timeText = window.game.levelTimerDisplay;
            } else if (window.game.levelTimer !== undefined) {
                timeText = Math.ceil(window.game.levelTimer);
            }

            if (timeText !== "") {
                ctx.fillText(timeText, canvas.width / 2, 80);
            }
        }

        if (displayShowFPS) {
            // Draw FPS counter (top‑left)
            ctx.fillStyle = "black";
            ctx.font = "14px Arial";
            ctx.textAlign = "left";
            ctx.fillText("FPS: " + fps, 10, 20);
        }

        requestAnimationFrame(gameLoop);
    }
}

/* =========================
   LOAD CURRENT LEVEL
========================= */

async function loadCurrentLevel() {

    try {
        console.log("Loading level:", currentLevelIndex + 1);

        const levelData = await loadLevel(currentLevelIndex, currentWorld);

        platforms = levelData.platforms || [];
        buttons = levelData.buttons || [];
        goal = levelData.goal || null;

        doorUnlocked = true;

        const spawn0 = levelData.spawn?.[0] || { x: 100, y: 300 };
        const spawn1 = levelData.spawn?.[1] || { x: 160, y: 300 };

        if (selectedMode === "single" || selectedMode === "challenge") {

            players = [
                new Player(spawn0.x, spawn0.y, {
                    left: "a",
                    right: "d",
                    jump: "w"
                })
            ];

            players.forEach(p => p.inDoor = false);

        } else if (selectedMode === "multi") {

            const player1Color = players[0]?.color || "green";
            const player2Color = players[1]?.color || "purple";

            players = [
                new Player(spawn0.x, spawn0.y, {
                    left: "a",
                    right: "d",
                    jump: "w"
                }, player1Color),

                new Player(spawn1.x, spawn1.y, {
                    left: "ArrowLeft",
                    right: "ArrowRight",
                    jump: "ArrowUp"
                }, player2Color)
            ];

            players.forEach(p => p.inDoor = false);

        }

    } catch (err) {
        console.error("Level loading failed:", err);
    }
}

/* =========================
   LOAD NEXT LEVEL
========================= */

async function loadNextLevel() {

    currentLevelIndex++;
    // If no more levels exist, just stay on the last one
    if (currentLevelIndex >= MAX_LEVELS) {
        console.log("All levels completed");
        return;
    }

    await loadCurrentLevel();
}

import { startGame } from "./js/game.js";
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io("syncsteps67-bot-production.up.railway.app");

socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
});

console.log("MAIN.JS LOADED");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 900;
canvas.height = 500;

startGame(canvas, ctx);

// ===== ROOM TEST FUNCTIONS =====
window.createRoom = () => {
    socket.emit("createRoom");
};

socket.on("roomCreated", (code) => {
    console.log("Room code:", code);
});

window.joinRoom = (code) => {
    socket.emit("joinRoom", code);
};

socket.on("playerJoined", () => {
    console.log("Another player joined!");
});

socket.on("errorMessage", (msg) => {
    console.log("Error:", msg);
});

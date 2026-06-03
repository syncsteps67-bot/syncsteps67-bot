import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 8080;

// ROOM STORAGE
const rooms = {};
const readyPlayers = {};
const lockedPlayers = {};

app.use(express.static("."));

function generateRoomCode() {
    return Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase();
}

io.on("connection", (socket) => {

    console.log("Player connected:", socket.id);

    // CREATE ROOM
    socket.on("createRoom", () => {

        const code = generateRoomCode();

        rooms[code] = [
            {
                id: socket.id,
                color: "green"
            }
        ];

        readyPlayers[code] = {};
        lockedPlayers[code] = {};

        socket.join(code);
        socket.roomCode = code;

        socket.emit("roomCreated", code);

        io.to(code).emit("playersUpdate", rooms[code]);

        console.log("Room created:", code);
    });

    // JOIN ROOM
    socket.on("joinRoom", (code) => {

        if (!rooms[code]) {
            socket.emit("roomNotFound");
            return;
        }

        if (rooms[code].length >= 2) {
            socket.emit("roomFull");
            return;
        }

        rooms[code].push({
            id: socket.id,
            color: "purple"
        });

        socket.join(code);
        socket.roomCode = code;

        socket.emit("roomJoined", code);

        io.to(code).emit("playersUpdate", rooms[code]);

        console.log("Player joined room:", code);
    });

    // COLOR CHANGE
    socket.on("changeColor", (newColor) => {

        const code = socket.roomCode;

        if (!code || !rooms[code]) return;

        const player = rooms[code].find(p => p.id === socket.id);

        if (!player) return;

        player.color = newColor;

        io.to(code).emit("playersUpdate", rooms[code]);

        console.log("Color changed:", newColor);
    });

    // READY
    socket.on("playerReady", (isReady) => {

        const code = socket.roomCode;

        if (!code) return;

        readyPlayers[code][socket.id] = isReady;

        io.to(code).emit("readyUpdate", readyPlayers[code]);
    });

    // LOCK
    socket.on("playerLock", (locked) => {

        const code = socket.roomCode;

        if (!code) return;

        lockedPlayers[code][socket.id] = locked;

        io.to(code).emit("lockUpdate", lockedPlayers[code]);
        io.to(code).emit("playersUpdate", rooms[code]);
    });

    // LIVE PLAYER MOVEMENT RELAY
    socket.on("playerMove", (data) => {

        const roomCode = socket.roomCode;

        if (!roomCode) return;

        // send movement to everyone else in room
        socket.to(roomCode).emit("playerMove", data);
    });

    // DISCONNECT
    socket.on("disconnect", () => {

        const code = socket.roomCode;

        if (code && rooms[code]) {

            rooms[code] = rooms[code].filter(
                p => p.id !== socket.id
            );

            delete readyPlayers[code]?.[socket.id];
            delete lockedPlayers[code]?.[socket.id];

            io.to(code).emit("playersUpdate", rooms[code]);
            io.to(code).emit("readyUpdate", readyPlayers[code] || {});
            io.to(code).emit("lockUpdate", lockedPlayers[code] || {});

            if (rooms[code].length === 0) {
                delete rooms[code];
                delete readyPlayers[code];
                delete lockedPlayers[code];
            }
        }

        console.log("Player disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

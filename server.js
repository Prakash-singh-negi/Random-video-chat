const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store waiting users and active rooms
let waitingUsers = [];
let activeRooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user joining the waiting queue
    socket.on('find-match', (userData) => {
        console.log('User looking for match:', socket.id);
        
        // Check if there's someone waiting
        if (waitingUsers.length > 0) {
            // Match with waiting user
            const partner = waitingUsers.shift();
            const roomId = `room_${socket.id}_${partner.id}`;
            
            // Join both users to the room
            socket.join(roomId);
            partner.socket.join(roomId);
            
            // Store room info
            activeRooms.set(socket.id, { roomId, partnerId: partner.id });
            activeRooms.set(partner.id, { roomId, partnerId: socket.id });
            
            // Notify both users they've been matched
            socket.emit('match-found', { roomId, isInitiator: true });
            partner.socket.emit('match-found', { roomId, isInitiator: false });
            
            console.log(`Matched ${socket.id} with ${partner.id} in room ${roomId}`);
        } else {
            // Add to waiting queue
            waitingUsers.push({ id: socket.id, socket: socket, userData });
            socket.emit('waiting-for-match');
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        socket.to(data.roomId).emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', data);
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
        socket.to(data.roomId).emit('chat-message', data);
    });

    // Handle user leaving/disconnecting
    socket.on('leave-room', () => {
        handleUserLeave(socket);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        handleUserLeave(socket);
    });
});

function handleUserLeave(socket) {
    // Remove from waiting queue if present
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    
    // Handle active room cleanup
    if (activeRooms.has(socket.id)) {
        const { roomId, partnerId } = activeRooms.get(socket.id);
        
        // Notify partner
        socket.to(roomId).emit('partner-left');
        
        // Clean up room data
        activeRooms.delete(socket.id);
        activeRooms.delete(partnerId);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

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
// Add room validation to prevent cross-room signaling
socket.on('offer', (data) => {
    if (activeRooms.has(socket.id) && activeRooms.get(socket.id).roomId === data.roomId) {
        socket.to(data.roomId).emit('offer', data);
        console.log(`Offer sent in room ${data.roomId}`);
    } else {
        console.log(`Invalid offer for room ${data.roomId} from ${socket.id}`);
    }
});

socket.on('answer', (data) => {
    if (activeRooms.has(socket.id) && activeRooms.get(socket.id).roomId === data.roomId) {
        socket.to(data.roomId).emit('answer', data);
        console.log(`Answer sent in room ${data.roomId}`);
    } else {
        console.log(`Invalid answer for room ${data.roomId} from ${socket.id}`);
    }
});

socket.on('ice-candidate', (data) => {
    if (activeRooms.has(socket.id) && activeRooms.get(socket.id).roomId === data.roomId) {
        socket.to(data.roomId).emit('ice-candidate', data);
    } else {
        console.log(`Invalid ICE candidate for room ${data.roomId} from ${socket.id}`);
    }
});


    // Handle chat messages
    socket.on('chat-message', (data) => {
        socket.to(data.roomId).emit('chat-message', data);
    });

    // Handle media toggle events
    socket.on('media-toggle', (data) => {
        if (activeRooms.has(socket.id) && activeRooms.get(socket.id).roomId === data.roomId) {
            socket.to(data.roomId).emit('media-toggle', data);
            console.log(`Media toggle sent in room ${data.roomId}: ${data.type} ${data.enabled ? 'enabled' : 'disabled'}`);
        } else {
            console.log(`Invalid media toggle for room ${data.roomId} from ${socket.id}`);
        }
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

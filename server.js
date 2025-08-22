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

// Store waiting users and active rooms with enhanced user data
let waitingUsers = [];
let activeRooms = new Map();

// Store skip history for each user
let userSkipHistory = new Map(); // userId -> Set of skipped user IDs
const SKIP_HISTORY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_SKIP_HISTORY_SIZE = 20; // Maximum number of users to remember per user

// Gender and country matching utility functions
function canMatchUsers(user1, user2) {
    // Check gender compatibility first
    const user1Gender = user1.gender || user1.profile?.gender;
    const user2Gender = user2.gender || user2.profile?.gender;
    const user1GenderPref = user1.genderPreference || user1.profile?.genderPreference;
    const user2GenderPref = user2.genderPreference || user2.profile?.genderPreference;
    
    // Check if gender preferences are compatible
    const user1MatchesUser2Gender = user2GenderPref === 'any' || 
        user2GenderPref === user1Gender || 
        (user2GenderPref === 'other' && user1Gender === 'other');
    
    const user2MatchesUser1Gender = user1GenderPref === 'any' || 
        user1GenderPref === user2Gender || 
        (user1GenderPref === 'other' && user2Gender === 'other');
    
    if (!user1MatchesUser2Gender || !user2MatchesUser1Gender) {
        return false;
    }
    
    // If either user has no country filter, they can match with anyone
    if (!user1.countryFilter || user1.countryFilter === 'any' || 
        !user2.countryFilter || user2.countryFilter === 'any') {
        return true;
    }
    
    // Check if users' countries match their respective filters
    const user1Country = user1.country || user1.profile?.country;
    const user2Country = user2.country || user2.profile?.country;
    
    // If we have country information, check compatibility
    if (user1Country && user2Country) {
        // Check if user1's country matches user2's filter
        const user1MatchesUser2Filter = user2.countryFilter === 'any' || 
            user2.countryFilter === user1Country ||
            (user2.preferredCountries && user2.preferredCountries.includes(user1Country));
        
        // Check if user2's country matches user1's filter
        const user2MatchesUser1Filter = user1.countryFilter === 'any' || 
            user1.countryFilter === user2Country ||
            (user1.preferredCountries && user1.preferredCountries.includes(user2Country));
        
        return user1MatchesUser2Filter && user2MatchesUser1Filter;
    }
    
    // If no country information, allow matching
    return true;
}

// Skip history management functions
function addToSkipHistory(userId, skippedUserId) {
    if (!userSkipHistory.has(userId)) {
        userSkipHistory.set(userId, new Map());
    }
    
    const userSkips = userSkipHistory.get(userId);
    userSkips.set(skippedUserId, Date.now());
    
    // Clean up old entries
    cleanupUserSkipHistory(userId);
    
    console.log(`Added ${skippedUserId} to skip history for ${userId}`);
}

function isUserInSkipHistory(userId, targetUserId) {
    const userSkips = userSkipHistory.get(userId);
    if (!userSkips) return false;
    
    const skipTime = userSkips.get(targetUserId);
    if (!skipTime) return false;
    
    const now = Date.now();
    const timeSinceSkip = now - skipTime;
    
    // Check if enough time has passed
    if (timeSinceSkip > SKIP_HISTORY_TIMEOUT) {
        userSkips.delete(targetUserId);
        return false;
    }
    
    return true;
}

function cleanupUserSkipHistory(userId) {
    const userSkips = userSkipHistory.get(userId);
    if (!userSkips) return;
    
    const now = Date.now();
    const expiredUsers = [];
    
    // Find expired entries
    for (const [skippedUserId, skipTime] of userSkips.entries()) {
        if (now - skipTime > SKIP_HISTORY_TIMEOUT) {
            expiredUsers.push(skippedUserId);
        }
    }
    
    // Remove expired entries
    expiredUsers.forEach(skippedUserId => {
        userSkips.delete(skippedUserId);
    });
    
    // If still too many entries, remove oldest ones
    if (userSkips.size > MAX_SKIP_HISTORY_SIZE) {
        const entries = Array.from(userSkips.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
        
        const toRemove = entries.slice(0, userSkips.size - MAX_SKIP_HISTORY_SIZE);
        toRemove.forEach(([skippedUserId]) => {
            userSkips.delete(skippedUserId);
        });
    }
    
    if (expiredUsers.length > 0 || userSkips.size > MAX_SKIP_HISTORY_SIZE) {
        console.log(`Cleaned up skip history for ${userId}. Removed ${expiredUsers.length} expired entries. Current size: ${userSkips.size}`);
    }
}

function findBestMatch(newUser) {
    // First, try to find an exact gender AND country match
    for (let i = 0; i < waitingUsers.length; i++) {
        const waitingUser = waitingUsers[i];
        
        // Check if either user has the other in their skip history
        if (isUserInSkipHistory(newUser.id, waitingUser.id) || 
            isUserInSkipHistory(waitingUser.id, newUser.id)) {
            continue; // Skip this match
        }
        
        if (canMatchUsers(newUser, waitingUser)) {
            const newUserGender = newUser.gender || newUser.profile?.gender;
            const waitingUserGender = waitingUser.gender || waitingUser.profile?.gender;
            const newUserCountry = newUser.country || newUser.profile?.country;
            const waitingUserCountry = waitingUser.country || waitingUser.profile?.country;
            
            if (newUserGender && waitingUserGender && newUserGender === waitingUserGender &&
                newUserCountry && waitingUserCountry && newUserCountry === waitingUserCountry) {
                return { index: i, user: waitingUser, priority: 'exact' };
            }
        }
    }
    
    // Second, try to find an exact gender match
    for (let i = 0; i < waitingUsers.length; i++) {
        const waitingUser = waitingUsers[i];
        
        // Check if either user has the other in their skip history
        if (isUserInSkipHistory(newUser.id, waitingUser.id) || 
            isUserInSkipHistory(waitingUser.id, newUser.id)) {
            continue; // Skip this match
        }
        
        if (canMatchUsers(newUser, waitingUser)) {
            const newUserGender = newUser.gender || newUser.profile?.gender;
            const waitingUserGender = waitingUser.gender || waitingUser.profile?.gender;
            
            if (newUserGender && waitingUserGender && newUserGender === waitingUserGender) {
                return { index: i, user: waitingUser, priority: 'gender' };
            }
        }
    }
    
    // Third, try to find an exact country match
    for (let i = 0; i < waitingUsers.length; i++) {
        const waitingUser = waitingUsers[i];
        
        // Check if either user has the other in their skip history
        if (isUserInSkipHistory(newUser.id, waitingUser.id) || 
            isUserInSkipHistory(waitingUser.id, newUser.id)) {
            continue; // Skip this match
        }
        
        if (canMatchUsers(newUser, waitingUser)) {
            const newUserCountry = newUser.country || newUser.profile?.country;
            const waitingUserCountry = waitingUser.country || waitingUser.profile?.country;
            
            if (newUserCountry && waitingUserCountry && newUserCountry === waitingUserCountry) {
                return { index: i, user: waitingUser, priority: 'country' };
            }
        }
    }
    
    // Finally, try to find any compatible match
    for (let i = 0; i < waitingUsers.length; i++) {
        const waitingUser = waitingUsers[i];
        
        // Check if either user has the other in their skip history
        if (isUserInSkipHistory(newUser.id, waitingUser.id) || 
            isUserInSkipHistory(waitingUser.id, newUser.id)) {
            continue; // Skip this match
        }
        
        if (canMatchUsers(newUser, waitingUser)) {
            return { index: i, user: waitingUser, priority: 'compatible' };
        }
    }
    
    return null;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user joining the waiting queue
    socket.on('find-match', (userData) => {
        console.log('User looking for match:', socket.id, 'with data:', userData);
        
        // Check if there's a compatible waiting user
        const match = findBestMatch(userData);
        
        if (match) {
            // Remove the matched user from waiting queue
            const matchedUser = waitingUsers.splice(match.index, 1)[0];
            const roomId = `room_${socket.id}_${matchedUser.id}`;
            
            // Join both users to the room
            socket.join(roomId);
            matchedUser.socket.join(roomId);
            
            // Store room info
            activeRooms.set(socket.id, { roomId, partnerId: matchedUser.id });
            activeRooms.set(matchedUser.id, { roomId, partnerId: socket.id });
            
            // Notify both users they've been matched
            socket.emit('match-found', { roomId, isInitiator: true });
            matchedUser.socket.emit('match-found', { roomId, isInitiator: false });
            
            const user1Gender = userData.gender || userData.profile?.gender;
            const user2Gender = matchedUser.gender || matchedUser.profile?.gender;
            console.log(`Matched ${socket.id} (${user1Gender}) with ${matchedUser.id} (${user2Gender}) in room ${roomId} (${match.priority} match)`);
        } else {
            // Add to waiting queue with enhanced user data
            waitingUsers.push({ 
                id: socket.id, 
                socket: socket, 
                ...userData 
            });
            socket.emit('waiting-for-match');
            console.log(`Added ${socket.id} to waiting queue. Total waiting: ${waitingUsers.length}`);
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
    socket.on('leave-room', (data) => {
        handleUserLeave(socket, data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        handleUserLeave(socket);
        
        // Clean up skip history for disconnected user
        userSkipHistory.delete(socket.id);
        console.log(`Cleaned up skip history for disconnected user ${socket.id}`);
    });
});

function handleUserLeave(socket, data = {}) {
    // Remove from waiting queue if present
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    
    // Handle active room cleanup
    if (activeRooms.has(socket.id)) {
        const { roomId, partnerId } = activeRooms.get(socket.id);
        
        // Clean up room data first
        activeRooms.delete(socket.id);
        if (partnerId) {
            activeRooms.delete(partnerId);
        }
        
        // Check if this is a skip operation (partner should auto-rematch)
        if (data.isSkip && partnerId) {
            // Add the skipped user to the skipper's skip history
            addToSkipHistory(socket.id, partnerId);
            
            // Find the partner socket
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                // Automatically rematch the partner who got skipped
                console.log(`Auto-rematching skipped partner ${partnerId}`);
                
                // Get the partner's user data from the room info or waiting queue
                let partnerUserData = null;
                
                // Check if partner is already in waiting queue
                const waitingPartner = waitingUsers.find(user => user.id === partnerId);
                if (waitingPartner) {
                    partnerUserData = {
                        timestamp: Date.now(),
                        profile: waitingPartner.profile,
                        country: waitingPartner.country,
                        gender: waitingPartner.gender,
                        genderPreference: waitingPartner.genderPreference,
                        preferredCountries: waitingPartner.preferredCountries,
                        countryFilter: waitingPartner.countryFilter
                    };
                } else {
                    // Create basic user data for rematch
                    partnerUserData = {
                        timestamp: Date.now(),
                        profile: {},
                        country: 'any',
                        gender: 'any',
                        genderPreference: 'any',
                        preferredCountries: ['any'],
                        countryFilter: 'any'
                    };
                }
                
                // Try to find a new match for the partner
                const newMatch = findBestMatch(partnerUserData);
                
                if (newMatch) {
                    // Remove the matched user from waiting queue
                    const matchedUser = waitingUsers.splice(newMatch.index, 1)[0];
                    const newRoomId = `room_${partnerId}_${matchedUser.id}`;
                    
                    // Join both users to the new room
                    partnerSocket.join(newRoomId);
                    matchedUser.socket.join(newRoomId);
                    
                    // Store new room info
                    activeRooms.set(partnerId, { roomId: newRoomId, partnerId: matchedUser.id });
                    activeRooms.set(matchedUser.id, { roomId: newRoomId, partnerId: partnerId });
                    
                    // Notify both users they've been matched
                    partnerSocket.emit('match-found', { roomId: newRoomId, isInitiator: true });
                    matchedUser.socket.emit('match-found', { roomId: newRoomId, isInitiator: false });
                    
                    console.log(`Auto-rematched ${partnerId} with ${matchedUser.id} in room ${newRoomId}`);
                } else {
                    // No immediate match available, add partner to waiting queue
                    waitingUsers.push({
                        id: partnerId,
                        socket: partnerSocket,
                        ...partnerUserData
                    });
                    partnerSocket.emit('waiting-for-match');
                    console.log(`Added auto-rematched partner ${partnerId} to waiting queue`);
                }
            }
        } else {
            // Regular disconnect - notify partner normally
            socket.to(roomId).emit('partner-left');
        }
        
        console.log(`User ${socket.id} left room ${roomId}`);
    }
    
    console.log(`Waiting users: ${waitingUsers.length}, Active rooms: ${activeRooms.size}`);
}

// Periodic cleanup of skip history
setInterval(() => {
    const now = Date.now();
    let totalCleaned = 0;
    
    for (const [userId, userSkips] of userSkipHistory.entries()) {
        const beforeSize = userSkips.size;
        cleanupUserSkipHistory(userId);
        const afterSize = userSkips.size;
        totalCleaned += (beforeSize - afterSize);
    }
    
    if (totalCleaned > 0) {
        console.log(`Periodic cleanup: Removed ${totalCleaned} expired skip history entries`);
    }
}, 60000); // Run every minute

const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Country-based matching enabled');
    console.log('Skip history protection enabled (5-minute timeout)');
});

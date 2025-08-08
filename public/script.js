class VideoChat {
    constructor() {
        this.socket = io();
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        this.connectionState = 'idle'; // Track state
        this.streamUsageCount = 0; // Track how many connections use the stream
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        
        console.log('VideoChat initialized');
    }

    initializeElements() {
        // Screens
        this.startScreen = document.getElementById('start-screen');
        this.waitingScreen = document.getElementById('waiting-screen');
        this.chatScreen = document.getElementById('chat-screen');
        
        // Videos
        this.localVideo = document.getElementById('local-video');
        this.remoteVideo = document.getElementById('remote-video');
        
        // Buttons
        this.startChatBtn = document.getElementById('start-chat-btn');
        this.cancelWaitingBtn = document.getElementById('cancel-waiting-btn');
        this.toggleVideoBtn = document.getElementById('toggle-video-btn');
        this.toggleAudioBtn = document.getElementById('toggle-audio-btn');
        this.nextChatBtn = document.getElementById('next-chat-btn');
        this.endChatBtn = document.getElementById('end-chat-btn');
        this.toggleChatBtn = document.getElementById('toggle-chat-btn');
        
        // Chat elements
        this.chatPanel = document.getElementById('chat-panel');
        this.closeChatBtn = document.getElementById('close-chat-btn');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendMessageBtn = document.getElementById('send-message-btn');
        
        // Status
        this.statusText = document.getElementById('status-text');
        
        // Partner status indicators
        this.partnerVideoStatus = document.getElementById('partner-video-status');
        this.partnerAudioStatus = document.getElementById('partner-audio-status');
        
        // Debug button
        this.debugMediaBtn = document.getElementById('debug-media-btn');
        
        console.log('Elements initialized');
    }

    setupEventListeners() {
        this.startChatBtn.addEventListener('click', () => {
            console.log('Start chat clicked');
            this.startVideoChat();
        });
        
        this.cancelWaitingBtn.addEventListener('click', () => {
            console.log('Cancel waiting clicked');
            this.cancelWaiting();
        });
        
        this.toggleVideoBtn.addEventListener('click', () => {
            console.log('Toggle video clicked');
            this.toggleVideo();
        });
        
        this.toggleAudioBtn.addEventListener('click', () => {
            console.log('Toggle audio clicked');
            this.toggleAudio();
        });
        
        this.nextChatBtn.addEventListener('click', () => {
            console.log('Next chat clicked');
            this.nextChat();
        });
        
        this.endChatBtn.addEventListener('click', () => {
            console.log('End chat clicked');
            this.endChat();
        });
        
        this.toggleChatBtn.addEventListener('click', () => {
            console.log('Toggle chat panel clicked');
            this.toggleChatPanel();
        });
        
        this.closeChatBtn.addEventListener('click', () => {
            console.log('Close chat panel clicked');
            this.closeChatPanel();
        });
        
        this.sendMessageBtn.addEventListener('click', () => {
            console.log('Send message clicked');
            this.sendMessage();
        });
        
        this.debugMediaBtn.addEventListener('click', () => {
            console.log('Debug media clicked');
            this.debugMediaStates();
        });
        
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('Enter pressed in chat input');
                this.sendMessage();
            }
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('Disconnected from server');
        });
        
        console.log('Event listeners set up');
    }

    setupSocketListeners() {
        this.socket.on('waiting-for-match', () => {
            console.log('Waiting for match');
            this.showScreen('waiting');
            this.updateStatus('Looking for a chat partner...');
        });

this.socket.on('match-found', async (data) => {
    console.log('Match found:', data);

    this.currentRoom = data.roomId;
    this.connectionState = 'matched';
    this.showScreen('chat');
    this.updateStatus('Connected! Setting up video...');

    // Ensure local media is ready
    if (!this.localStream) {
        try {
            await this.startVideoChat(); // reacquire media if missing
            console.log('Local media reacquired after match-found.');
        } catch (e) {
            this.updateStatus('Could not access camera/mic');
            console.error('Error getting local media after match-found:', e);
            return;
        }
    }

    this.setupPeerConnection();

    if (data.isInitiator) {
        console.log('Creating offer as initiator for room:', this.currentRoom);
        setTimeout(() => this.createOffer(), 1000);
    }
});


        this.socket.on('offer', async (data) => {
            console.log('Received offer');
            try {
                await this.handleOffer(data.offer);
            } catch (error) {
                console.error('Error handling offer:', error);
            }
        });

        this.socket.on('answer', async (data) => {
            console.log('Received answer');
            try {
                await this.handleAnswer(data.answer);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        });

        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate');
            try {
                await this.handleIceCandidate(data.candidate);
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
            }
        });

        this.socket.on('chat-message', (data) => {
            console.log('Received chat message:', data.message);
            this.displayMessage(data.message, 'received');
        });

        this.socket.on('media-toggle', (data) => {
            console.log('Partner media toggle:', data);
            this.handlePartnerMediaToggle(data);
        });

        this.socket.on('partner-left', () => {
            console.log('Partner left the chat');
            this.updateStatus('Partner left the chat');
            this.resetChat();
            setTimeout(() => {
                this.showScreen('start');
                this.updateStatus('Ready to connect');
            }, 2000);
        });
        
        console.log('Socket listeners set up');
    }

    async startVideoChat() {
        try {
            console.log('Starting video chat...');
            this.updateStatus('Getting camera and microphone access...');
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Browser does not support camera/microphone access');
            }
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Got local stream');
            
            this.localVideo.srcObject = this.localStream;
            
            this.localVideo.play().catch(e => {
                console.log('Local video autoplay prevented:', e);
            });

            this.localVideo.onloadedmetadata = () => {
                console.log('Local video metadata loaded');
                console.log('Local video dimensions:', this.localVideo.videoWidth, 'x', this.localVideo.videoHeight);
            };
            
            await this.setupPeerConnection();
            
            console.log('Emitting find-match');
            this.socket.emit('find-match', { timestamp: Date.now() });
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            let errorMessage = 'Error: Could not access camera/microphone. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow camera and microphone permissions.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera/microphone found.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Camera/microphone is being used by another application.';
            } else {
                errorMessage += error.message;
            }
            
            this.updateStatus(errorMessage);
            this.showScreen('start');
        }
    }

async setupPeerConnection() {
    console.log('Setting up peer connection for room:', this.currentRoom);
    
    // Close any existing peer connection first
    if (this.peerConnection) {
        console.log('Closing existing peer connection');
        this.peerConnection.close();
        this.peerConnection = null;
    }
    
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:a.relay.metered.ca:80',
                username: 'dd386565311057dd7541e8d2',
                credential: 'FdPalzgK8xPZhWgP'
            },
            {
                urls: 'turn:a.relay.metered.ca:443',
                username: 'dd386565311057dd7541e8d2',
                credential: 'FdPalzgK8xPZhWgP'
            }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };

    // Create new peer connection for this specific pair
    this.peerConnection = new RTCPeerConnection(configuration);
    this.connectionState = 'connecting';

    // Clone local stream tracks to avoid conflicts
    if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
            console.log(`Adding ${track.kind} track to peer connection for room:`, this.currentRoom);
            // Clone the track to avoid sharing issues
            const clonedTrack = track.clone();
            this.peerConnection.addTrack(clonedTrack, this.localStream);
        });
        
        // Sync the current media states with the new peer connection
        this.syncMediaStates();
    }

    // Enhanced remote stream handling
    this.peerConnection.ontrack = (event) => {
        console.log('Received remote stream for room:', this.currentRoom);
        
        // Ensure we're still in the same room
        if (!this.currentRoom) {
            console.log('No current room, ignoring remote stream');
            return;
        }
        
        this.remoteStream = event.streams[0];
        this.remoteVideo.srcObject = this.remoteStream;
        
        // Force video to play
        this.remoteVideo.muted = false;
        this.remoteVideo.play().catch(e => {
            console.log('Remote video autoplay prevented:', e);
        });
        
        this.remoteVideo.onloadedmetadata = () => {
            console.log('Remote video loaded for room:', this.currentRoom);
            console.log('Remote video dimensions:', this.remoteVideo.videoWidth, 'x', this.remoteVideo.videoHeight);
        };
        
        this.connectionState = 'connected';
        this.updateStatus('Video chat connected and playing!');
    };

    // ICE candidate handling with room validation
    this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.currentRoom) {
            console.log(`Sending ICE candidate for room ${this.currentRoom}:`, event.candidate.type);
            this.socket.emit('ice-candidate', {
                roomId: this.currentRoom,
                candidate: event.candidate
            });
        } else if (!event.candidate) {
            console.log('ICE candidate gathering complete for room:', this.currentRoom);
        }
    };

    // Enhanced connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log(`Connection state changed to ${state} for room:`, this.currentRoom);
        
        switch (state) {
            case 'connected':
                this.connectionState = 'connected';
                this.updateStatus('Video chat connected!');
                break;
            case 'disconnected':
                this.connectionState = 'disconnected';
                this.updateStatus('Connection lost');
                break;
            case 'failed':
                this.connectionState = 'failed';
                this.updateStatus('Connection failed');
                this.handleConnectionFailure();
                break;
            case 'closed':
                this.connectionState = 'closed';
                break;
        }
    };
    
    console.log('Peer connection setup complete for room:', this.currentRoom);
}

    syncMediaStates() {
        if (this.peerConnection && this.localStream) {
            const senders = this.peerConnection.getSenders();
            
            // Sync video state
            const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
            if (videoSender && videoSender.track) {
                videoSender.track.enabled = this.isVideoEnabled;
            }
            
            // Sync audio state
            const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio');
            if (audioSender && audioSender.track) {
                audioSender.track.enabled = this.isAudioEnabled;
            }
            
            console.log('Media states synced - Video:', this.isVideoEnabled, 'Audio:', this.isAudioEnabled);
        }
    }

    debugMediaStates() {
        console.log('=== MEDIA STATE DEBUG ===');
        console.log('Local stream video tracks:', this.localStream?.getVideoTracks().map(t => ({
            enabled: t.enabled,
            readyState: t.readyState,
            muted: t.muted
        })));
        console.log('Local stream audio tracks:', this.localStream?.getAudioTracks().map(t => ({
            enabled: t.enabled,
            readyState: t.readyState,
            muted: t.muted
        })));
        
        if (this.peerConnection) {
            const senders = this.peerConnection.getSenders();
            console.log('Peer connection senders:', senders.map(sender => ({
                trackKind: sender.track?.kind,
                trackEnabled: sender.track?.enabled,
                trackReadyState: sender.track?.readyState
            })));
        }
        
        console.log('Class state - Video enabled:', this.isVideoEnabled, 'Audio enabled:', this.isAudioEnabled);
        console.log('========================');
    }


    debugVideoStatus() {
        console.log('=== VIDEO DEBUG INFO ===');
        
        console.log('Local video element:', this.localVideo);
        console.log('Local video srcObject:', this.localVideo.srcObject);
        console.log('Local video readyState:', this.localVideo.readyState);
        console.log('Local video videoWidth:', this.localVideo.videoWidth);
        console.log('Local video videoHeight:', this.localVideo.videoHeight);
        console.log('Local video paused:', this.localVideo.paused);
        
        console.log('Remote video element:', this.remoteVideo);
        console.log('Remote video srcObject:', this.remoteVideo.srcObject);
        console.log('Remote video readyState:', this.remoteVideo.readyState);
        console.log('Remote video videoWidth:', this.remoteVideo.videoWidth);
        console.log('Remote video videoHeight:', this.remoteVideo.videoHeight);
        console.log('Remote video paused:', this.remoteVideo.paused);
        
        if (this.localStream) {
            console.log('Local stream tracks:', this.localStream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState
            })));
        }
        
        if (this.remoteStream) {
            console.log('Remote stream tracks:', this.remoteStream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState
            })));
        }
        
        console.log('========================');
    }

    async handleIceFailure() {
        console.log('Handling ICE failure...');
        
        if (this.iceReconnectTimeout) {
            clearTimeout(this.iceReconnectTimeout);
            this.iceReconnectTimeout = null;
        }
        
        if (this.peerConnection && this.peerConnection.connectionState !== 'closed') {
            console.log('Attempting ICE restart...');
            this.updateStatus('Restarting connection...');
            
            try {
                await this.restartIce();
            } catch (error) {
                console.error('ICE restart failed:', error);
                this.handleConnectionFailure();
            }
        }
    }
    // Add this method to your VideoChat class
async checkMediaTransmission() {
    if (this.peerConnection) {
        const stats = await this.peerConnection.getStats();
        stats.forEach(report => {
            // Check outbound video
            if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                console.log('📤 Outbound Video Stats:', {
                    bytesSent: report.bytesSent,
                    packetsSent: report.packetsSent,
                    framesEncoded: report.framesEncoded
                });
            }
            // Check inbound video
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                console.log('📥 Inbound Video Stats:', {
                    bytesReceived: report.bytesReceived,
                    packetsReceived: report.packetsReceived,
                    framesDecoded: report.framesDecoded,
                    packetsLost: report.packetsLost
                });
            }
        });
    }
}

    async restartIce() {
        if (this.peerConnection && this.currentRoom) {
            console.log('Restarting ICE connection...');
            try {
                const offer = await this.peerConnection.createOffer({ 
                    iceRestart: true,
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await this.peerConnection.setLocalDescription(offer);
                
                this.socket.emit('offer', {
                    roomId: this.currentRoom,
                    offer: offer
                });
                
                this.updateStatus('Attempting to restore connection...');
            } catch (error) {
                console.error('Error restarting ICE:', error);
                throw error;
            }
        }
    }

    handleConnectionFailure() {
        console.log('Handling connection failure...');
        this.updateStatus('Connection failed. Finding new partner...');
        
        setTimeout(() => {
            if (this.currentRoom && this.peerConnection.connectionState === 'failed') {
                this.resetChat();
                this.socket.emit('find-match', { timestamp: Date.now() });
            }
        }, 2000);
    }

    async createOffer() {
        if (!this.peerConnection) {
            console.error('No peer connection available');
            return;
        }
        
        try {
            console.log('Creating offer...');
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await this.peerConnection.setLocalDescription(offer);
            console.log('Local description set, sending offer');
            
            this.socket.emit('offer', {
                roomId: this.currentRoom,
                offer: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
            this.updateStatus('Error creating connection');
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) {
            console.error('No peer connection available for offer');
            return;
        }
        
        try {
            console.log('Handling offer...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer');
            this.socket.emit('answer', {
                roomId: this.currentRoom,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
            this.updateStatus('Error establishing connection');
        }
    }

    async handleAnswer(answer) {
        if (!this.peerConnection) {
            console.error('No peer connection available for answer');
            return;
        }
        
        try {
            console.log('Handling answer...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
            this.updateStatus('Error completing connection');
        }
    }

    async handleIceCandidate(candidate) {
        if (!this.peerConnection) {
            console.error('No peer connection available for ICE candidate');
            return;
        }
        
        try {
            console.log('Adding ICE candidate');
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoEnabled = videoTrack.enabled;
                
                // Update all video tracks (original and cloned ones in peer connection)
                if (this.peerConnection) {
                    const senders = this.peerConnection.getSenders();
                    senders.forEach(sender => {
                        if (sender.track && sender.track.kind === 'video') {
                            sender.track.enabled = this.isVideoEnabled;
                        }
                    });
                }
                
                this.toggleVideoBtn.classList.toggle('video-off', !this.isVideoEnabled);
                this.updateStatus(this.isVideoEnabled ? 'Video enabled' : 'Video disabled');
                
                // Notify partner about video toggle
                if (this.currentRoom) {
                    this.socket.emit('media-toggle', {
                        roomId: this.currentRoom,
                        type: 'video',
                        enabled: this.isVideoEnabled
                    });
                }
                
                console.log('Video toggled:', this.isVideoEnabled);
                this.debugMediaStates(); // Debug the media state
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioEnabled = audioTrack.enabled;
                
                // Update all audio tracks (original and cloned ones in peer connection)
                if (this.peerConnection) {
                    const senders = this.peerConnection.getSenders();
                    senders.forEach(sender => {
                        if (sender.track && sender.track.kind === 'audio') {
                            sender.track.enabled = this.isAudioEnabled;
                        }
                    });
                }
                
                this.toggleAudioBtn.classList.toggle('audio-off', !this.isAudioEnabled);
                this.updateStatus(this.isAudioEnabled ? 'Audio enabled' : 'Audio muted');
                
                // Notify partner about audio toggle
                if (this.currentRoom) {
                    this.socket.emit('media-toggle', {
                        roomId: this.currentRoom,
                        type: 'audio',
                        enabled: this.isAudioEnabled
                    });
                }
                
                console.log('Audio toggled:', this.isAudioEnabled);
                this.debugMediaStates(); // Debug the media state
            }
        }
    }

    handlePartnerMediaToggle(data) {
        console.log('Handling partner media toggle:', data);
        
        if (data.type === 'video') {
            // Update UI to show partner's video status
            if (data.enabled) {
                this.updateStatus('Partner enabled video');
                this.partnerVideoStatus.classList.add('hidden');
            } else {
                this.updateStatus('Partner disabled video');
                this.partnerVideoStatus.classList.remove('hidden');
            }
        } else if (data.type === 'audio') {
            // Update UI to show partner's audio status
            if (data.enabled) {
                this.updateStatus('Partner unmuted');
                this.partnerAudioStatus.classList.add('hidden');
            } else {
                this.updateStatus('Partner muted');
                this.partnerAudioStatus.classList.remove('hidden');
            }
        }
    }

    nextChat() {
        console.log('Looking for next chat partner...');
        this.updateStatus('Looking for a new partner...');
        this.resetChat();
        
        setTimeout(() => {
            this.socket.emit('find-match', { timestamp: Date.now() });
        }, 500);
    }

    endChat() {
        console.log('Ending chat...');
        this.updateStatus('Chat ended');
        this.resetToStart();
    }

    cancelWaiting() {
        console.log('Cancelling waiting...');
        this.socket.emit('leave-room');
        this.resetToStart();
    }

    resetToStart() {
        this.cleanup();
        this.showScreen('start');
        this.updateStatus('Ready to connect');
    }

resetChat() {
    console.log('Resetting chat for room:', this.currentRoom);
    
    this.connectionState = 'resetting';
    
    // Close peer connection properly
    if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
    }
    
    // Clean up remote stream
    if (this.remoteStream) {
        this.remoteStream.getTracks().forEach(track => track.stop());
        this.remoteStream = null;
    }
    
    // Clear remote video
    this.remoteVideo.srcObject = null;
    
    // Reset room and state
    const oldRoom = this.currentRoom;
    this.currentRoom = null;
    this.connectionState = 'idle';
    
    // Clear chat
    this.clearMessages();
    this.closeChatPanel();
    
    // Reset button states
    this.toggleVideoBtn.classList.remove('video-off');
    this.toggleAudioBtn.classList.remove('audio-off');
    
    // Reset partner status indicators
    if (this.partnerVideoStatus) this.partnerVideoStatus.classList.add('hidden');
    if (this.partnerAudioStatus) this.partnerAudioStatus.classList.add('hidden');
    
    // Set up new peer connection if local stream exists
    if (this.localStream && this.currentRoom) {
        this.setupPeerConnection();
    }
    
    // Emit leave room for the old room
    this.socket.emit('leave-room', { roomId: oldRoom });
    
    console.log('Chat reset complete');
}


    cleanup() {
        console.log('Cleaning up...');
        
            if (this.mediaCheckInterval) {
        clearInterval(this.mediaCheckInterval);
        this.mediaCheckInterval = null;
    }

        if (this.iceReconnectTimeout) {
            clearTimeout(this.iceReconnectTimeout);
            this.iceReconnectTimeout = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;
        
        this.currentRoom = null;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        
        this.clearMessages();
        this.closeChatPanel();
        
        this.toggleVideoBtn.classList.remove('video-off');
        this.toggleAudioBtn.classList.remove('audio-off');
        
        this.socket.emit('leave-room');
    }

    toggleChatPanel() {
        this.chatPanel.classList.toggle('open');
        console.log('Chat panel toggled');
    }

    closeChatPanel() {
        this.chatPanel.classList.remove('open');
        console.log('Chat panel closed');
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (message && this.currentRoom) {
            console.log('Sending message:', message);
            
            this.socket.emit('chat-message', {
                roomId: this.currentRoom,
                message: message
            });
            
            this.displayMessage(message, 'sent');
            this.chatInput.value = '';
        }
    }

    displayMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        const timestamp = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        messageDiv.setAttribute('data-time', timestamp);
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        console.log('Message displayed:', type, message);
    }

    clearMessages() {
        this.chatMessages.innerHTML = '';
        console.log('Messages cleared');
    }

    showScreen(screenName) {
        console.log('Showing screen:', screenName);
        
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        } else {
            console.error('Screen not found:', screenName);
        }
    }

    updateStatus(message) {
        this.statusText.textContent = message;
        console.log('Status updated:', message);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing VideoChat...');
    
    if (!window.RTCPeerConnection) {
        alert('Your browser does not support WebRTC. Please use a modern browser like Chrome, Firefox, or Safari.');
        return;
    }
    
    if (typeof io === 'undefined') {
        console.error('Socket.io not loaded');
        alert('Socket.io library not loaded. Please check your internet connection.');
        return;
    }
    
    try {
        window.videoChat = new VideoChat();
        console.log('VideoChat application started successfully');
        
    } catch (error) {
        console.error('Error initializing VideoChat:', error);
        alert('Error starting the application. Please refresh the page.');
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.videoChat) {
        window.videoChat.cleanup();
    }
});

// Handle visibility change (tab switching)
document.addEventListener('visibilitychange', () => {
    if (window.videoChat) {
        console.log('Visibility changed:', document.hidden ? 'hidden' : 'visible');
    }
});

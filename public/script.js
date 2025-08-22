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
        this.isRematchingInPlace = false; // Track if we're skipping and rematching in-place
        this.rematchTimeoutId = null; // 3-minute timeout while waiting for next partner
        
        // User profile data
        this.userProfile = null;
        this.userIP = null;
        this.userCountry = null;
        
        // Skip history tracking
        this.skipHistory = new Map(); // Track recently skipped users
        this.skipHistoryTimeout = 5 * 60 * 1000; // 5 minutes timeout for skip history
        this.maxSkipHistorySize = 20; // Maximum number of users to remember
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.loadUserProfile();
        
        console.log('VideoChat initialized');
    }

    initializeElements() {
        // Screens
        this.profileScreen = document.getElementById('profile-screen');
        this.startScreen = document.getElementById('start-screen');
        this.waitingScreen = document.getElementById('waiting-screen');
        this.chatScreen = document.getElementById('chat-screen');
        
        // Profile form elements
        this.profileForm = document.getElementById('profile-form');
        this.userNameInput = document.getElementById('user-name');
        this.userGenderInput = document.getElementById('user-gender');
        this.genderPreferenceInput = document.getElementById('gender-preference');
        this.userCountryInput = document.getElementById('user-country');
        this.preferredCountriesInput = document.getElementById('preferred-countries');
        this.ipPermissionInput = document.getElementById('ip-permission');
        
        // Start screen elements
        this.userDisplayName = document.getElementById('user-display-name');
        this.countryFilter = document.getElementById('country-filter');
        this.editProfileBtn = document.getElementById('edit-profile-btn');
        
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
        
        // Looking for partner overlay
        this.lookingForPartner = document.getElementById('looking-for-partner');
        
        // Debug button
        this.debugMediaBtn = document.getElementById('debug-media-btn');
        
        console.log('Elements initialized');
    }

    setupEventListeners() {
        // Profile form submission
        this.profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUserProfile();
        });
        
        // Edit profile button
        this.editProfileBtn.addEventListener('click', () => {
            this.showProfileScreen();
        });
        
        // Country filter change
        this.countryFilter.addEventListener('change', () => {
            this.updateCountryFilter();
        });
        
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
        
        // Add skip history debug info
        console.log('Skip history info:', this.getSkipHistoryInfo());
        
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
            if (this.isRematchingInPlace) {
                // Stay on chat screen and show overlay instead of navigating away
                if (this.lookingForPartner) {
                    this.lookingForPartner.classList.remove('hidden');
                }
                this.updateStatus('Looking for a new partner...');
                this.startRematchTimeout();
            } else {
                this.showScreen('waiting');
                this.updateStatus('Looking for a chat partner...');
            }
        });

this.socket.on('match-found', async (data) => {
    console.log('Match found:', data);

    this.currentRoom = data.roomId;
    this.connectionState = 'matched';
    // Clear any in-place rematch timeout/state
    this.clearRematchTimeout();
    this.isRematchingInPlace = false;
    
    // Hide "Looking for partner" overlay
    if (this.lookingForPartner) {
        this.lookingForPartner.classList.add('hidden');
    }
    
    // Ensure chat is cleared for new partner
    this.clearMessages();
    this.closeChatPanel();
    if (this.chatInput) {
        this.chatInput.value = '';
    }
    
    this.showScreen('chat');
    this.updateStatusWithSkipInfo('Connected! Setting up video...');

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
            
            // Check if we should auto-rematch (partner skipped us)
            // If we're already in rematch mode, continue; otherwise start auto-rematch
            if (!this.isRematchingInPlace) {
                this.isRematchingInPlace = true;
                this.resetChatForNextPartner();
                
                // Prepare user data for matching
                const userData = {
                    timestamp: Date.now(),
                    profile: this.userProfile,
                    country: this.userCountry || this.userProfile?.country,
                    gender: this.userProfile?.gender,
                    genderPreference: this.userProfile?.genderPreference,
                    preferredCountries: this.userProfile?.preferredCountries || ['any'],
                    countryFilter: this.userProfile?.countryFilter || 'any'
                };
                
                setTimeout(() => {
                    this.socket.emit('find-match', userData);
                }, 500);
            } else {
                // Already in rematch mode, just reset chat normally
                this.resetChat();
            }
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
            
            // Detect device type and set appropriate constraints
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isTablet = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/i.test(navigator.userAgent);
            
            console.log('Device detected:', { isMobile, isTablet });
            
            // Standardized video constraints for consistent dimensions across all devices
            let constraints;
            
            if (isMobile) {
                // Mobile-specific constraints for consistent dimensions
                constraints = {
                    video: {
                        width: { ideal: 480, min: 320, max: 640 },
                        height: { ideal: 360, min: 240, max: 480 },
                        aspectRatio: { ideal: 4/3, min: 1.33, max: 1.78 },
                        facingMode: 'user',
                        frameRate: { ideal: 30, min: 15, max: 30 }
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
            } else if (isTablet) {
                // Tablet-specific constraints
                constraints = {
                    video: {
                        width: { ideal: 640, min: 480, max: 960 },
                        height: { ideal: 480, min: 360, max: 720 },
                        aspectRatio: { ideal: 4/3, min: 1.33, max: 1.78 },
                        facingMode: 'user',
                        frameRate: { ideal: 30, min: 15, max: 30 }
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
            } else {
                // Desktop constraints
                constraints = {
                    video: {
                        width: { ideal: 640, min: 480, max: 1280 },
                        height: { ideal: 480, min: 360, max: 720 },
                        aspectRatio: { ideal: 4/3, min: 1.33, max: 1.78 },
                        facingMode: 'user',
                        frameRate: { ideal: 30, min: 15, max: 30 }
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
            }
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Got local stream');
            
            this.localVideo.srcObject = this.localStream;
            
            this.localVideo.play().catch(e => {
                console.log('Local video autoplay prevented:', e);
            });

            this.localVideo.onloadedmetadata = () => {
                console.log('Local video metadata loaded');
                console.log('Local video dimensions:', this.localVideo.videoWidth, 'x', this.localVideo.videoHeight);
                
                // Normalize video dimensions for consistent display
                this.normalizeVideoDimensions(this.localVideo);
            };
            
            await this.setupPeerConnection();
            
            // Prepare user data for matching
            const userData = {
                timestamp: Date.now(),
                profile: this.userProfile,
                country: this.userCountry || this.userProfile?.country,
                gender: this.userProfile?.gender,
                genderPreference: this.userProfile?.genderPreference,
                preferredCountries: this.userProfile?.preferredCountries || ['any'],
                countryFilter: this.userProfile?.countryFilter || 'any'
            };
            
            console.log('Emitting find-match with user data:', userData);
            this.socket.emit('find-match', userData);
            
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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Free TURN servers (you may need to get your own)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
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

    // Add local stream tracks to peer connection
    if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
            console.log(`Adding ${track.kind} track to peer connection for room:`, this.currentRoom);
            this.peerConnection.addTrack(track, this.localStream);
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
        
        // Hide "Looking for partner" overlay when remote video starts
        if (this.lookingForPartner) {
            this.lookingForPartner.classList.add('hidden');
        }
        
        // Force video to play
        this.remoteVideo.muted = false;
        this.remoteVideo.play().catch(e => {
            console.log('Remote video autoplay prevented:', e);
        });
        
        this.remoteVideo.onloadedmetadata = () => {
            console.log('Remote video loaded for room:', this.currentRoom);
            console.log('Remote video dimensions:', this.remoteVideo.videoWidth, 'x', this.remoteVideo.videoHeight);
            
            // Normalize remote video dimensions for consistent display
            this.normalizeVideoDimensions(this.remoteVideo);
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

    // Add ICE connection state monitoring
    this.peerConnection.oniceconnectionstatechange = () => {
        const iceState = this.peerConnection.iceConnectionState;
        console.log(`ICE connection state: ${iceState} for room:`, this.currentRoom);
        
        if (iceState === 'failed') {
            console.log('ICE connection failed, attempting restart...');
            this.handleIceFailure();
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
                
                // Update video track in peer connection
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
                
                // Update audio track in peer connection
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
        this.updateStatusWithSkipInfo('Looking for a new partner...');
        
        // Add current partner to skip history if we have a room
        if (this.currentRoom) {
            // Extract partner ID from room ID (format: room_<myId>_<partnerId> or room_<partnerId>_<myId>)
            const roomParts = this.currentRoom.split('_');
            if (roomParts.length === 3) {
                const myId = this.socket.id;
                const partnerId = roomParts[1] === myId ? roomParts[2] : roomParts[1];
                this.addToSkipHistory(partnerId);
                console.log(`Added partner ${partnerId} to skip history`);
            }
        }
        
        // Immediately clear chat before any other operations
        this.clearMessagesWithNotification();
        this.closeChatPanel();
        if (this.chatInput) {
            this.chatInput.value = '';
        }
        if (this.chatPanel) {
            this.chatPanel.classList.remove('open');
        }
        
        // Reset chat but keep local stream and stay on chat screen
        this.resetChatForNextPartner();
        this.isRematchingInPlace = true;
        
        // Stay on chat screen but show "looking for partner" status
        // Don't change screens - keep user on video chat screen like Omegle
        
        // Prepare user data for matching
        const userData = {
            timestamp: Date.now(),
            profile: this.userProfile,
            country: this.userCountry || this.userProfile?.country,
            gender: this.userProfile?.gender,
            genderPreference: this.userProfile?.genderPreference,
            preferredCountries: this.userProfile?.preferredCountries || ['any'],
            countryFilter: this.userProfile?.countryFilter || 'any'
        };
        
        setTimeout(() => {
            this.socket.emit('find-match', userData);
        }, 500);
    }

    endChat() {
        console.log('Ending chat...');
        this.updateStatus('Chat ended');
        this.clearRematchTimeout();
        this.isRematchingInPlace = false;
        
        // Hide "Looking for partner" overlay if it's showing
        if (this.lookingForPartner) {
            this.lookingForPartner.classList.add('hidden');
        }
        
        this.resetToStart();
    }

    cancelWaiting() {
        console.log('Cancelling waiting...');
        this.socket.emit('leave-room');
        this.clearRematchTimeout();
        this.isRematchingInPlace = false;
        this.resetToStart();
    }

    resetToStart() {
        this.clearRematchTimeout();
        this.isRematchingInPlace = false;
        this.cleanup();
        this.showScreen('start');
        this.updateStatus('Ready to connect');
    }

    resetChat() {
        console.log('Resetting chat for room:', this.currentRoom);
        
        this.connectionState = 'resetting';
        this.clearRematchTimeout();
        this.isRematchingInPlace = false;
        
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
        
        // Emit leave room for the old room (regular disconnect, not skip)
        this.socket.emit('leave-room', { roomId: oldRoom });
        
        console.log('Chat reset complete');
    }

    resetChatForNextPartner() {
        console.log('Resetting chat for next partner...');
        
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
        
        // Clear remote video but keep local video visible
        this.remoteVideo.srcObject = null;
        
        // Reset room and state
        const oldRoom = this.currentRoom;
        this.currentRoom = null;
        this.connectionState = 'idle';
        
        // Clear chat completely with a small delay to ensure proper timing
        setTimeout(() => {
            console.log('Clearing chat for new partner...');
            this.clearMessages();
            this.closeChatPanel();
            
            // Additional safety: ensure chat input is cleared and panel is closed
            if (this.chatInput) {
                this.chatInput.value = '';
                console.log('Chat input cleared');
            }
            if (this.chatPanel) {
                this.chatPanel.classList.remove('open');
                console.log('Chat panel closed');
            }
        }, 100);
        
        // Reset button states
        this.toggleVideoBtn.classList.remove('video-off');
        this.toggleAudioBtn.classList.remove('audio-off');
        
        // Reset partner status indicators
        if (this.partnerVideoStatus) this.partnerVideoStatus.classList.add('hidden');
        if (this.partnerAudioStatus) this.partnerAudioStatus.classList.add('hidden');
        
        // Show "Looking for partner" overlay
        if (this.lookingForPartner) {
            this.lookingForPartner.classList.remove('hidden');
        }
        
        // Emit leave room for the old room with skip flag
        this.socket.emit('leave-room', { roomId: oldRoom, isSkip: true });
        
        // Keep user on chat screen - don't change screens
        // This mimics Omegle behavior where you stay on video screen
        
        console.log('Chat reset for next partner complete - staying on chat screen');
    }

    startRematchTimeout() {
        // If already timing, reset the timer
        this.clearRematchTimeout();
        // 3 minutes = 180000 ms
        this.rematchTimeoutId = setTimeout(() => {
            this.handleRematchTimeout();
        }, 180000);
        console.log('Rematch timeout started (3 minutes)');
    }

    clearRematchTimeout() {
        if (this.rematchTimeoutId) {
            clearTimeout(this.rematchTimeoutId);
            this.rematchTimeoutId = null;
            console.log('Rematch timeout cleared');
        }
    }

    handleRematchTimeout() {
        console.log('Rematch timeout reached - no partner found');
        this.updateStatus('No one is available right now. Redirecting to start...');
        try {
            alert('No one is available right now. Please try again later.');
        } catch (e) { /* ignore if alerts are blocked */ }
        this.isRematchingInPlace = false;
        this.resetToStart();
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
        // Ensure chat input is also cleared when closing panel
        if (this.chatInput) {
            this.chatInput.value = '';
        }
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
        // Also clear the chat input field
        if (this.chatInput) {
            this.chatInput.value = '';
        }
        console.log('Messages cleared');
    }
    
    clearMessagesWithNotification() {
        this.chatMessages.innerHTML = '';
        // Also clear the chat input field
        if (this.chatInput) {
            this.chatInput.value = '';
        }
        
        // Add a temporary notification that chat was cleared
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'message system-message';
        notificationDiv.textContent = 'Chat cleared for new partner';
        notificationDiv.style.textAlign = 'center';
        notificationDiv.style.color = '#888';
        notificationDiv.style.fontStyle = 'italic';
        notificationDiv.style.fontSize = '0.9rem';
        notificationDiv.style.padding = '0.5rem';
        notificationDiv.style.margin = '0.5rem 0';
        
        this.chatMessages.appendChild(notificationDiv);
        
        // Remove the notification after 3 seconds
        setTimeout(() => {
            if (notificationDiv.parentNode) {
                notificationDiv.parentNode.removeChild(notificationDiv);
            }
        }, 3000);
        
        console.log('Messages cleared with notification');
    }
    
    normalizeVideoDimensions(videoElement) {
        // Ensure consistent aspect ratio and dimensions across devices
        const targetAspectRatio = 4/3; // Standard aspect ratio
        const currentWidth = videoElement.videoWidth;
        const currentHeight = videoElement.videoHeight;
        const currentAspectRatio = currentWidth / currentHeight;
        
        console.log('Normalizing video dimensions:', {
            current: `${currentWidth}x${currentHeight}`,
            aspectRatio: currentAspectRatio.toFixed(2),
            targetAspectRatio: targetAspectRatio.toFixed(2)
        });
        
        // Set CSS properties to ensure consistent display
        videoElement.style.objectFit = 'cover';
        videoElement.style.objectPosition = 'center';
        
        // Add a class to the video container for consistent styling
        const videoContainer = videoElement.closest('.video-box');
        if (videoContainer) {
            videoContainer.classList.add('normalized-video');
        }
        
        // Handle mobile orientation changes
        this.handleMobileOrientation(videoElement);
    }
    
    handleMobileOrientation(videoElement) {
        // Check if device is mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // Listen for orientation changes
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    // Re-normalize video after orientation change
                    this.normalizeVideoDimensions(videoElement);
                }, 100);
            });
            
            // Also listen for resize events
            window.addEventListener('resize', () => {
                setTimeout(() => {
                    this.normalizeVideoDimensions(videoElement);
                }, 100);
            });
        }
    }
    
    // Skip history management methods
    addToSkipHistory(partnerId) {
        const now = Date.now();
        this.skipHistory.set(partnerId, now);
        
        // Clean up old entries
        this.cleanupSkipHistory();
        
        console.log(`Added ${partnerId} to skip history. Total skipped users: ${this.skipHistory.size}`);
    }
    
    isUserInSkipHistory(partnerId) {
        const skipTime = this.skipHistory.get(partnerId);
        if (!skipTime) return false;
        
        const now = Date.now();
        const timeSinceSkip = now - skipTime;
        
        // Check if enough time has passed (5 minutes)
        if (timeSinceSkip > this.skipHistoryTimeout) {
            this.skipHistory.delete(partnerId);
            return false;
        }
        
        return true;
    }
    
    cleanupSkipHistory() {
        const now = Date.now();
        const expiredUsers = [];
        
        // Find expired entries
        for (const [userId, skipTime] of this.skipHistory.entries()) {
            if (now - skipTime > this.skipHistoryTimeout) {
                expiredUsers.push(userId);
            }
        }
        
        // Remove expired entries
        expiredUsers.forEach(userId => {
            this.skipHistory.delete(userId);
        });
        
        // If still too many entries, remove oldest ones
        if (this.skipHistory.size > this.maxSkipHistorySize) {
            const entries = Array.from(this.skipHistory.entries());
            entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
            
            const toRemove = entries.slice(0, this.skipHistory.size - this.maxSkipHistorySize);
            toRemove.forEach(([userId]) => {
                this.skipHistory.delete(userId);
            });
        }
        
        if (expiredUsers.length > 0 || this.skipHistory.size > this.maxSkipHistorySize) {
            console.log(`Cleaned up skip history. Removed ${expiredUsers.length} expired entries. Current size: ${this.skipHistory.size}`);
        }
    }
    
    getSkipHistoryInfo() {
        const now = Date.now();
        const activeSkips = [];
        
        for (const [userId, skipTime] of this.skipHistory.entries()) {
            const timeRemaining = Math.max(0, this.skipHistoryTimeout - (now - skipTime));
            if (timeRemaining > 0) {
                activeSkips.push({
                    userId,
                    timeRemaining: Math.ceil(timeRemaining / 1000) // Convert to seconds
                });
            }
        }
        
        return {
            totalSkipped: this.skipHistory.size,
            activeSkips: activeSkips.length,
            skipTimeout: Math.ceil(this.skipHistoryTimeout / 1000) // Convert to seconds
        };
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
    
    updateStatusWithSkipInfo(message) {
        const skipInfo = this.getSkipHistoryInfo();
        if (skipInfo.activeSkips > 0) {
            const skipMessage = ` | Skipped ${skipInfo.activeSkips} users (${skipInfo.skipTimeout}s timeout)`;
            this.statusText.textContent = message + skipMessage;
        } else {
            this.statusText.textContent = message;
        }
        console.log('Status updated with skip info:', message, skipInfo);
    }

    // Profile Management Methods
    async loadUserProfile() {
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            this.userProfile = JSON.parse(savedProfile);
            this.populateProfileForm();
            this.showStartScreen();
        } else {
            this.showProfileScreen();
        }
    }

    saveUserProfile() {
        const formData = new FormData(this.profileForm);
        
        this.userProfile = {
            name: formData.get('name'),
            gender: formData.get('gender'),
            genderPreference: formData.get('genderPreference'),
            country: formData.get('country'),
            preferredCountries: Array.from(this.preferredCountriesInput.selectedOptions).map(option => option.value),
            ipPermission: formData.get('ipPermission') === 'on'
        };
        
        // Save to localStorage
        localStorage.setItem('userProfile', JSON.stringify(this.userProfile));
        
        // Update display
        this.userDisplayName.textContent = this.userProfile.name || '';
        
        // Get user's IP and country if permission granted
        if (this.userProfile.ipPermission) {
            this.getUserIPAndCountry();
        }
        
        this.showStartScreen();
        console.log('Profile saved:', this.userProfile);
    }

    populateProfileForm() {
        if (this.userProfile) {
            this.userNameInput.value = this.userProfile.name || '';
            this.userGenderInput.value = this.userProfile.gender || '';
            this.genderPreferenceInput.value = this.userProfile.genderPreference || '';
            this.userCountryInput.value = this.userProfile.country || '';
            
            // Clear previous selections
            Array.from(this.preferredCountriesInput.options).forEach(option => {
                option.selected = false;
            });
            
            // Set preferred countries
            if (this.userProfile.preferredCountries) {
                this.userProfile.preferredCountries.forEach(country => {
                    const option = this.preferredCountriesInput.querySelector(`option[value="${country}"]`);
                    if (option) option.selected = true;
                });
            }
            
            this.ipPermissionInput.checked = this.userProfile.ipPermission || false;
            
            // Update display name
            this.userDisplayName.textContent = this.userProfile.name || 'User';
            
            // Set country filter
            if (this.userProfile.countryFilter) {
                this.countryFilter.value = this.userProfile.countryFilter;
            }
            
            // Show country detected if IP permission was granted
            if (this.userProfile.ipPermission && this.userProfile.country) {
                const countryDetected = document.getElementById('country-detected');
                const detectedCountry = document.getElementById('detected-country');
                if (countryDetected && detectedCountry) {
                    countryDetected.style.display = 'block';
                    const countryNames = {
                        'us': 'United States', 'gb': 'United Kingdom', 'ca': 'Canada', 'au': 'Australia',
                        'de': 'Germany', 'fr': 'France', 'in': 'India', 'jp': 'Japan', 'br': 'Brazil',
                        'mx': 'Mexico', 'ru': 'Russia', 'cn': 'China', 'kr': 'South Korea', 'it': 'Italy',
                        'es': 'Spain', 'nl': 'Netherlands', 'se': 'Sweden', 'no': 'Norway', 'dk': 'Denmark',
                        'fi': 'Finland', 'ch': 'Switzerland', 'at': 'Austria', 'be': 'Belgium', 'pt': 'Portugal',
                        'gr': 'Greece', 'pl': 'Poland', 'cz': 'Czech Republic', 'hu': 'Hungary', 'ro': 'Romania',
                        'bg': 'Bulgaria', 'hr': 'Croatia', 'si': 'Slovenia', 'sk': 'Slovakia', 'ee': 'Estonia',
                        'lv': 'Latvia', 'lt': 'Lithuania', 'ie': 'Ireland', 'is': 'Iceland', 'mt': 'Malta',
                        'cy': 'Cyprus', 'lu': 'Luxembourg', 'mc': 'Monaco', 'li': 'Liechtenstein', 'sm': 'San Marino',
                        'va': 'Vatican City', 'ad': 'Andorra'
                    };
                    const countryName = countryNames[this.userProfile.country] || this.userProfile.country.toUpperCase();
                    detectedCountry.textContent = countryName;
                }
            }
        }
    }

    async getUserIPAndCountry() {
        try {
            // Show loading state
            const countryDetected = document.getElementById('country-detected');
            const detectedCountry = document.getElementById('detected-country');
            countryDetected.style.display = 'block';
            detectedCountry.textContent = 'Detecting...';
            
            // Get IP address
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            this.userIP = ipData.ip;
            
            // Get country from IP
            const geoResponse = await fetch(`https://ipapi.co/${this.userIP}/json/`);
            const geoData = await geoResponse.json();
            this.userCountry = geoData.country_code?.toLowerCase();
            
            console.log('User IP and country detected:', { ip: this.userIP, country: this.userCountry });
            
            // Update user profile with detected country if not manually set
            if (this.userCountry && !this.userProfile.country) {
                this.userProfile.country = this.userCountry;
                this.userCountryInput.value = this.userCountry;
                localStorage.setItem('userProfile', JSON.stringify(this.userProfile));
            }
            
            // Update the display
            if (this.userCountry) {
                const countryNames = {
                    'us': 'United States', 'gb': 'United Kingdom', 'ca': 'Canada', 'au': 'Australia',
                    'de': 'Germany', 'fr': 'France', 'in': 'India', 'jp': 'Japan', 'br': 'Brazil',
                    'mx': 'Mexico', 'ru': 'Russia', 'cn': 'China', 'kr': 'South Korea', 'it': 'Italy',
                    'es': 'Spain', 'nl': 'Netherlands', 'se': 'Sweden', 'no': 'Norway', 'dk': 'Denmark',
                    'fi': 'Finland', 'ch': 'Switzerland', 'at': 'Austria', 'be': 'Belgium', 'pt': 'Portugal',
                    'gr': 'Greece', 'pl': 'Poland', 'cz': 'Czech Republic', 'hu': 'Hungary', 'ro': 'Romania',
                    'bg': 'Bulgaria', 'hr': 'Croatia', 'si': 'Slovenia', 'sk': 'Slovakia', 'ee': 'Estonia',
                    'lv': 'Latvia', 'lt': 'Lithuania', 'ie': 'Ireland', 'is': 'Iceland', 'mt': 'Malta',
                    'cy': 'Cyprus', 'lu': 'Luxembourg', 'mc': 'Monaco', 'li': 'Liechtenstein', 'sm': 'San Marino',
                    'va': 'Vatican City', 'ad': 'Andorra'
                };
                
                const countryName = countryNames[this.userCountry] || this.userCountry.toUpperCase();
                detectedCountry.textContent = countryName;
            } else {
                detectedCountry.textContent = 'Could not detect';
            }
            
        } catch (error) {
            console.error('Error getting IP/Country:', error);
            const detectedCountry = document.getElementById('detected-country');
            detectedCountry.textContent = 'Error detecting';
        }
    }

    updateCountryFilter() {
        const selectedCountry = this.countryFilter.value;
        console.log('Country filter updated:', selectedCountry);
        
        // Store the preference
        if (this.userProfile) {
            this.userProfile.countryFilter = selectedCountry;
            localStorage.setItem('userProfile', JSON.stringify(this.userProfile));
        }
    }

    showProfileScreen() {
        this.showScreen('profile');
    }

    showStartScreen() {
        this.showScreen('start');
    }
}

// Initialize the app when the page loads
function initVideoChat() {
    console.log('Initializing VideoChat...');
    
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
}

// Make initVideoChat available globally for fallback
window.initVideoChat = initVideoChat;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking Socket.io availability...');
    
    // If Socket.io is already loaded, initialize immediately
    if (typeof io !== 'undefined') {
        initVideoChat();
    }
    // Otherwise, the fallback script will call initVideoChat when it loads
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

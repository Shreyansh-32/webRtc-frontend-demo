"use client";
import React, { useState, useRef, useEffect } from 'react';

// STUN server configuration remains the same
const configuration: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Define a type for our WebSocket messages for better type safety
interface WebSocketMessage {
    type: 'peer_joined' | 'offer' | 'answer' | 'candidate' | 'peer_left' | 'error';
    payload?: {
        id?: string;
        sdp?: RTCSessionDescriptionInit['sdp'];
        candidate?: RTCIceCandidateInit | RTCIceCandidate;
        message?: string;
    };
}

export default function Home() {
    // State variables with explicit types
    const [roomId, setRoomId] = useState<string>('');
    const [inCall, setInCall] = useState<boolean>(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    // Refs with explicit types for DOM elements and browser APIs
    const ws = useRef<WebSocket | null>(null);
    const pc = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    // Effect to attach streams to video elements
    useEffect(() => {
        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteStream && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Cleanup effect
    useEffect(() => {
        return () => {
            ws.current?.close();
            pc.current?.close();
        };
    }, []);

    const sendMessage = (type: string, payload: object) => {
        // Null check to satisfy TypeScript
        if (ws.current) {
            ws.current.send(JSON.stringify({ type, payload }));
        }
    };

    const createPeerConnection = (currentRoomId: string) => {
        pc.current?.close(); // Close any existing connection
        
        pc.current = new RTCPeerConnection(configuration);

        pc.current.onicecandidate = (event) => {
            if (event.candidate) {
                sendMessage('candidate', { id: currentRoomId, candidate: event.candidate });
            }
        };

        pc.current.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        if (localStream) {
            localStream.getTracks().forEach(track => {
                if (pc.current) { // Null check
                    pc.current.addTrack(track, localStream);
                }
            });
        }
    };

    const handleJoinRoom = async () => {
        if (!roomId) {
            alert('Please enter a Room ID.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            setInCall(true);

            ws.current = new WebSocket('wss://webrtc-backend-demo.onrender.com');

            ws.current.onopen = () => {
                console.log("Connected to signaling server");
                sendMessage('join_room', { id: roomId });
            };

            ws.current.onmessage = (message) => {
                const data = JSON.parse(message.data) as WebSocketMessage;
                console.log("Received message:", data.type);

                switch (data.type) {
                    case 'peer_joined': createOffer(roomId); break;
                    case 'offer': if (data.payload?.sdp) handleOffer(data.payload.sdp, roomId); break;
                    case 'answer': if (data.payload?.sdp) handleAnswer(data.payload.sdp); break;
                    case 'candidate': if (data.payload?.candidate) handleCandidate(data.payload.candidate); break;
                    case 'peer_left': handlePeerLeft(); break;
                    case 'error':
                        if (data.payload?.message) alert(data.payload.message);
                        handleHangUp();
                        break;
                }
            };
        } catch (error) {
            console.error("Error accessing media devices.", error);
        }
    };

    // --- WebRTC Handlers with Typed Parameters ---

    const createOffer = async (currentRoomId: string) => {
        console.log("Creating offer...");
        createPeerConnection(currentRoomId);
        if (!pc.current) return; // Guard clause
        try {
            const offer = await pc.current.createOffer();
            await pc.current.setLocalDescription(offer);
            sendMessage('offer', { id: currentRoomId, sdp: pc.current.localDescription });
        } catch (error) {
            console.error("Error creating offer:", error);
        }
    };

    const handleOffer = async (sdp: RTCSessionDescriptionInit['sdp'], currentRoomId: string) => {
        console.log("Handling offer...");
        createPeerConnection(currentRoomId);
        if (!pc.current) return; // Guard clause
        try {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            sendMessage('answer', { id: currentRoomId, sdp: pc.current.localDescription });
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    };

    const handleAnswer = async (sdp: RTCSessionDescriptionInit['sdp']) => {
        console.log("Handling answer...");
        if (!pc.current) return; // Guard clause
        try {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    };
    
    const handleCandidate = async (candidate: RTCIceCandidateInit | RTCIceCandidate) => {
        if (!pc.current) return; // Guard clause
        try {
            await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error("Error adding received ice candidate", error);
        }
    };
    
    const handlePeerLeft = () => {
        alert("The other user has left the room.");
        handleHangUp();
    };

    const handleHangUp = () => {
        localStream?.getTracks().forEach(track => track.stop());
        ws.current?.close();
        pc.current?.close();
        setInCall(false);
        setLocalStream(null);
        setRemoteStream(null);
        setRoomId('');
    };

    // The JSX remains the same
    return (
        <main className="flex flex-col items-center p-4 md:p-8 bg-slate-100 min-h-screen text-slate-800">
            <h1 className="text-4xl font-bold mb-6">WebRTC Video Call 📞</h1>
            
            {!inCall ? (
                <div className="flex items-center gap-4 mb-8">
                    <input
                        type="text"
                        placeholder="Enter Room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button onClick={handleJoinRoom} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors">
                        Join Room
                    </button>
                </div>
            ) : (
                <button onClick={handleHangUp} className="mb-8 px-6 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 transition-colors">
                    Hang Up
                </button>
            )}

            <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl">
                <div className="flex-1 bg-black rounded-lg overflow-hidden shadow-lg relative min-h-[400px]">
                    <h2 className="absolute top-2 left-2 text-white bg-black/50 px-2 py-1 rounded-md text-sm z-10">
                        You
                    </h2>
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                </div>
                
                <div className="flex-1 bg-black rounded-lg overflow-hidden shadow-lg relative min-h-[400px]">
                    <h2 className="absolute top-2 left-2 text-white bg-black/50 px-2 py-1 rounded-md text-sm z-10">
                        Remote Peer
                    </h2>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                </div>
            </div>
        </main>
    );
}

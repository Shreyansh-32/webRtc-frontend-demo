import React, { useState, useRef, useEffect } from 'react';

// Define the structure of messages for signaling with specific payload types
type OfferMessage = { type: 'offer'; payload: RTCSessionDescriptionInit };
type AnswerMessage = { type: 'answer'; payload: RTCSessionDescriptionInit };
type CandidateMessage = { type: 'candidate'; payload: RTCIceCandidateInit };
type SignalingMessage = OfferMessage | AnswerMessage | CandidateMessage;

const App: React.FC = () => {
  // Refs for video elements and the peer connection
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  // State to manage UI elements
  const [isCallActive, setIsCallActive] = useState(false);

  // Google's public STUN servers
  const stunServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Effect to initialize WebSocket connection
  useEffect(() => {
    // Connect to the signaling server
    // Replace 'ws://localhost:8080' with your server's address
    const ws = new WebSocket('https://webrtc-backend-demo-4.onrender.com');
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established.');
    };

    ws.onmessage = async (message: MessageEvent) => {
      // Parse the incoming message data
      const raw = message.data as string;
      const data = JSON.parse(raw) as SignalingMessage;
      console.log('Received signaling message:', data);

      // Ensure peer connection is initialized, especially for the callee
      if (!peerConnectionRef.current && data.type !== 'offer') {
        console.log('Received signal before peer connection was created. Ignoring.');
        return;
      }

      if (!peerConnectionRef.current && data.type === 'offer') {
        await createPeerConnection();
      }

      const pc = peerConnectionRef.current!;

      switch (data.type) {
        case 'offer':
          // Received an offer from the other peer
          await pc.setRemoteDescription(data.payload as RTCSessionDescriptionInit);
          {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendMessage({ type: 'answer', payload: answer });
          }
          break;
        case 'answer':
          // Received an answer from the other peer
          await pc.setRemoteDescription(data.payload as RTCSessionDescriptionInit);
          break;
        case 'candidate':
          // Received an ICE candidate from the other peer
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.payload as RTCIceCandidateInit));
          } catch (e) {
            console.error('Error adding received ice candidate', e);
          }
          break;
        default:
          // This case handles any message types that are not 'offer', 'answer', or 'candidate'
          console.warn('Unknown message type received:', data);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed.');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Cleanup on component unmount
    return () => {
      ws.close();
      peerConnectionRef.current?.close();
    };
  }, []);

  // Function to send messages through the WebSocket
  const sendMessage = (message: SignalingMessage) => {
    if (webSocketRef.current?.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Cannot send message.');
    }
  };

  // Function to create and configure the RTCPeerConnection
  const createPeerConnection = async () => {
    if (peerConnectionRef.current) return;

    const pc = new RTCPeerConnection(stunServers);
    peerConnectionRef.current = pc;

    // Event handler for when a new ICE candidate is created
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // event.candidate.toJSON() is RTCIceCandidateInit
        sendMessage({ type: 'candidate', payload: event.candidate.toJSON() as RTCIceCandidateInit });
      }
    };

    // Event handler for when the remote stream is added
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Get local media stream and add it to the peer connection
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch (error) {
      console.error('Error accessing media devices.', error);
    }
  };

  // Function to start the call (caller side)
  const startCall = async () => {
    setIsCallActive(true);
    await createPeerConnection();
    const pc = peerConnectionRef.current!;

    // Create an offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send the offer to the other peer via the signaling server
    sendMessage({ type: 'offer', payload: offer });
  };

  // Function to hang up the call
  const hangUp = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsCallActive(false);
    console.log('Call ended.');
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans p-4">
      <h1 className="text-4xl font-bold mb-6">WebRTC Video Call</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
        <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
          <h2 className="text-2xl mb-2 text-center">Local Video</h2>
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded-md" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
          <h2 className="text-2xl mb-2 text-center">Remote Video</h2>
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-md" />
        </div>
      </div>
      <div className="mt-8 flex space-x-4">
        {!isCallActive ? (
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300"
          >
            Start Call
          </button>
        ) : (
          <button
            onClick={hangUp}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300"
          >
            Hang Up
          </button>
        )}
      </div>
    </div>
  );
};

export default App;

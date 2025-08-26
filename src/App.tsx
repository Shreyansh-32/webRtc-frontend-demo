import { useEffect, useRef, useState } from "react";
import { useSocket } from "./socket/useSocket";

async function createOffer(socket: WebSocket, peerConnection: RTCPeerConnection) {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({
      type: "offer",
      sdp: offer.sdp
    }));
  } catch (error) {
    console.error("Failed to create offer:", error);
  }
}

async function createAnswer(socket: WebSocket, peerConnection: RTCPeerConnection, offerSdp: string) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({
      type: "answer",
      sdp: answer.sdp
    }));
  } catch (error) {
    console.error("Failed to create answer:", error);
  }
}

function App() {
  const socket = useSocket();
  const peerConnection = useRef(new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }));

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);

  // FIX: Add a state to manage the setup process
  const [isSetup, setIsSetup] = useState(false);

  // This effect handles all WebRTC signaling once the socket is connected
  useEffect(() => {
    if (!socket || !isSetup) return;

    // Set up event handlers on the peer connection instance
    peerConnection.current.onicecandidate = event => {
      if (event.candidate && socket) {
        console.log("Sending ICE candidate");
        socket.send(JSON.stringify({
          type: "candidate",
          candidate: event.candidate
        }));
      }
    };

    peerConnection.current.ontrack = event => {
      console.log("Received remote track!");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setIsCallActive(true); // Show remote video when track is received
      }
    };

    // Handle messages from the signaling server
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message: ", message.type);

      if (message.type === "offer") {
        await createAnswer(socket, peerConnection.current, message.sdp);
      } else if (message.type === "answer") {
        const answer = message.sdp;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
      } else if (message.type === "candidate") {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch (error) {
          console.error("Error adding received ice candidate", error);
        }
      }
    };

  }, [socket, isSetup]); // Re-run when socket connects OR setup is initiated

  // Function to start the camera and WebRTC setup
  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add local tracks to the peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });
      
      setIsSetup(true); // Mark setup as complete
    } catch (error) {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };
  
  // Function to initiate the call
  const handleCall = () => {
    if (socket) {
      console.log("Creating offer...");
      createOffer(socket, peerConnection.current);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col items-center gap-6 p-4">
      <h2 className="text-4xl">WebRTC Demo</h2>
      <div className="flex gap-4">
        {/* FIX: Use a start button to ensure user interaction */}
        {!isSetup && <button onClick={handleStart} className="bg-green-600 p-3 rounded-lg text-xl">Start Camera</button>}
        {isSetup && <button onClick={handleCall} className="bg-blue-600 p-3 rounded-lg text-xl">Call</button>}
      </div>
      <div className="flex flex-wrap justify-center gap-4 w-full">
        <div className="flex flex-col items-center">
          <h3 className="text-xl mb-2">Your Video</h3>
          <video ref={localVideoRef} autoPlay playsInline className="w-full max-w-lg border-2 rounded-lg" muted></video>
        </div>
        {/* Only show the remote video container if a call is active */}
        {isCallActive && (
          <div className="flex flex-col items-center">
            <h3 className="text-xl mb-2">Remote Video</h3>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-w-lg border-2 rounded-lg"></video>
          </div>
        )}
      </div>
    </div>
  )
}

export default App;

import { useEffect, useRef, useState } from "react";
import { useSocket } from "./socket/useSocket";

// The helper functions (createOffer, createAnswer) remain unchanged.
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
    // Set the remote description BEFORE creating an answer.
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
  const [isSetup, setIsSetup] = useState(false);

  // FIX: Create a ref to hold an array for queued ICE candidates.
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (!socket || !isSetup) return;

    peerConnection.current.onicecandidate = event => {
      if (event.candidate && socket) {
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
        setIsCallActive(true);
      }
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message: ", message.type);

      if (message.type === "offer") {
        await createAnswer(socket, peerConnection.current, message.sdp);
        
        // FIX: After setting remote description in createAnswer, process any queued candidates.
        iceCandidateQueue.current.forEach(candidate => {
            peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        });
        iceCandidateQueue.current = []; // Clear the queue
      } else if (message.type === "answer") {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
        
        // FIX: After setting remote description, process any queued candidates.
        iceCandidateQueue.current.forEach(candidate => {
            peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        });
        iceCandidateQueue.current = []; // Clear the queue
      } else if (message.type === "candidate") {
        // FIX: Check if the remote description is set. If not, queue the candidate.
        if (peerConnection.current.remoteDescription) {
            try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
            } catch (error) {
                console.error("Error adding received ice candidate", error);
            }
        } else {
            console.log("Remote description not set. Queuing ICE candidate.");
            iceCandidateQueue.current.push(message.candidate);
        }
      }
    };

  }, [socket, isSetup]);

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });
      setIsSetup(true);
      if (socket) {
        // NOTE: The server logic you have is fine, but this client-side fix is the key.
        // For simplicity, I'm keeping the manual "Call" button logic here.
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };
  
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
        {!isSetup && <button onClick={handleStart} className="bg-green-600 p-3 rounded-lg text-xl">Start Camera</button>}
        {isSetup && <button onClick={handleCall} className="bg-blue-600 p-3 rounded-lg text-xl">Call</button>}
      </div>
      <div className="flex flex-wrap justify-center gap-4 w-full">
        <div className="flex flex-col items-center">
          <h3 className="text-xl mb-2">Your Video</h3>
          <video ref={localVideoRef} autoPlay playsInline className="w-full max-w-lg border-2 rounded-lg" muted></video>
        </div>
        {isCallActive && (
          <div className="flex flex-col items-center">
            <h3 className="text-xl mb-2">Remote Video</h3>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-w-lg border-2 rounded-lg"></video>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

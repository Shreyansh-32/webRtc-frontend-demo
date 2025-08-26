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
  const [isSetup, setIsSetup] = useState(false);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message: ", message.type);
      
      if (message.type === "offer") {
        await createAnswer(socket, peerConnection.current, message.sdp);
        
        iceCandidateQueue.current.forEach(candidate => {
          peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        });
        iceCandidateQueue.current = [];
      } else if (message.type === "answer") {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
        
        iceCandidateQueue.current.forEach(candidate => {
          peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        });
        iceCandidateQueue.current = [];
      } else if (message.type === "candidate") {
        if (peerConnection.current.remoteDescription) {
          try {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
          } catch (error) {
            console.error("Error adding received ice candidate", error);
          }
        } else {
          iceCandidateQueue.current.push(message.candidate);
        }
      }
    };
    
    return () => {
      socket.onmessage = null;
    }
  }, [socket]);

  useEffect(() => {
    if (!socket || !isSetup) return;

    peerConnection.current.onicecandidate = event => {
      if (event.candidate) {
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
  }, [socket, isSetup]);

   if(!socket)return;

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

      // Optional: First client can initiate an offer
      createOffer(socket, peerConnection.current);
    } catch (error) {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };
  
  return (
    <div>
      <h2>WebRTC Demo</h2>
      {!isSetup && <button onClick={handleStart}>Start Camera and Join</button>}
      <video ref={localVideoRef} autoPlay playsInline muted></video>
      {isCallActive && <video ref={remoteVideoRef} autoPlay playsInline></video>}
    </div>
  );
}

export default App;


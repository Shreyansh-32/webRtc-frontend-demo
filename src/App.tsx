import { useEffect, useRef, useState } from "react";
import { useSocket } from "./socket/useSocket";

// The createOffer and createAnswer helper functions remain the same.
// They are essential for the WebRTC handshake process.
async function createOffer(socket: WebSocket, peerConnection: RTCPeerConnection) {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Sending offer...");
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
    console.log("Sending answer...");
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
  // Use a ref to hold the RTCPeerConnection instance so it persists across renders.
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

  // This effect manages all the WebRTC signaling logic.
  // It runs once the socket is connected and the user has started their camera.
  useEffect(() => {
    if (!socket || !isSetup) return;

    // Fired when a new ICE candidate is discovered.
    peerConnection.current.onicecandidate = event => {
      if (event.candidate && socket) {
        console.log("Sending ICE candidate");
        socket.send(JSON.stringify({
          type: "candidate",
          candidate: event.candidate
        }));
      }
    };

    // Fired when a remote stream is added to the connection.
    peerConnection.current.ontrack = event => {
      console.log("Received remote track!");
      if (remoteVideoRef.current) {
        // Set the remote video element's source to the incoming stream.
        remoteVideoRef.current.srcObject = event.streams[0];
        setIsCallActive(true); // Update state to show the remote video player.
      }
    };

    // Handle incoming messages from the WebSocket signaling server.
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message: ", message.type);

      // FIX: New message type from the server to start the call automatically.
      if (message.type === 'initiate-call') {
          console.log("Server instructed to initiate call.");
          createOffer(socket, peerConnection.current);
      } else if (message.type === "offer") {
        // If we receive an offer, we create an answer.
        await createAnswer(socket, peerConnection.current, message.sdp);
      } else if (message.type === "answer") {
        // If we receive an answer, we set it as the remote description.
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
      } else if (message.type === "candidate") {
        // Add the received ICE candidate to our peer connection.
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch (error) {
          console.error("Error adding received ice candidate", error);
        }
      }
    };

  }, [socket, isSetup]); // This effect depends on the socket and setup state.

  // This function is called when the user clicks the "Start" button.
  const handleStart = async () => {
    try {
      // Get access to the user's camera and microphone.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add the local media tracks to the peer connection so they can be sent.
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });
      
      setIsSetup(true); // Mark the setup process as complete.
      
      // FIX: Once setup is complete, tell the server we are ready to connect.
      if (socket) {
        socket.send(JSON.stringify({ type: 'ready' }));
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };
  
  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col items-center gap-6 p-4">
      <h2 className="text-4xl">WebRTC Demo</h2>
      <div className="flex gap-4 h-12 items-center">
        {/* The UI now only shows a single button to start the process. */}
        {!isSetup && <button onClick={handleStart} className="bg-green-600 p-3 rounded-lg text-xl">Start Camera and Join</button>}
        {/* Once joined, a waiting message is shown until the other user connects. */}
        {isSetup && <p className="text-lg text-green-400">Waiting for another user to join...</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-4 w-full">
        <div className="flex flex-col items-center">
          <h3 className="text-xl mb-2">Your Video</h3>
          <video ref={localVideoRef} autoPlay playsInline className="w-full max-w-lg border-2 rounded-lg" muted></video>
        </div>
        {/* The remote video element is only shown once the call is active. */}
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

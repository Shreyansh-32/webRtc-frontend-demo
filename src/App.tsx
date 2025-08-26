import { useEffect, useRef, useState } from "react";
import { useSocket } from "./socket/useSocket";

type SignalMessage =
  | { type: "offer"; sdp: string; from: string }
  | { type: "answer"; sdp: string; from: string }
  | { type: "candidate"; candidate: RTCIceCandidateInit; from: string };

function App() {
  const socket = useSocket();

  // Stable peer ID for tie-breaking
  const myIdRef = useRef<string>(
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
  const remoteIdRef = useRef<string | null>(null);
  const isPoliteRef = useRef<boolean | null>(null);

  const pcRef = useRef<RTCPeerConnection>(
    new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    })
  );

  // Perfect Negotiation state
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // ===== PC event handlers =====
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc) return;

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.send(
          JSON.stringify({
            type: "offer",
            sdp: offer.sdp!,
            from: myIdRef.current,
          } satisfies SignalMessage)
        );
      } catch (e) {
        console.error("onnegotiationneeded error:", e);
      } finally {
        makingOfferRef.current = false;
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket?.send(
          JSON.stringify({
            type: "candidate",
            candidate: ev.candidate.toJSON(),
            from: myIdRef.current,
          } satisfies SignalMessage)
        );
      }
    };

    pc.ontrack = (ev) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = ev.streams[0];
        setIsCallActive(true);
      }
    };
  }, [socket]);

  // ===== Socket message handling =====
  useEffect(() => {
    if (!socket) return;

    socket.onmessage = async (event: MessageEvent<string>) => {
      const msg: SignalMessage = JSON.parse(event.data);

      // Ignore our own relayed messages
      if (msg.from === myIdRef.current) return;

      // Capture/compute remote id & role
      if (!remoteIdRef.current) {
        remoteIdRef.current = msg.from;
        isPoliteRef.current = myIdRef.current > remoteIdRef.current;
      }

      const pc = pcRef.current;

      try {
        if (msg.type === "offer") {
          const offer = new RTCSessionDescription({
            type: "offer",
            sdp: msg.sdp,
          });

          const offerCollision =
            makingOfferRef.current || pc.signalingState !== "stable";

          ignoreOfferRef.current =
            !isPoliteRef.current && offerCollision;

          if (ignoreOfferRef.current) {
            console.log(
              "[PerfectNeg] Ignoring received offer (impolite & collision)"
            );
            return;
          }

          if (offerCollision) {
            console.log(
              "[PerfectNeg] Collision → rollback then apply remote offer"
            );
            await pc.setLocalDescription({ type: "rollback" } );
          }

          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.send(
            JSON.stringify({
              type: "answer",
              sdp: answer.sdp!,
              from: myIdRef.current,
            } satisfies SignalMessage)
          );

          // Flush ICE
          while (iceQueueRef.current.length) {
            const c = iceQueueRef.current.shift()!;
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
        }

        if (msg.type === "answer") {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
          );
          while (iceQueueRef.current.length) {
            const c = iceQueueRef.current.shift()!;
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
        }

        if (msg.type === "candidate") {
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (err) {
              if (!ignoreOfferRef.current) {
                console.error("Error adding ICE candidate:", err);
              }
            }
          } else {
            iceQueueRef.current.push(msg.candidate);
          }
        }
      } catch (err) {
        console.error("Signaling error:", err);
      }
    };

    return () => {
      socket.onmessage = null;
    };
  }, [socket]);

  // ===== Start camera / add tracks (this triggers negotiationneeded) =====
  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((t) => pcRef.current.addTrack(t, stream));
      setIsSetup(true);
    } catch (e) {
      console.error("getUserMedia failed:", e);
      alert("Could not access camera/mic. Check permissions.");
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col items-center gap-6 p-4">
      <h2 className="text-4xl">WebRTC Demo</h2>
      <div className="flex gap-4 h-12 items-center">
        {!isSetup && (
          <button
            onClick={handleStart}
            className="bg-green-600 p-3 rounded-lg text-xl"
          >
            Start Camera and Join
          </button>
        )}
        {isSetup && <p className="text-lg text-green-400">Ready</p>}
      </div>

      <div className="flex flex-wrap justify-center gap-4 w-full">
        <div className="flex flex-col items-center">
          <h3 className="text-xl mb-2">Your Video</h3>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            className="w-full max-w-lg border-2 rounded-lg"
            muted
          />
        </div>

        {isCallActive && (
          <div className="flex flex-col items-center">
            <h3 className="text-xl mb-2">Remote Video</h3>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full max-w-lg border-2 rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

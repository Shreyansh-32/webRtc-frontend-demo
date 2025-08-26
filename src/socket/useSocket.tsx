import { useEffect, useState } from 'react';

// The IP address of the computer running the WebSocket server.
// Make sure this matches the IP you use to access the site (e.g., 192.168.1.7).

export const useSocket = () => {
    const [socket, setSocket] = useState<WebSocket | null>(null);

    useEffect(() => {
        // FIX: Connect to the server's IP address, not localhost.
        const newSocket = new WebSocket(`https://webrtc-backend-demo-4.onrender.com`);

        newSocket.onopen = () => {
            console.log("Socket connection established.");
            setSocket(newSocket);
        };

        newSocket.onclose = () => {
            console.log("Socket connection closed.");
            setSocket(null);
        };
        
        newSocket.onerror = (error) => {
            console.error("WebSocket Error:", error);
        }

        // Cleanup function to close the socket when the component unmounts.
        return () => {
            console.log("Closing socket connection.");
            newSocket.close();
        };
    }, []); // Empty array ensures this runs only once.

    return socket;
};
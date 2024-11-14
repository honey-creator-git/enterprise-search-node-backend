const WebSocket = require("ws");

const ws = new WebSocket("wss://es-services.onrender.com");

ws.onopen = () => {
  // Send a message to the server to set the client's role as Admin
  ws.send(JSON.stringify({ type: "SET_ROLE", role: "Admin" }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Received message:", message);
};

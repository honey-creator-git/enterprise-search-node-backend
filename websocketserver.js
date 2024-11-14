const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients and their roles
const clients = [];

wss.on("connection", (ws) => {
  // New client connection, add client with default role
  const client = { ws, role: null }; // Role is initially null
  clients.push(client);

  // Listen for messages from the client to set their role
  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.type === "SET_ROLE" && data.role === "Admin") {
      // Update the client's role to "Admin"
      client.role = "Admin";
      console.log("Admin client connected");
    }
  });

  ws.on("close", () => {
    // Remove client from the list upon disconnection
    clients.splice(clients.indexOf(client), 1);
    console.log("Client disconnected");
  });
});

// Function to broadcast messages only to admin clients
const broadcastToAdmins = (data) => {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.role === "Admin" && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
};

module.exports = { broadcastToAdmins };

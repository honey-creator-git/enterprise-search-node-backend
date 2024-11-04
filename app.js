const express = require("express");
const dotenv = require("dotenv");
const indexRoutes = require("./routes/indexRoutes");
const documentRoutes = require("./routes/documentRoutes");

dotenv.config();

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// Use index routes
app.use("/api/index", indexRoutes);

// Use document routes
app.use("/api/document", documentRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

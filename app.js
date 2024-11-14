const express = require("express");
const dotenv = require("dotenv");
const indexRoutes = require("./routes/v1/indexRoutes");
const documentRoutes = require("./routes/v1/documentRoutes");
const semanticRoutes = require("./routes/v1/semanticRoutes");
const categoryRoutes = require("./routes/v1/categoryRoutes");
const categoryUserRoutes = require("./routes/v1/categoryUserRoutes");
const userRoutes = require("./routes/v1/userRoutes");
const monitorToolRoutes = require("./routes/v1/monitorToolRoutes");
require("./websocketserver");

dotenv.config();

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// Use index routes
app.use("/api/v1/tenant", indexRoutes);

// Use document routes
app.use("/api/v1/document", documentRoutes);

// Use semantic search routes
app.use("/api/v1/search_semantic", semanticRoutes);

// use category routes
app.use("/api/v1/category", categoryRoutes);

// use category-user routes
app.use("/api/v1/category_user", categoryUserRoutes);

// use user routes
app.use("/api/v1/user", userRoutes);

// use monitor tool routes
app.use("/api/v1/monitor_tool", monitorToolRoutes);

// Start the server
const PORT = 3200;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

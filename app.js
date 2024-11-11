const express = require("express");
const dotenv = require("dotenv");
const indexRoutes = require("./routes/v1/indexRoutes");
const documentRoutes = require("./routes/v1/documentRoutes");
const semanticRoutes = require("./routes/v1/semanticRoutes");
const categoryRoutes = require("./routes/v1/categoryRoutes");
const categoryUserRoutes = require("./routes/v1/categoryUserRoutes");

dotenv.config();

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// Use index routes
app.use("/api/v1/tenant", indexRoutes);

// Use document routes
app.use("/api/v1/document", documentRoutes);

// Use semantic search routes
app.use("/api/v1/semantic", semanticRoutes);

// use category routes
app.use("/api/v1/category", categoryRoutes);

// use category-user routes
app.use("/api/v1/category_user", categoryUserRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

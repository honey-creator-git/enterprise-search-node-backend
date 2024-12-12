const express = require("express");
const dotenv = require("dotenv");
const indexRoutes = require("./routes/v1/indexRoutes");
const documentRoutes = require("./routes/v1/documentRoutes");
const semanticRoutes = require("./routes/v1/semanticRoutes");
const categoryRoutes = require("./routes/v1/categoryRoutes");
const categoryUserRoutes = require("./routes/v1/categoryUserRoutes");
const userRoutes = require("./routes/v1/userRoutes");
const monitorToolRoutes = require("./routes/v1/monitorToolRoutes");
const dataSourceTypeRoutes = require("./routes/v1/datasourcetypeRoutes");
const googleDriveSyncRoutes = require("./routes/v1/googledrivesyncRoutes");
const oneDriveSyncRoutes = require("./routes/v1/onedrivesyncRoutes");
const mysqlsyncRoutes = require("./routes/v1/mysqlsyncRoutes");
const postgresqlsyncRoutes = require("./routes/v1/postgresqlsyncRoutes");
const mongodbsyncRoutes = require("./routes/v1/mongodbsyncRoutes");
const dataSourceRoutes = require("./routes/v1/datasourceRoutes");
const mssqlRoutes = require("./routes/v1/mssqlsyncRoutes");
const sharePointOnlineRoutes = require("./routes/v1/sharepointonlineRoutes");

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

// use data source type routes
app.use("/api/v1/data_source_type", dataSourceTypeRoutes);

// use sync google drive routes
app.use("/api/v1/sync-google-drive", googleDriveSyncRoutes);

// use sync one drive routes
app.use("/api/v1/sync-one-drive", oneDriveSyncRoutes);

// use sync sharepoint online routes
app.use("/api/v1/sharepoint", sharePointOnlineRoutes);

// use sync mysql database routes
app.use("/api/v1/mysql", mysqlsyncRoutes);

// use sync postgresql databse routes
app.use("/api/v1/postgres", postgresqlsyncRoutes);

// use sync mongodb database routes
app.use("/api/v1/mongodb", mongodbsyncRoutes);

// use sync mssql database routes
app.use("/api/v1/mssql", mssqlRoutes);

// use sync data source routes
app.use("/api/v1/", dataSourceRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

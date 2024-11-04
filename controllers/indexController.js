const client = require("../config/elasticsearch");

// Controller to create a new index
exports.createIndex = async (req, res) => {
  const indexName = req.body.indexName || "coid";

  try {
    // Check if the index already exists
    const exists = await client.indices.exists({
      index: "index_" + indexName + "_documents",
    });

    if (exists) {
      return res.status(400).json({
        message: `Index "index_${indexName}_documents" already exists`,
      });
    }

    // Create the new index with settings and mappings
    const response = await client.indices.create({
      index: "index_" + indexName + "_documents",
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
        mappings: {
          properties: {
            title: { type: "text" },
            description: { type: "text" },
            content: { type: "text" },
            image: { type: "keyword" },
          },
        },
      },
    });

    res.status(200).json({
      message: `Index "index_${indexName}_documents" created successfully.`,
      response: response.body,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create index",
      details: error.message,
    });
  }
};

// Controller to delete an index
exports.deleteIndex = async (req, res) => {
  const indexName = req.params.indexName; // Get the index name from the URL parameter

  console.log("Index Name => ", indexName);

  try {
    // Check if the index exists
    const exists = await client.indices.exists({
      index: "index_" + indexName + "_documents",
    });

    if (!exists) {
      return res.status(404).json({
        message: `Index "index_${indexName}_documents" does not exist.`,
      });
    }

    // Delete the index
    const response = await client.indices.delete({
      index: "index_" + indexName + "_documents",
    });

    res.status(200).json({
      message: `Index "${indexName}" deleted successfully.`,
      response: response.body,
    });
  } catch (error) {
    console.error("Error deleting index: ", error);
    res.status(500).json({
      error: "Failed to delete index",
      details: error.message,
    });
  }
};

// Controller to list all indices
exports.listIndices = async (req, res) => {
  try {
    // Fetch all indices using the _cat/indices API with JSON output format
    const response = await client.cat.indices({
      format: "json",
    });

    console.log("Response for list indices => ", response);

    // Extract necessary details (e.g., index name, health, status, document count)
    const indices = response.map((index) => ({
      index: index.index,
      health: index.health,
      status: index.status,
      documentCount: index.documentCount,
      storeSize: index.storeSize,
    }));

    res.status(200).json({
      message: "List of all indices",
      total: indices.length,
      indices,
    });
  } catch (error) {
    console.error("Error listening indices: ", error);
    res.status(500).json({
      error: "Failed to list indices",
      details: error.message,
    });
  }
};

// Controller to update index settings
exports.updateIndexSettings = async (req, res) => {
  const indexName = req.params.indexName; // Get index name from URL parameters
  const settings = req.body.settings; // Settings to update, passed in the request body

  try {
    // Update the settings for the specified index
    const response = await client.indices.putSettings({
      index: "index_" + indexName + "_documents",
      body: {
        settings,
      },
    });

    res.status(200).json({
      message: `Settings for index "${indexName}" updated successfully.`,
      response: response,
    });
  } catch (error) {
    console.error("Error updating index settings: ", error);
    res.status(500).json({
      error: "Failed to update index settings",
      details: error.message,
    });
  }
};

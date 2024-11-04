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

const client = require("../../config/elasticsearch");

// Controller to create a new index
exports.createIndex = async (req, res) => {
  const indexName = req.body.indexName.toLowerCase() || "coid";

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
  const indexName = req.params.indexName.toLowerCase(); // Get the index name from the URL parameter

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
    const indices = response.filter((index) => {
      if (index.index.includes("index_")) {
        return {
          index: index.index,
          health: index.health,
          status: index.status,
          documentCount: index["docs.count"],
          storeSize: index["store.size"],
        };
      }
    });

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
  const indexName = req.params.indexName.toLowerCase(); // Get index name from URL parameters
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

// Controller to reindex
exports.reindexIndices = async (req, res) => {
  const newIndex1 = "index_" + req.params.newIndex.toLowerCase() + "_documents";
  const oldIndex1 = "index_" + req.params.oldIndex.toLowerCase() + "_documents";
  const aliasName1 = "index_" + req.params.newIndex.toLowerCase() + "_alias";

  try {
    // Step 1: Create a new index
    console.log("Creating new index...");
    const indexConfig = {
      mappings: {
        properties: {
          title: { type: "text" },
          description: { type: "text" },
          content: { type: "text" },
          image: { type: "keyword" },
          title_vector: { type: "dense_vector", dims: 768 },
          content_vector: { type: "dense_vector", dims: 768 },
          description_vector: { type: "dense_vector", dims: 768 },
        },
      },
    };

    const response = await client.indices.create({
      index: newIndex1,
      body: indexConfig,
    });

    console.log("New Index Created: ", response);

    // Step 2: Reindex documents from old index to new index
    console.log("Reindexing documents...");
    const sourceIndex = oldIndex1;
    const destinationIndex = newIndex1;

    const responseForReindex = await client.reindex({
      body: {
        source: {
          index: sourceIndex,
        },
        dest: {
          index: destinationIndex,
        },
      },
    });

    console.log("Reindexing Completed: ", responseForReindex);

    // Step 3: Delete the old index
    console.log("Deleting old index...");
    const oldIndex = oldIndex1;
    const responseForDeletingOldIndex = await client.indices.delete({
      index: oldIndex,
    });

    console.log("Old Index Deleted: ", responseForDeletingOldIndex);

    // Step 4: Create alias for new index
    console.log("Creating alias...");
    const aliasName = aliasName1;
    const newIndex = newIndex1;
    const responseForAlias = await client.indices.putAlias({
      index: newIndex,
      name: aliasName,
    });
    console.log("Alias Created: ", responseForAlias);

    res.status(200).send("Reindexing completed successfully!");
  } catch (error) {
    console.error("Error during reindexing process:", error);
    res.status(500).send("An error occurred during reindexing.");
  }
};

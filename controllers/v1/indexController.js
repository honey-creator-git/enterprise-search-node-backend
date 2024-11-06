const {
  SearchIndexClient,
  AzureKeyCredential,
} = require("@azure/search-documents");
const client = require("../../config/elasticsearch");
require("dotenv").config();

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_SEARCH_API_KEY;
const searchClient = new SearchIndexClient(
  searchEndpoint,
  new AzureKeyCredential(apiKey)
);

// Controller to create a new index in Elastic Search Cluster & create a new index in Azure AI Search
exports.createIndex = async (req, res) => {
  const indexName = req.body.indexName?.toLowerCase() || "coid";

  try {
    // Check if the index already exists
    const esExists = await client.indices.exists({
      index: indexName,
    });

    if (esExists) {
      return res.status(400).json({
        message: `Index ${indexName} already exists in Elastic Search Cluster`,
      });
    }

    // Create the new index with settings and mappings
    const esResponse = await client.indices.create({
      index: indexName,
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

    // Define indexSchema for the new index of Azure AI Search
    const azureIndexSchema = {
      name: indexName,
      fields: [
        { name: "id", type: "Edm.String", key: true, searchable: false },
        {
          name: "title",
          type: "Edm.String",
          searchable: true,
          filterable: true,
          sortable: true,
        },
        {
          name: "description",
          type: "Edm.String",
          searchable: true,
          filterable: true,
          sortable: true,
        },
        {
          name: "content",
          type: "Edm.String",
          searchable: true,
          filterable: true,
          sortable: true,
        },
        { name: "image", type: "Edm.String", searchable: true },
      ],
      suggesters: [{ name: "sg", sourceFields: ["title", "description"] }],
      corsOptions: {
        allowedOrigins: ["*"],
        allowedHeaders: ["*"],
        exposedHeaders: ["*"],
        allowedMethods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
      },
      semantic: {
        configurations: [
          {
            name: "es-semantic-config",
            prioritizedFields: {
              titleField: { fieldName: "title" },
              prioritizedContentFields: [
                { fieldName: "description" },
                { fieldName: "content" },
              ],
            },
          },
        ],
      },
      scoringProfiles: [],
      analyzers: [],
      tokenFilters: [],
      charFilters: [],
    };

    const azureResponse = await searchClient.createIndex(azureIndexSchema);

    // Send a successful response with the details of both index creations
    res.status(201).json({
      message: `Index ${indexName} created successfully in both Elasticsearch and Azure Cognitive Search.`,
      elasticsearchResponse: esResponse.body,
      azureResponse: azureResponse,
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
  const indexName = req.params.indexName?.toLowerCase(); // Get the index name from the URL parameter

  console.log("Index Name => ", indexName);

  try {
    // Check if the index exists
    const exists = await client.indices.exists({
      index: indexName,
    });

    if (!exists) {
      return res.status(404).json({
        message: `Index ${indexName} does not exist.`,
      });
    }

    // Delete the index
    const response = await client.indices.delete({
      index: indexName,
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
  const indexName = req.params.indexName?.toLowerCase(); // Get index name from URL parameters
  const settings = req.body.settings; // Settings to update, passed in the request body

  try {
    // Update the settings for the specified index
    const response = await client.indices.putSettings({
      index: indexName,
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
  const newIndex1 = req.params.newIndex.toLowerCase();
  const oldIndex1 = req.params.oldIndex.toLowerCase();
  const aliasName1 = req.params.newIndex.toLowerCase() + "_alias";

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

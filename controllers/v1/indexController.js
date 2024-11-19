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
  const indexName =
    req.body.indexName?.toLowerCase() + "_" + req.coid.toLowerCase();

  const documentFields = req.body.documentFields;

  if (
    !documentFields ||
    !Array.isArray(documentFields) ||
    documentFields.length === 0
  ) {
    return res.status(400).json({
      messag:
        "Invalid or missing documentFields. Please provide a non-empty array of field definitions",
    });
  }

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

    // Create dynamic mappings for Elasticsearch
    const esMappings = { properties: {} };
    documentFields.forEach((field) => {
      esMappings.properties[field.name] = { type: field.type || "text" };
    });

    // Create the new index with settings and mappings
    const esResponse = await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
        mappings: esMappings,
      },
    });

    // Define Azure AI Search index Schema based on documentFields
    let auzreFields = [
      { name: "id", type: "Edm.String", key: true, searchable: false },
    ];
    const tempAzureFields = documentFields.map((field) => ({
      name: field.name,
      type: field.azureType || "Edm.String", // Defaults to "Edm.String" if not provided
      searchable: field.searchable || true,
      filterable: field.filterable || true,
      sortable: field.sortable || true,
    }));

    auzreFields = auzreFields.concat(tempAzureFields);

    // Define indexSchema for the new index of Azure AI Search
    const azureIndexSchema = {
      name: indexName,
      fields: auzreFields,
      suggesters: [
        {
          name: "sg",
          sourceFields: documentFields
            .filter((f) => f.searchable)
            .map((f) => f.name),
        },
      ],
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
              titleField: { fieldName: documentFields[0].name }, // Assuming the first field is title
              prioritizedContentFields: documentFields.map((field) => ({
                fieldName: field.name,
              })),
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

  if (!indexName) {
    return res.status(400).json({
      message: "Index name is required",
    });
  }

  try {
    // Check if the index exists
    const exists = await client.indices.exists({
      index: indexName,
    });

    if (exists) {
      // Delete the index
      await client.indices.delete({
        index: indexName,
      });
    } else {
      console.log(`Index ${indexName} does not exist in Elasticsearch.`);
    }

    // Check if the index exists in Azure Cognitive Search
    try {
      await searchClient.getIndex(indexName);

      // If index exists, delete it
      await searchClient.deleteIndex(indexName);
    } catch (azureError) {
      if (azureError.statusCode === 404) {
        console.log(
          `Index ${indexName} does not exist in Azure Cognitive Search.`
        );
      } else {
        throw azureError; // Re-throw if it's not a 404 error
      }
    }

    res.status(200).json({
      message: `Index "${indexName}" deleted successfully from both Elasticsearch and Azure Cognitive Search.`,
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
    const indexConfig = {
      mappings: {
        properties: {
          // title: { type: "text" },
          // description: { type: "text" },
          // content: { type: "text" },
          // image: { type: "keyword" },
          // category: { type: "keyword" },

          name: { type: "text" },
          type: { type: "text" },
          tenantId: { type: "keyword" },
        },
      },
    };

    const response = await client.indices.create({
      index: newIndex1,
      body: indexConfig,
    });

    // Step 2: Reindex documents from old index to new index
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

    // Step 3: Delete the old index
    // const oldIndex = oldIndex1;
    // const responseForDeletingOldIndex = await client.indices.delete({
    //   index: oldIndex,
    // });

    // Step 4: Create alias for new index
    const aliasName = aliasName1;
    const newIndex = newIndex1;
    const responseForAlias = await client.indices.putAlias({
      index: newIndex,
      name: aliasName,
    });

    res.status(200).send("Reindexing completed successfully!");
  } catch (error) {
    console.error("Error during reindexing process:", error);
    res.status(500).send("An error occurred during reindexing.");
  }
};

exports.updateCategoryUser = async (req, res) => {
  const userId = req.query.userId; // Get user ID from request parameters
  const { categories } = req.body; // Get comma-separated list of categories from request body

  try {
    if (!!userId) {
      if (!categories || categories.trim() === "") {
        // If categories is an empty string, remove all category associations for this user
        await client.deleteByQuery({
          index: `category_user_${req.coid.toLowerCase()}`,
          body: {
            query: {
              term: { user: userId },
            },
          },
        });

        return res.status(200).json({
          message: `All categories removed for user ${userId}.`,
        });
      }

      // Split the categories string into an array
      const categoryList = categories
        .split(",")
        .map((category) => category.trim());

      // Check if the user already exists in the index
      const searchResponse = await client.search({
        index: `category_user_${req.coid.toLowerCase()}`,
        body: {
          query: {
            match: { user: userId },
          },
        },
      });

      if (searchResponse.hits.total.value > 0) {
        // User exists, so update their categories
        const existingDoc = searchResponse.hits.hits[0];
        await client.update({
          index: `category_user_${req.coid.toLowerCase()}`,
          id: existingDoc._id,
          body: {
            doc: {
              categories: categoryList.join(", "),
            },
          },
        });
      } else {
        // User does not exist, create a new document with the user and categories
        await client.index({
          index: `category_user_${req.coid.toLowerCase()}`,
          body: {
            user: userId,
            categories: categoryList.join(", "),
          },
        });
      }

      res.status(200).json({
        message: `Categories for user ${userId} updated successfully.`,
      });
    } else {
      res.status(400).json({
        message: `User's uoid must be set!`,
      });
    }
  } catch (error) {
    console.error("Error updating categories for user: ", error);
    res.status(500).json({
      error: "Failed to update categories",
      details: error.message,
    });
  }
};

exports.createNewCategory = async (req, res) => {
  const categoriesIndexName = `datasources_${req.coid.toLowerCase()}`;
  const categoryUserIndexName = `category_user_${req.coid.toLowerCase()}`;
  const usersIndexName = `users_${req.coid.toLowerCase()}`;
  const { name, type } = req.body;

  try {
    if (!name || !type) {
      res.status(400).json({
        message: `Data Source name and type must be set.`,
      });
    }
    if (!!name && name.length > 0) {
      // Step 1: Create the new category in the categories index
      const categoryResponse = await client.index({
        index: categoriesIndexName,
        body: {
          name: name,
          type: type,
          tenantId: `tenant_${req.coid.toLowerCase()}`,
        },
      });

      const newCategoryId = categoryResponse._id;

      // Step 2: Retrieve admin users from the users index
      const adminUsersResponse = await client.search({
        index: usersIndexName,
        body: {
          query: {
            match_phrase: { groups: "Admin" }, // Assuming "admin" is the permission identifier for admin users
          },
        },
      });

      // Step 3: Assign the new category to each admin user in category_user index
      const adminUsers = adminUsersResponse.hits.hits;

      for (const user of adminUsers) {
        const userId = user._source.uoid;

        // Retrieve the existing categories for this user in category_user index
        const categoryUserResponse = await client.search({
          index: categoryUserIndexName,
          body: {
            query: {
              term: { user: userId },
            },
          },
        });

        let existingCategories = [];

        if (categoryUserResponse.hits.total.value > 0) {
          // If a record already exists for this user, retrieve the categories
          const existingCategoriesStr =
            categoryUserResponse.hits.hits[0]._source.categories || "";
          existingCategories = existingCategoriesStr
            .split(",")
            .map((cat) => cat.trim());
        }

        // Append the new category ID if it's not already included
        if (!existingCategories.includes(newCategoryId)) {
          existingCategories.push(newCategoryId);
        }

        // Update or create the entry in category_user index for this user
        await client.index({
          index: categoryUserIndexName,
          id:
            categoryUserResponse.hits.total.value > 0
              ? categoryUserResponse.hits.hits[0]._id
              : undefined,
          body: {
            user: userId,
            categories: existingCategories.join(","),
          },
        });
      }

      res.status(201).json({
        message: `Document added to both Elasticsearch and Azure Cognitive Search indexes successfully.`,
        elasticsearchResponse: categoryResponse,
      });
    } else {
      res.status(400).json({
        message: `Document name must be set.`,
      });
    }
  } catch (error) {
    console.error("Error adding new category: ", error);
    res.status(500).json({
      error: "Failed to add new category",
      details: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const categoryIndex = `datasources_${req.coid.toLowerCase()}`;
  const categoryId = req.params.categoryId;

  try {
    const response = await client.delete({
      index: categoryIndex,
      id: categoryId,
    });

    res.status(200).json({
      message: `Category with ID "${categoryId}" deleted successfully from index ${categoryIndex}.`,
      response: response,
    });
  } catch (error) {
    console.error("Error deleting category: ", error);
    res.status(500).json({
      error: "Failed to delete category",
      details: error.message,
    });
  }
};

exports.updateCategory = async (req, res) => {
  const categoryIndex = `datasources_${req.coid.toLowerCase()}`;
  const categoryId = req.params.categoryId;

  try {
    const response = await client.update({
      index: categoryIndex,
      id: categoryId,
      body: {
        doc: req.body,
      },
    });

    res.status(200).json({
      message: `Category with ID "${categoryId}" updated successfully in index ${categoryIndex}.`,
      response: response,
    });
  } catch (error) {
    console.error("Error updating category: ", error);
    res.status(500).json({
      error: "Failed to update category",
      details: error.message,
    });
  }
};

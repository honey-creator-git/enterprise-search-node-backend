const {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
} = require("@azure/search-documents");
const client = require("../../config/elasticsearch");
const axios = require("axios");
const WebSocket = require("ws");
const { google } = require("googleapis");
const {
  saveWebhookDetails,
  fetchGoogleDriveChanges,
  getWebhookDetailsByResourceId,
  refreshAccessToken,
  fetchFileData,
  pushToAzureSearch,
  registerWebhook,
  fetchAllFileContents,
  checkExistOfGoogleDriveConfig,
} = require("../../webhook/v1/googlewebhookServices");
const {
  checkExistOfMySQLConfig,
  fetchAndProcessFieldContentOfMySQL,
  registerMySQLConnection
} = require("../../webhook/v1/mysqlwebhookServices");
const {
  checkExistOfMongoDBConfig,
  fetchDataFromMongoDB,
  registerMongoDBConnection
} = require("../../webhook/v1/mongodbwebhookServices");
const {
  registerOneDriveConnection,
  checkExistOfOneDriveConfig,
  getAccessToken,
  getFilesFromOneDrive,
  fetchFileContentFromOneDrive,
  createOneDriveSubscription,
  getStoredCredentials,
  getFileDetails,
} = require("../../webhook/v1/onedrivewebhookServices");
const {
  checkExistOfMSSQLConfig,
  saveMSSQLConnection,
  fetchAndProcessFieldContent
} = require("../../webhook/v1/mssqlwebhookServices");
const wsServerUrl = "wss://enterprise-search-node-websocket.onrender.com";
const ws = new WebSocket(wsServerUrl);
require("dotenv").config();

// Connect to the WebSocket server
ws.on("open", () => {
  console.log("Connected to WebSocket server");
});

// Handle errors
ws.on("error", (error) => {
  console.error("WebSocket error:", error);
});

const searchIndexClient = new SearchIndexClient(
  process.env.AZURE_SEARCH_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

// Controller to add a new document to an index
exports.addDocument = async (req, res) => {
  const indexName = req.params.indexName?.toLowerCase(); // Get the index name from the URL parameter
  const document = req.body; // Get the document data from the request body

  // const searchClientForNewDocument = new SearchClient(
  //   process.env.AZURE_SEARCH_ENDPOINT,
  //   indexName,
  //   new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
  // );

  try {
    // Check if the nidex exists before attempting to add a document
    const esExists = await client.indices.exists({
      index: indexName,
    });

    if (!esExists) {
      return res.status(404).json({
        message: "Index is not existed.",
      });
      // await client.indices.create({
      //   index: indexName,
      //   body: {
      //     settings: {
      //       number_of_shards: 1,
      //       number_of_replicas: 1,
      //     },
      //     mappings: {
      //       properties: {
      //         title: { type: "text" },
      //         description: { type: "text" },
      //         content: { type: "text" },
      //         image: { type: "keyword" },
      //       },
      //     },
      //   },
      // });
    }

    // Check if the Azure Cognitive Search index exists
    // const azExists = await searchIndexClient
    //   .getIndex(indexName)
    //   .catch(() => null);

    // if (!azExists) {
    //   // Define Azure Cognitive Search index schema
    //   const indexSchema = {
    //     name: indexName,
    //     fields: [
    //       { name: "id", type: "Edm.String", key: true, searchable: false },
    //       {
    //         name: "title",
    //         type: "Edm.String",
    //         searchable: true,
    //         filterable: true,
    //         sortable: true,
    //       },
    //       {
    //         name: "description",
    //         type: "Edm.String",
    //         searchable: true,
    //         filterable: true,
    //         sortable: true,
    //       },
    //       {
    //         name: "content",
    //         type: "Edm.String",
    //         searchable: true,
    //         filterable: true,
    //         sortable: true,
    //       },
    //       {
    //         name: "image",
    //         type: "Edm.String",
    //         searchable: true,
    //         filterable: false,
    //         sortable: false,
    //       },
    //     ],
    //     semantic: {
    //       configurations: [
    //         {
    //           name: "es-semantic-config",
    //           prioritizedFields: {
    //             titleField: { fieldName: "title" },
    //             prioritizedContentFields: [
    //               { fieldName: "description" },
    //               { fieldName: "content" },
    //             ],
    //           },
    //         },
    //       ],
    //     },
    //   };

    //   await searchIndexClient.createIndex(indexSchema);
    // }

    // Add the document to the specified index
    const esResponse = await client.index({
      index: indexName,
      body: document,
    });

    // Add the document to Azure Cognitive Search
    // const azDocument = {
    //   ...document,
    //   id: esResponse._id.slice(1), // Assign Elasticsearch document ID as the Azure document ID
    // };
    // const azResponse = await searchClientForNewDocument.uploadDocuments([
    //   azDocument,
    // ]);

    res.status(201).json({
      message: `Document added to Elasticsearch index successfully.`,
      elasticsearchResponse: esResponse,
      // azureResponse: azResponse,
    });
  } catch (error) {
    console.error("Error adding document: ", error);
    res.status(500).json({
      error: "Failed to add document",
      details: error.message,
    });
  }
};

// Controller to retrieve a document by ID from an index
exports.getDocument = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const documentId = req.query.documentId;

  try {
    const response = await client.get({
      index: indexName,
      id: documentId,
    });

    res.status(200).json({
      message: `Document retrieved successfully from index ${indexName}.`,
      document: response._source,
    });
  } catch (error) {
    console.error("Error retrieving document: ", error);
    res.status(500).json({
      error: "Failed to retrieve document",
      details: error.message,
    });
  }
};

// Controller to update an existing document in an index
exports.updateDocument = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const documentId = req.query.documentId;
  const updatedFields = req.body;

  try {
    const exists = await client.exists({
      index: indexName,
      id: documentId,
    });

    if (!exists) {
      return res.status(404).json({
        message: `Document with ID "${documentId}" does not exist in index ${indexName}.`,
      });
    }

    const response = await client.update({
      index: indexName,
      id: documentId,
      body: {
        doc: updatedFields,
      },
    });

    res.status(200).json({
      message: `Document with ID "${documentId}" updated successfully in index "${indexName}".`,
      response: response.body,
    });
  } catch (error) {
    console.error("Error updating document: ", error);
    res.status(500).json({
      error: "Failed to update document",
      details: error.message,
    });
  }
};

// Controller to update an existing document in an Azure Cognitive Search
exports.updateDocumentInAzureSearch = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const documentId = req.query.documentId;
  const updatedFields = req.body;

  try {
    // Prepare the document with the `merge` action
    const updatePayload = {
      value: [
        {
          "@search.action": "merge", // Use merge to update specific fields
          id: documentId, // Replace "id" with the actual key field name in your index schema
          ...updatedFields, // Spread the updated fields into the documenttt
        },
      ],
    };

    // Send the request to Azure Cognitive Search
    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=2021-04-30-Preview`,
      updatePayload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    res.status(200).json({
      message: `Document with ID "${documentId}" updated successfully in index "${indexName}" of Azure Cognitive Search.`,
      response: response.data,
    });
  } catch (error) {
    console.error(
      "Error updating document in Azure Cognitive Search:",
      error.message
    );
    res.status(500).json({
      error: "Failed to update document in Azure Cognitive Search",
      details: error.response ? error.response.data : error.message,
    });
  }
};

// Controller to delete a document by ID from an index
exports.deleteDocument = async (req, res) => {
  // const indexName = ("tenant_" + req.coid).toLowerCase();
  const indexName = req.params.indexName;
  const documentId = req.query.documentId;

  try {
    const response = await client.delete({
      index: indexName,
      id: documentId,
    });

    res.status(200).json({
      message: `Document with ID "${documentId}" deleted successfully from index ${indexName}.`,
      response: response,
    });
  } catch (error) {
    console.error("Error deleting document: ", error);
    res.status(500).json({
      error: "Failed to delete document",
      details: error.message,
    });
  }
};

// Controller to delete a document by ID from an Azure Cognitive Search index
exports.deleteDocumentFromAzureSearch = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const documentId = req.query.documentId;

  try {
    const azureResponse = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=2021-04-30-Preview`,
      {
        value: [
          {
            "@search.action": "delete",
            id: documentId, // Replace "id" with the actual key name in your index schema
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    res.status(200).json({
      message: `Document with ID "${documentId}" deleted successfully from index "${indexName}" of Azure Cognitive Search.`,
      response: azureResponse.data, // Only include the data part of the response
    });
  } catch (error) {
    console.error("Error deleting document:", error.message); // Log the error message for debugging

    res.status(500).json({
      error: "Failed to delete document from Azure Cognitive Search",
      details: error.response ? error.response.data : error.message, // Include detailed error info if available
    });
  }
};

// Controller to search documents with various filters and query options
exports.searchDocuments = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const { keyword, query, fuzziness = "AUTO" } = req.body;
  const from = 0; // Default pagination start
  const size = 10000; // Maximum number of documents to retrieve
  let searchQuery;

  try {
    // Step 1: Retrieve categories associated with the user from "category-user" index
    const categoryResponse = await client.search({
      index: `category_user_${req.coid.toLowerCase()}`,
      body: {
        query: {
          match: {
            user: req.userId, // Match the userId in the category-user index
          },
        },
      },
    });

    // Extract the categories from the category-user index response
    const userCategories = categoryResponse.hits.hits.flatMap((hit) =>
      hit._source.categories.split(",").map((category) => category.trim())
    );

    // If the user has no associated categories, return an empty response
    if (userCategories.length === 0) {
      return res.status(200).json({
        message: "No categories found for the user",
        results: [],
      });
    }

    // Step 2: Construct the main search query, including category filter
    searchQuery = {
      index: indexName,
      body: {
        query: {
          bool: {
            must: [],
            filter: [
              {
                terms: { category: userCategories }, // Filter by user's categories
              },
            ],
          },
        },
        from,
        size,
      },
    };

    // Add keyword search if provided, targeting text fields (title, description, content)
    if (keyword) {
      searchQuery.body.query.bool.must.push({
        multi_match: {
          query: keyword,
          fields: ["title", "description", "content"],
          fuzziness: fuzziness,
        },
      });
    }

    // Add additional query filters if provided
    if (query) {
      if (query.title) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: { title: query.title },
        });
      }
      if (query.description) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: { description: query.description },
        });
      }
      if (query.content) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: { content: query.content },
        });
      }
      if (query.image) {
        searchQuery.body.query.bool.filter.push({
          term: {
            image: query.image, // Exact match for the image keyword field
          },
        });
      }
    }

    // If no keyword or filters are provided, search all documents with user's categories
    if (!keyword && (!query || Object.values(query).every((val) => !val))) {
      searchQuery = {
        index: "*",
        body: {
          query: {
            bool: {
              filter: [{ terms: { category: userCategories } }], // Filter by user's categories
            },
          },
          from,
          size,
        },
      };
    }

    // Execute the search query
    const response = await client.search(searchQuery);

    const filteredDocuments = response.hits.hits.filter(
      (hit) => hit._index === indexName
    );

    res.status(200).json({
      message: "Search completed successfully",
      total: filteredDocuments.length,
      results: filteredDocuments.map((doc) => ({
        index: doc._index, // Include the index name for each document
        id: doc._id, // Include the document ID
        ...doc._source,
      })),
    });
  } catch (error) {
    console.error("Error performing search: ", error);
    res.status(500).json({
      error: "Failed to perform search",
      details: error.message,
    });
  }
};

// Controller to search documents across all indices with keyword and partial filter support
exports.searchAllDocuments = async (req, res) => {
  let searchQuery;
  const from = 0; // Default to 0 if not provided
  const size = 10000; // Default to 10 if not provided
  const { keyword, query, fuzziness = "AUTO" } = req.body; // Get keyword, query, and fuzziness from request body

  try {
    // Construct the search query
    searchQuery = {
      index: "*", // Use '*' to search across all indices
      body: {
        query: {
          bool: {
            must: [],
            filter: [],
          },
        },
      },
    };

    // Add keyword search if provided, targeting text fields (title, description, content)
    if (keyword) {
      searchQuery.body.query.bool.must.push({
        multi_match: {
          query: keyword,
          fields: ["title", "description", "content"],
          fuzziness: fuzziness,
        },
      });
    }

    // Add query filters for partial matches if provided
    if (query) {
      if (query.title) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: { title: query.title },
        });
      }

      if (query.description) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: {
            description: query.description,
          },
        });
      }

      if (query.content) {
        searchQuery.body.query.bool.filter.push({
          match_phrase_prefix: {
            content: query.content,
          },
        });
      }

      if (query.image) {
        searchQuery.body.query.bool.filter.push({
          term: {
            image: query.image,
          },
        });
      }
    }

    if (
      keyword?.length === 0 &&
      query.title?.length === 0 &&
      query.description?.length === 0 &&
      query.content?.length === 0
    ) {
      searchQuery = {
        index: "*",
        body: {
          query: {
            match_all: {},
          },
          from, // Start from this document (for pagination)
          size, // Number of documents to retrieve (pagination size)
        },
      };
    }

    // Execute the search query
    const response = await client.search(searchQuery);

    const filtered_documents = response.hits.hits.filter((hit) =>
      hit._index.includes("index_")
    );

    res.status(200).json({
      message: "Search across all indices completed successfully",
      results: filtered_documents.map((doc) => ({
        index: doc._index, // Include the index name for each document
        id: doc._id, // Include the document ID
        ...doc._source,
      })),
    });
  } catch (error) {
    console.error("Error performing search across all indices: ", error);
    res.status(500).json({
      error: "Failed to perform search",
      details: error.message,
    });
  }
};

// Controller to retrieve all documents from a specified index
exports.getAllDocuments = async (req, res) => {
  const indexName = req.params.indexName?.toLowerCase();
  const from = parseInt(req.query.from, 10) || 0; // Default to 0 if not provided
  const size = parseInt(req.query.size, 10) || 10000; // Default to 10 if not provided

  try {
    // Construct the search query to match all documents
    const searchQuery = {
      index: indexName,
      body: {
        query: {
          match_all: {},
        },
        from, // Start from this document (for pagination)
        size, // Number of documents to retrieve (pagination size)
      },
    };

    // Execute the search query
    const response = await client.search(searchQuery);

    res.status(200).json({
      message: `Retrieved documents from index "${indexName}".`,
      total: response.hits.total.value,
      documents: response.hits.hits.map((hit) => {
        return {
          index: hit._index, // Include the index name for each document
          id: hit._id, // Include the document ID
          ...hit._source,
        };
      }), // Return only document sources
    });
  } catch (error) {
    console.error("Error retrieving documents: ", error);
    res.status(500).json({
      error: "Failed to retrieve documents",
      details: error.message,
    });
  }
};

// Controller to retrieve all documents across all indices
exports.getAllDocumentsAcrossIndices = async (req, res) => {
  const from = parseInt(req.query.from, 10) || 0; // Default to 0 if not provided
  const size = parseInt(req.query.size, 10) || 10000; // Default to 10 if not provided

  try {
    // Construct the search query to match all documents across all indices
    const searchQuery = {
      index: "*", // Use '*' to search across all indices
      body: {
        query: {
          match_all: {}, // Retrieve all documents
        },
      },
      from, // Start from this document (for pagination)
      size, // Number of documents to retrieve (pagination size)
    };

    // Execute the search query
    const response = await client.search(searchQuery);

    const filtered_documents = response.hits.hits.filter((hit) =>
      hit._index.includes("index_")
    );

    res.status(200).json({
      message: "Retrieved documents from all indices.",
      documents: filtered_documents.map((doc) => ({
        index: doc._index, // Include the index name for each document
        id: doc._id, // Include the document ID
        ...doc._source,
      })),
    });
  } catch (error) {
    console.error("Error retrieving documents across all indices: ", error);
    res.status(500).json({
      error: "Failed to retrieve documents",
      details: error.message,
    });
  }
};

exports.syncElasticSearchAzureAiSearch = async (req, res) => {
  const indexName = req.params.indexName?.toLowerCase();
  const from = 0;
  const size = 10000;

  const searchClient = new SearchClient(
    process.env.AZURE_SEARCH_ENDPOINT,
    indexName,
    new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
  );

  try {
    // Construct the search query to match all documents
    const searchQuery = {
      index: indexName,
      body: {
        query: {
          match_all: {},
        },
      },
      from,
      size,
    };

    // Execut the search query
    const response = await client.search(searchQuery);

    if (response.hits.hits.length > 0) {
      const docs = response.hits.hits.map((hit) => ({
        "@search.action": "upload", // Required action for Azure Search API
        id: hit._id, // Primary key in your Azure index
        ...hit._source,
      }));

      if (docs.length > 0) {
        const batch = docs.map((doc) => ({
          ...doc,
          "@search.action": "upload", // Ensures Azure Search treats this as an upload operation
        }));

        const resultOf = await searchClient.uploadDocuments(batch);

        res.status(200).json({
          message: `Fetched documents from index ${indexName} and stored to azure AI index ${indexName}.`,
          total: response.hits.total.value,
          documents: response.hits.hits.map((hit) => hit._source), // Return only document sources
        });
      }
    }
  } catch (error) {
    console.error("Error retrieving document: ", error);
    res.status(500).json({
      error: "Failed to retrieve document",
      details: error.message,
    });
  }
};

exports.searchDocumentsFromAzureAIIndex = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  let filter = "";
  let filter_of_title = "";
  let filter_of_description = "";
  let filter_of_content = "";
  let filter_of_category = "";
  const query = req.body.query;
  const title = req.body.title ? req.body.title : "";
  const description = req.body.description ? req.body.description : "";
  const content = req.body.content ? req.body.content : "";

  if (title.length !== 0) {
    filter_of_title = `title eq '${title}'`;
  }

  if (description.length !== 0) {
    filter_of_description = `description eq '${description}'`;
  }

  if (content.length !== 0) {
    filter_of_content = `content eq '${content}'`;
  }

  if (
    filter_of_title.length !== 0 &&
    filter_of_description.length === 0 &&
    filter_of_content.length === 0
  ) {
    filter = filter_of_title;
  } else if (
    filter_of_title.length === 0 &&
    filter_of_description.length !== 0 &&
    filter_of_content === 0
  ) {
    filter = filter_of_description;
  } else if (
    filter_of_title.length === 0 &&
    filter_of_description.length === 0 &&
    filter_of_content !== 0
  ) {
    filter = filter_of_content;
  } else if (
    filter_of_title.length !== 0 &&
    filter_of_description.length !== 0 &&
    filter_of_content.length === 0
  ) {
    filter = `${filter_of_title} and ${filter_of_description}`;
  } else if (
    filter_of_title.length === 0 &&
    filter_of_description.length !== 0 &&
    filter_of_content.length !== 0
  ) {
    filter = `${filter_of_description} and ${filter_of_content}`;
  } else if (
    filter_of_title.length !== 0 &&
    filter_of_description.length === 0 &&
    filter_of_content.length !== 0
  ) {
    filter = `${filter_of_title} and ${filter_of_content}`;
  } else if (
    filter_of_title.length !== 0 &&
    filter_of_description.length !== 0 &&
    filter_of_content.length !== 0
  ) {
    filter = `${filter_of_title} and ${filter_of_description} and ${filter_of_content}`;
  }

  try {
    // Retrieve categories associated with the user from "category-user" index
    const categoryResponse = await client.search({
      index: `category_user_${req.coid.toLowerCase()}`,
      body: {
        query: {
          match: {
            user: req.userId, // Match the userId in the category-user index
          },
        },
      },
    });

    // Extract the categories from the category-user index response
    const userCategories = categoryResponse.hits.hits.flatMap((hit) =>
      hit._source.categories.split(",").map((category) => category.trim())
    );

    // If the user has no associated categories, return an empty response
    if (req.adminRole === false && userCategories.length === 0) {
      return res.status(200).json({
        message: "No categories found for the user",
        results: [],
      });
    } else {
      if (req.adminRole === false) {
        filter_of_category = userCategories
          .map((category) => `category eq '${category}'`)
          .join(" or ");

        if (filter.length === 0) {
          filter = filter_of_category;
        } else if (filter.length > 0) {
          filter = filter + " and " + filter_of_category;
        }
      }
    }

    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/search?api-version=2021-04-30-Preview`,
      {
        search: query, // The search query
        filter: filter, // Add filter query here
        searchMode: "any", // Allows matching on any term within the query
        queryType: "simple", // Enables full query parsing for complex queries
        top: 30, // Number of results to return
        count: true, // Return count of results
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );
    res.status(200).json({
      message: `Fetched documents from Azure AI Service ${indexName}.`,
      total: response.data.value.length,
      documents: response.data, // Return only document sources
    });
  } catch (error) {
    console.error(
      "Error retrieving documents:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

// Controller to retrieve all categories associated with a specific user ID
exports.getUserCategories = async (req, res) => {
  const userId = req.query.userId; // User ID from the request parameters

  try {
    // Search in the "category-user" index for documents that include the userId in the "user" field
    const categoryResponse = await client.search({
      index: `category_user_${req.coid.toLowerCase()}`,
      body: {
        query: {
          match: { user: userId },
        },
      },
    });

    // Extract and format the categories from the search response
    const userCategories = categoryResponse.hits.hits.flatMap((hit) =>
      hit._source.categories.split(",").map((category) => category.trim())
    );

    // Return the unique categories associated with the user
    res.status(200).json({
      message: `Categories for user ${userId} retrieved successfully`,
      categories: [...new Set(userCategories)], // Remove duplicates if any
    });
  } catch (error) {
    console.error("Error retrieving user categories: ", error);
    res.status(500).json({
      error: "Failed to retrieve categories",
      details: error.message,
    });
  }
};

exports.getAllCategoriesForTenant = async (req, res) => {
  const indexName = `tenant_${req.coid.toLowerCase()}`; // The name of your Azure Cognitive Search index

  try {
    // Step 1: Fetch all documents with the category field from Azure Cognitive Search
    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/search?api-version=2021-04-30-Preview`,
      {
        search: "*", // Use wildcard to retrieve all documents
        filter: "", // Apply any necessary filter
        searchMode: "any",
        queryType: "simple",
        top: 1000, // Adjust as needed, or implement pagination for larger datasets
        count: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    // Step 2: Count documents for each category
    const documents = response.data.value;
    const categoryCounts = documents.reduce((acc, doc) => {
      const categoryId = doc.category;
      if (categoryId) {
        acc[categoryId] = (acc[categoryId] || 0) + 1;
      }
      return acc;
    }, {});

    // Step 3: Fetch categories from Elasticsearch and combine with counts
    const categoriesResponse = await client.search({
      index: `datasources_${req.coid.toLowerCase()}`,
      body: {
        query: {
          term: {
            tenantId: indexName,
          },
        },
      },
    });

    const categories = categoriesResponse.hits.hits.map((hit) => ({
      id: hit._id,
      name: hit._source.name,
      type: hit._source.type,
      created_at: hit._source.createdAt,
      documentCount: categoryCounts[hit._id] || 0, // Use the counted values, defaulting to 0 if no documents
    }));

    // Step 4: Sort categories by document count in descending order
    categories.sort((a, b) => b.documentCount - a.documentCount);

    res.status(200).json({
      message: `Categories retrieved successfully for tenantId: ${indexName}`,
      categories: categories,
    });
  } catch (error) {
    console.error("Error retrieving categories: ", error);
    res.status(500).json({
      error: "Failed to retrieve categories",
      details: error.message,
    });
  }
};

const createIndexIfNotExists = async (client, indexName, mapping) => {
  try {
    const { body: exists } = await client.indices.exists({ index: indexName });

    if (!exists) {
      // Attempt to create the index
      await client.indices.create({
        index: indexName,
        body: mapping,
      });
    } else {
      console.log(`Index ${indexName} already exists.`);
    }
  } catch (error) {
    if (
      error.meta &&
      error.meta.body &&
      error.meta.body.error.type === "resource_already_exists_exception"
    ) {
      console.log(`Index ${indexName} already exists. Ignoring error.`);
    } else {
      console.error(`Failed to check or create index ${indexName}:`, error);
      throw error; // Rethrow the error if it’s not related to index existence
    }
  }
};

exports.decodeUserTokenAndSave = async (req, res) => {
  const indexName = `users_${req.coid.toLowerCase()}`;
  const categoryIndexName = `category_user_${req.coid.toLowerCase()}`;
  const categoriesIndexName = `datasources_${req.coid.toLowerCase()}`;
  const tenantIndexName = `tenant_${req.coid.toLowerCase()}`;

  const name = req.name;
  const email = req.email;
  const coid = req.coid;
  const uoid = req.userId;
  const groups = req.groups;
  const permissions = req.permissions;
  let esResponse;
  let categoryResponse;
  let isNewUser = false;

  try {
    // Define mappings for Elasticsearch indices
    const usersIndexMapping = {
      mappings: {
        properties: {
          name: { type: "text" },
          email: { type: "text" },
          coid: { type: "keyword" },
          uoid: { type: "keyword" },
          groups: { type: "text" },
          permissions: { type: "text" },
        },
      },
    };

    const categoriesIndexMapping = {
      mappings: {
        properties: {
          name: { type: "text" },
          tenantId: { type: "keyword" },
          type: { type: "text" },
          createdAt: { type: "date" }, // Add the createdAt field here
        },
      },
    };

    const categoryUserIndexMapping = {
      mappings: {
        properties: {
          user: { type: "keyword" },
          categories: { type: "text" },
        },
      },
    };

    // Ensure each index exists in Elasticsearch
    await createIndexIfNotExists(client, indexName, usersIndexMapping);
    await createIndexIfNotExists(
      client,
      categoriesIndexName,
      categoriesIndexMapping
    );
    await createIndexIfNotExists(
      client,
      categoryIndexName,
      categoryUserIndexMapping
    );
    // Define Azure AI Search index schema
    let azureFields = [
      { name: "id", type: "Edm.String", key: true, searchable: false },
    ];

    const tempAzureFields = [
      {
        name: "title",
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
      {
        name: "description",
        type: "Edm.String",
        searchable: true,
        filterable: true,
        sortable: true,
      },
      {
        name: "image",
        type: "Edm.String",
        searchable: true,
        filterable: true,
        sortable: true,
      },
      {
        name: "category",
        type: "Edm.String",
        searchable: true,
        filterable: true,
        sortable: true,
      },
    ];

    azureFields = azureFields.concat(tempAzureFields);

    const azureIndexSchema = {
      name: tenantIndexName,
      fields: azureFields,
      suggesters: [
        {
          name: "sg",
          sourceFields: tempAzureFields
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
              titleField: { fieldName: tempAzureFields[0].name },
              prioritizedContentFields: tempAzureFields.map((field) => ({
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

    // Initialize Azure Cognitive Search client
    const searchClientForTenant = new SearchIndexClient(
      process.env.AZURE_SEARCH_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
    );

    // Check if the tenant index exists in Azure Cognitive Search
    let azureResponse;
    try {
      await searchClientForTenant.getIndex(tenantIndexName);
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(
          `Azure index ${tenantIndexName} does not exist. Creating...`
        );
        azureResponse = await searchClientForTenant.createIndex(
          azureIndexSchema
        );
        console.log(`Azure index ${tenantIndexName} created successfully.`);
      } else {
        console.error("Azure Cognitive Search error:", error);
        throw error;
      }
    }

    // Search for categories with the specified tenantId in Elasticsearch
    const response = await client.search({
      index: categoriesIndexName,
      body: {
        query: {
          term: {
            tenantId: `tenant_${req.coid.toLowerCase()}`, // Filter by tenantId
          },
        },
      },
    });

    // Extract categories from response
    const categories = response.hits.hits.map((hit) => ({
      id: hit._id,
      name: hit._source.name,
    }));

    const defaultCategory = categories[0]?.id || "";

    const allCategoriesForAdmin = categories
      .map((category) => category.id)
      .join(", ");

    // Step 1: Check if the user already exists in the users index
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          match: { uoid: uoid },
        },
      },
    });

    if (searchResponse.hits.total.value > 0) {
      // If user exists, update their information
      const existingDoc = searchResponse.hits.hits[0];
      esResponse = await client.update({
        index: indexName,
        id: existingDoc._id,
        body: {
          doc: {
            name: name,
            email: email,
            coid: coid,
            uoid: uoid,
            groups: groups,
            permissions: permissions,
          },
        },
      });
    } else {
      // If the user is new, set isNewUser flag to true
      isNewUser = true;

      // Add the new user document to the users index in Elasticsearch
      esResponse = await client.index({
        index: indexName,
        body: {
          name: name,
          email: email,
          coid: coid,
          uoid: uoid,
          groups: groups,
          permissions: permissions,
        },
      });
    }

    // Step 2: Check if the user category exists in category_user index and add if not (as in your original function)
    const categorySearchResponse = await client.search({
      index: categoryIndexName,
      body: {
        query: {
          match: { user: uoid },
        },
      },
    });

    if (
      categorySearchResponse.hits.total.value === 0 &&
      req.adminRole === true
    ) {
      categoryResponse = await client.index({
        index: categoryIndexName,
        body: {
          user: uoid,
          categories: allCategoriesForAdmin,
        },
      });
    } else if (
      categorySearchResponse.hits.total.value === 0 &&
      defaultCategory
    ) {
      categoryResponse = await client.index({
        index: categoryIndexName,
        body: {
          user: uoid,
          categories: defaultCategory,
        },
      });
    }

    // Step 3: Trigger WebSocket event for admin users if user is new
    // if (isNewUser) {
    // Fetch all admin users from the index
    // const adminUsersResponse = await client.search({
    //   index: indexName,
    //   body: {
    //     query: {
    //       match_phrase: { groups: "Admin" },
    //     },
    //   },
    // });

    // Prepare the message for the new user
    const adminMessage = {
      type: "update-user",
      newUser: { name, email, coid, uoid },
      message: `A new user has been added: ${name} (${email})`,
    };

    // Call broadcastToAdmins to send the message to all connected admin clients
    // broadcastToAdmins(adminMessage);

    const ws = new WebSocket(
      "wss://enterprise-search-node-websocket.onrender.com"
    );

    // Send the message to the WebSocket server
    ws.onopen = () => {
      // Send a message to the server to set the client's role as Admin
      ws.send(JSON.stringify(adminMessage));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message);
    };
    // }

    res.status(201).json({
      message: `User information saved to both Elasticsearch and Azure Cognitive Search indexes successfully.`,
      elasticsearchResponse: esResponse,
      azureResponse: azureResponse,
    });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).json({
      error: "Failed to save user",
      details: error.message,
    });
  }
};

exports.getAllUsersFromTenant = async (req, res) => {
  const indexName = ("users_" + req.coid).toLowerCase();
  const from = parseInt(req.query.from, 10) || 0; // Default to 0 if not provided
  const size = parseInt(req.query.size, 10) || 10000; // Default to 10 if not provided
  const tenantId = ("tenant_" + req.coid).toLowerCase();

  try {
    // Search for categories with the specified tenantId
    const categoriesFromTenant = await client.search({
      index: `datasources_${req.coid.toLowerCase()}`, // Name of your index
      body: {
        query: {
          term: {
            tenantId: tenantId, // Filter by tenantId
          },
        },
      },
    });

    // Extract the categories from the response
    const allCategories = categoriesFromTenant.hits.hits.map((hit) => ({
      id: hit._id,
      name: hit._source.name,
      type: hit._source.type,
      created_at: hit._source.createdAt,
    }));

    // Construct the query to get all users
    const searchQuery = {
      index: indexName,
      body: {
        query: {
          match_all: {},
        },
        from, // Start from this document (for pagination)
        size, // Number of documents to retrieve (pagination size)
      },
    };

    // Execute the search query
    const response = await client.search(searchQuery);

    // Process each user to add their categories
    const documents = await Promise.all(
      response.hits.hits.map(async (hit) => {
        // Check if the user is an admin
        const isAdmin = hit._source.groups.includes("Admin");

        // Fetch categories for each user
        const categoryResponse = await client.search({
          index: `category_user_${req.coid.toLowerCase()}`,
          body: {
            query: {
              match: {
                user: hit._source.uoid, // Match the userId in the category-user index
              },
            },
          },
        });

        // Extract the categories from the category-user index response
        const userCategories = categoryResponse.hits.hits.flatMap(
          (categoryHit) =>
            categoryHit._source.categories
              .split(",")
              .map((category) => category.trim())
        );

        const filteredUserCategories = [...new Set(userCategories)].join(", ");

        const mappedCategories = allCategories.map((category) => {
          if (filteredUserCategories.includes(category.id)) {
            return {
              id: category.id,
              name: category.name,
              type: category.type,
              created_at: category.created_at,
              isAllowed: true,
            };
          } else {
            return {
              id: category.id,
              name: category.name,
              type: category.type,
              created_at: category.created_at,
              isAllowed: false,
            };
          }
        });

        return {
          id: hit._id, // Include the document ID
          name: hit._source.name,
          email: hit._source.email,
          coid: hit._source.coid,
          uoid: hit._source.uoid,
          isAdmin: isAdmin,
          categories: mappedCategories,
        };
      })
    );

    // Sort documents to place admin users before non-admin users
    documents.sort((a, b) => b.isAdmin - a.isAdmin);

    res.status(200).json({
      message: `Fetched users from index "${indexName}".`,
      total: response.hits.total.value,
      documents: documents, // Return only document sources
    });
  } catch (error) {
    console.error("Error fetching users: ", error);
    res.status(500).json({
      error: "Failed to fetch users",
      details: error.message,
    });
  }
};

exports.getDocumentsWithCategoryId = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const categoryId = req.query.categoryId;

  if (!categoryId) {
    return res.status(400).json({ message: "Category ID is required" });
  }

  try {
    const filter = `category eq '${categoryId}'`; // Filter documents by category ID

    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/search?api-version=2021-04-30-Preview`,
      {
        search: "*", // Using wildcard to retrieve all documents in the index
        filter: filter,
        searchMode: "any",
        queryType: "simple",
        top: 1000, // Adjust as needed, or implement pagination for larger datasets
        count: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    res.status(200).json({
      message: `Fetched documents from Azure AI Service ${indexName} for category ${categoryId}.`,
      total: response.data.value.length,
      documents: response.data.value, // Return only document sources
    });
  } catch (error) {
    console.error(
      "Error retrieving documents:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      message: "Failed to retrieve documents",
      error: error.message,
    });
  }
};

exports.addNewDocumentWithCategoryId = async (req, res) => {
  const indexName = ("tenant_" + req.coid).toLowerCase();
  const { title, description, image, content, categoryId } = req.body;

  if (!title || !description || !content || !categoryId) {
    return res.status(400).json({
      message: "Fields (title, description, content, categoryId) are required",
    });
  }

  try {
    // Construct the document object
    const document = {
      // Assuming you are using an ID; otherwise, Azure Search can generate one for you
      id: `${indexName}-${Date.now()}`, // Unique ID for the document (or specify your own)
      title: title,
      description: description,
      image: !!image ? image : "https://randomuser.me/api/portraits/men/1.jpg",
      content: content,
      category: categoryId, // Add the category ID here
    };

    // Send the document to Azure Cognitive Search
    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=2021-04-30-Preview`,
      {
        value: [
          {
            ...document,
            "@search.action": "upload", // Use "upload" to add a new document or overwrite if it exists
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    res.status(200).json({
      message: `Document added successfully to index ${indexName}.`,
      documentId: document.id,
      data: response.data, // Return the response from Azure Search for confirmation
    });
  } catch (error) {
    console.error(
      "Error adding document to index:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      message: "Failed to add document to index",
      error: error.message,
    });
  }
};

exports.getDocumentById = async (req, res) => {
  const indexName = `tenant_${req.coid.toLowerCase()}`; // Adjust the index name if necessary
  const documentId = req.params.documentId; // Get the document ID from the request parameters

  try {
    // Send a GET request to Azure Cognitive Search to fetch the document by its ID
    const response = await axios.get(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/${documentId}?api-version=2021-04-30-Preview`,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    // Respond with the document data
    res.status(200).json({
      message: `Document retrieved successfully for ID: ${documentId}`,
      document: response.data,
    });
  } catch (error) {
    console.error("Error retrieving document: ", error);
    res.status(500).json({
      error: "Failed to retrieve document",
      details: error.response ? error.response.data : error.message,
    });
  }
};

exports.getAllDataSourceTypes = async (req, res) => {
  let coid = req.coid;
  let indexName = "datasourcetypes" + "_" + coid.toLowerCase();

  const searchQuery = {
    index: indexName,
    body: {
      query: {
        match_all: {},
      },
    },
  };

  // Get all data source types
  const response = await client.search(searchQuery);

  res.status(200).json({
    message: "Retrieved data source types",
    total: response.hits.total.value,
    data: response.hits.hits.map((hit) => {
      return hit._source.name;
    }),
  });
};

exports.syncGoogleDrive = async (req, res) => {
  const { gc_accessToken, gc_refreshToken, client_id, client_secret, name, type } = req.body;

  const webhookUrl = "https://es-services.onrender.com/api/v1/sync-google-drive/webhook";

  // Initialize Google Drive API Client
  const auth = new google.auth.OAuth2(client_id, client_secret);

  if (!name || !type) {
    return res.status(400).json({
      message: "Data Source name and type must be set.",
    });
  }

  const checkExistOfGoogleDriveConfigResponse = await checkExistOfGoogleDriveConfig(client_id, req.coid);

  console.log("Check Exist of Google Drive Response => ", checkExistOfGoogleDriveConfigResponse);

  if (checkExistOfGoogleDriveConfigResponse === "configuration is not existed") {
    const esNewCategoryResponse = await axios.post(
      "https://es-services.onrender.com/api/v1/category",
      {
        name: name,
        type: type,
      },
      {
        headers: {
          Authorization: req.headers["authorization"],
          "Content-Type": "application/json",
        },
      }
    );

    const newCategoryId = esNewCategoryResponse.data.elasticsearchResponse._id;

    // Immediately return the response
    res.status(200).json({
      message: "Sync request received. Processing in background.",
      categoryId: newCategoryId,
    });

    // Continue processing in the background asynchronously using setImmediate
    setImmediate(async () => {
      try {
        auth.setCredentials({ access_token: gc_accessToken });
        await auth.getAccessToken(); // Validate token

        const drive = google.drive({ version: "v3", auth });

        const filesResponse = await drive.files.list({
          q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
          fields: "files(id, name, mimeType, modifiedTime)",
        });

        const files = filesResponse.data.files;

        const fileData = await fetchAllFileContents(files, newCategoryId, drive);

        const registerWebhookRes = await registerWebhook(gc_accessToken, gc_refreshToken, webhookUrl, newCategoryId, client_id, client_secret, req.coid);

        if (fileData.length > 0) {
          const syncResponse = await pushToAzureSearch(fileData, req.coid);
          console.log("File Data => ", fileData);
        } else {
          console.log("No valid files to sync.");
        }
      } catch (tokenError) {
        console.error("Access token expired. Refreshing token...");
        const refreshedToken = await refreshAccessToken(client_id, client_secret, gc_refreshToken);
        accessToken = refreshedToken.access_token;

        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const filesResponse = await drive.files.list({
          q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
          fields: "files(id, name, mimeType, modifiedTime)",
        });

        const files = filesResponse.data.files;

        const fileData = await fetchAllFileContents(files, newCategoryId, drive);

        const registerWebhookRes = await registerWebhook(accessToken, gc_refreshToken, webhookUrl, newCategoryId, client_id, client_secret, req.coid);

        if (fileData.length > 0) {
          const syncResponse = await pushToAzureSearch(fileData, req.coid);
          console.log("File Data : ", fileData);
        } else {
          console.log("No valid files to sync.");
        }
      }

      //   const ws = new WebSocket("ws://localhost:8080");

      //   // Send the message to the websocket server
      //   ws.onopen = () => {
      //     // Send a message to the server to sync google drive documents
      //     ws.send(JSON.stringify({
      //       gc_accessToken: gc_accessToken,
      //       gc_refreshToken: gc_refreshToken,
      //       client_id: client_id,
      //       client_secret: client_secret,
      //       categoryId: newCategoryId,
      //       coid: req.coid,
      //     }));
      //   }

      //   ws.onmessage = (event) => {
      //     const message = JSON.parse(event.data);
      //     console.log("Received message: ", message);
      //   }
    });
  } else if (checkExistOfGoogleDriveConfigResponse === "configuration is already existed") {
    return res.status(200).json({
      data: "This Google Drive is already configured."
    });
  }
};

exports.googleDriveWebhook = async (req, res) => {
  const resourceId = req.headers["x-goog-resource-id"];
  const resourceState = req.headers["x-goog-resource-state"];
  const changedFileId = req.headers["x-goog-changed-file-id"];

  console.log("Webhook notification received:", {
    resourceId,
    resourceState,
    changedFileId,
  });

  try {
    const webhookDetails = await getWebhookDetailsByResourceId(resourceId);

    if (!webhookDetails) {
      console.error("No webhook details found for resource ID:", resourceId);
      return res.status(400).send("Webhook details not found.");
    }

    const {
      categoryId,
      coid,
      gc_accessToken,
      refreshToken,
      webhookExpiry,
      webhookUrl,
      startPageToken,
      client_id,
      client_secret,
    } = webhookDetails;

    let accessToken = gc_accessToken;

    // Google Auth Client
    const auth = new google.auth.OAuth2(client_id, client_secret);

    try {
      auth.setCredentials({ access_token: gc_accessToken });
      console.log("GC Access Token => ", gc_accessToken);
      await auth.getAccessToken(); // Validate token

      if (!changedFileId) {
        console.log("No specific file ID provided. Fetching changes...");
        const { changes, newPageToken } = await fetchGoogleDriveChanges(auth, startPageToken);

        for (const change of changes) {
          // Check if the file is trashed
          if (change.file && change.file.trashed) {
            console.log(`Skipping trashed file: ${change.file.name} (${change.file.id})`);
            continue; // Skip this iteration for trashed files
          }

          if (change.fileId) {
            console.log(`Processing fileId: ${change.fileId}`);
            const fileData = await fetchFileData(change.fileId, categoryId, accessToken);
            console.log("File Data => ", fileData);
            if (fileData) {
              await pushToAzureSearch([fileData], coid);
            }
          }
        }

        // Save new startPageToken
        await saveWebhookDetails(
          resourceId,
          categoryId,
          coid,
          accessToken,
          refreshToken,
          webhookExpiry,
          webhookUrl,
          newPageToken,
          client_id,
          client_secret
        );
      } else {
        console.log(`Processing specific fileId: ${changedFileId}`);
        const fileData = await fetchFileData(changedFileId, categoryId, accessToken);
        if (fileData) {
          await pushToAzureSearch([fileData], coid);
        }
      }
    } catch (tokenError) {
      console.error("Access token expired. Refreshing token...");
      try {
        const refreshedToken = await refreshAccessToken(client_id, client_secret, refreshToken);
        accessToken = refreshedToken.access_token;
        console.log("Refreshed Access Token => ", accessToken);

        // Update token details in the database
        await saveWebhookDetails(
          resourceId,
          categoryId,
          coid,
          accessToken,
          refreshToken,
          webhookExpiry,
          webhookUrl,
          startPageToken,
          client_id,
          client_secret
        );

        auth.setCredentials({ access_token: accessToken });

        if (!changedFileId) {
          console.log("No specific file ID provided. Fetching changes...");
          const { changes, newPageToken } = await fetchGoogleDriveChanges(auth, startPageToken);

          for (const change of changes) {
            // Check if the file is trashed
            if (change.file && change.file.trashed) {
              console.log(`Skipping trashed file: ${change.file.name} (${change.file.id})`);
              continue; // Skip this iteration for trashed files
            }

            if (change.fileId) {
              console.log(`Processing fileId: ${change.fileId}`);
              const fileData = await fetchFileData(change.fileId, categoryId, accessToken);
              if (fileData) {
                await pushToAzureSearch([fileData], coid);
              }
            }
          }

          // Save new startPageToken
          await saveWebhookDetails(
            resourceId,
            categoryId,
            coid,
            accessToken,
            refreshToken,
            webhookExpiry,
            webhookUrl,
            newPageToken,
            client_id,
            client_secret
          );
        } else {
          console.log(`Processing specific fileId: ${changedFileId}`);
          const fileData = await fetchFileData(changedFileId, categoryId, accessToken);
          if (fileData) {
            await pushToAzureSearch([fileData], coid);
          }
        }
      } catch (refreshError) {
        console.error("Failed to refresh access token:", refreshError.message);
        return res.status(401).send("Failed to refresh access token.");
      }
    }

    res.status(200).send("Webhook notification handled successfully.");
  } catch (error) {
    console.error("Error handling webhook notification:", error.message);
    res.status(500).send("Failed to handle webhook notification.");
  }
};

exports.monitorToolRoutes = (req, res) => {
  res.status(200).json({
    message: "Successful Monitor Tool Test",
  });
};

exports.testWebhookTokenExpiration = (req, res) => {
  const { client_id, redirect_uri } = req.body;

  if (!client_id || !redirect_uri) {
    return res.status(400).json({ error: "client_id and redirect_uri are required" });
  }

  const oauth2Client = new google.auth.OAuth2(client_id, null, redirect_uri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // This ensures a refresh_token is returned
    scope: ["https://www.googleapis.com/auth/drive"], // Scopes for accessing Google Drive
  });

  res.status(200).json({ authUrl });
};

exports.getTokens = async (req, res) => {
  const { client_id, client_secret, redirect_uri, code } = req.body;

  if (!client_id || !client_secret || !redirect_uri || !code) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

    const { tokens } = await oauth2Client.getToken(code);

    // Save tokens securely in your database or return them to the frontend
    res.status(200).json(tokens);
  } catch (error) {
    console.error("Error exchanging authorization code for tokens:", error.message);
    res.status(500).json({ error: "Failed to exchange authorization code for tokens" });
  }
};

exports.syncOneDrive = async (req, res) => {
  const {
    tenant_id,
    client_id,
    client_secret,
    datasourceName,
    datasourceType,
    userName,
  } = req.body;

  if (
    !tenant_id || !client_id || !client_secret || !datasourceName || !datasourceType
  ) {
    return res.status(400).json({
      error: "Missing required parameters"
    });
  }

  const graphBaseUrl = "https://graph.microsoft.com/v1.0";

  // const checkExistOfOneDriveConfigResponse = await checkExistOfOneDriveConfig(client_id, req.coid);
  const checkExistOfOneDriveConfigResponse = "configuration is not existed";
  console.log("Check Exist of One Drive Response => ", checkExistOfOneDriveConfigResponse);

  if (checkExistOfOneDriveConfigResponse === "configuration is not existed") {

    // Main function to sync data
    try {
      const accessToken = await getAccessToken(tenant_id, client_id, client_secret);

      // Create subscription and get expirationDateTime
      const subscription = await createOneDriveSubscription(accessToken, userName);
      const expirationDateTime = subscription.expirationDateTime;

      console.log("Expiration Time => ", expirationDateTime);

      // const esNewCategoryResponse = await axios.post(
      //   "https://es-services.onrender.com/api/v1/category",
      //   {
      //     name: datasourceName,
      //     type: datasourceType,
      //   },
      //   {
      //     headers: {
      //       Authorization: req.headers["authorization"],
      //       "Content-Type": "application/json",
      //     },
      //   }
      // );

      // const newCategoryId = esNewCategoryResponse.data.elasticsearchResponse._id;

      // Save the OneDrive connection with expirationDateTime
      // await registerOneDriveConnection({
      //   tenant_id: tenant_id,
      //   client_id: client_id,
      //   client_secret: client_secret,
      //   userName: userName,
      //   category: newCategoryId,
      //   coid: req.coid,
      //   expirationDateTime: expirationDateTime
      // });

      // const files = await getFilesFromOneDrive(accessToken, graphBaseUrl, userName);

      // const documents = [];
      // for (const file of files) {
      //   if (file) {
      //     try {
      //       const content = await fetchFileContentFromOneDrive(file, accessToken);
      //       if (content) {
      //         documents.push({
      //           id: file.id,
      //           title: file.name + " & " + file["@microsoft.graph.downloadUrl"] + " & " + file["webUrl"],
      //           content,
      //           // category: newCategoryId,
      //           description: `File from OneDrive: ${file.name}`
      //         })
      //       }
      //     } catch (error) {
      //       console.error(`Error processing file: ${file.name}`, error.message);
      //     }
      //   } else {
      //     console.error.log(`Skipping unsupported or folder: ${file.name}`);
      //   }
      // }

      // if (documents.length > 0) {
      //   // const azureResponse = await pushToAzureSearch(documents, req.coid);
      //   return res.status(200).json({
      //     message: "Sync successful",
      //     count: documents.length,
      //     uploaded: documents,
      //     // azureResponse
      //   });
      // } else {
      //   return res.status(200).json({
      //     message: "No valid files to sync."
      //   });
      // }
    } catch (error) {
      console.error("Error syncing OneDrive data: ", error.message);
      return res.status(500).json({
        error: 'Failed to sync OneDrive data'
      });
    }

  } else if (checkExistOfOneDriveConfigResponse === "configuration is already existed") {
    return res.status(200).json({
      data: "This one drive is already configured."
    });
  }

}

exports.oneDriveWebhook = async (req, res) => {
  const { value } = req.body;

  console.log("Received notification: ", value);

  if (value && value.length > 0) {
    const notification = value[0];

    if (notification.resource && notification.changeType) {
      const fileId = notification.resourceId;  // The file ID from the notification
      const changeType = notification.changeType; // Get the change type (created, updated, deleted)
      const userName = notification.resource.split('/')[0];  // Extract userName from the notification (adjust if needed)

      console.log(`File changed: ${fileId} with change type: ${changeType}`);

      try {
        const credentials = await getStoredCredentials(userName);  // Retrieve stored credentials from DB
        if (!credentials) {
          console.error("No credentials found for user:", userName);
          return res.status(404).send("User credentials not found");
        }

        const { tenant_id, client_id, client_secret, category } = credentials;
        const accessToken = await getAccessToken(tenant_id, client_id, client_secret);

        // Get the file details using the file ID
        const file = await getFileDetails(fileId, accessToken, userName);

        console.log("File details:", file); // Now you have the file metadata

        // Handle the change based on notification
        if (notification.changeType === 'updated' || notification.changeType === 'created') {
          const content = await fetchFileContentFromOneDrive(file, accessToken);
          await pushToAzureSearch([{
            id: file.id,
            title: file.name + " & " + file["@microsoft.graph.downloadUrl"] + " & " + file["webUrl"],
            content,
            category,
            description: `File from OneDrive: ${file.name}`
          }]);
          console.log(`Processed file: ${file.name}`);
        }

        return res.status(200).send("Notification processed");
      } catch (error) {
        console.error("Error processing notification:", error.message);
        return res.status(500).send("Failed to process notification");
      }
    }
  }

  // Respond with 202 to acknowledge receipt of the notification
  res.status(202).send("Notification received");
};

exports.syncMySQLDatabase = async (req, res) => {
  const {
    db_host,
    db_user,
    db_password,
    db_database,
    table_name,
    field_name,
    field_type,
    json_properties, // For JSON fields
    xml_paths, // For XML fields
    name,
    type
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: "Data source name and type must be set."
    });
  }

  const checkExistOfMySQLConfigResponse = await checkExistOfMySQLConfig(db_host, db_database, table_name, req.coid);

  if (checkExistOfMySQLConfigResponse === "MySQL configuration is not existed") {
    const esNewCategoryResponse = await axios.post(
      "https://es-services.onrender.com/api/v1/category",
      {
        name: name,
        type: type
      },
      {
        headers: {
          Authorization: req.headers["authorization"],
          "Content-Type": "application/json"
        }
      }
    );

    const newCategoryId = esNewCategoryResponse.data.elasticsearchResponse._id;

    const result = await fetchAndProcessFieldContentOfMySQL({
      host: db_host,
      user: db_user,
      password: db_password,
      database: db_database,
      table_name: table_name,
      field_name: field_name,
      field_type: field_type,
      json_properties: json_properties,
      xml_paths: xml_paths,
      category: newCategoryId
    });

    const fileData = result.data;
    const lastProcessedId = result.lastProcessedId;

    const registerMySQLConnectionRes = await registerMySQLConnection({
      host: db_host,
      user: db_user,
      password: db_password,
      database: db_database,
      table_name: table_name,
      field_name: field_name,
      field_type: field_type,
      category: newCategoryId,
      coid: req.coid,
      lastProcessedId: lastProcessedId,
    });

    if (fileData.length > 0) {
      const syncResponse = await pushToAzureSearch(fileData, req.coid);
      return res.status(200).json({
        message: "Sync Successful",
        data: syncResponse,
        mysql: registerMySQLConnectionRes
      });
    } else {
      return res.status(200).json({
        message: "No valid files to sync."
      })
    }
  } else {
    return res.status(200).json({
      data: "This MySQL server had been already configured."
    });
  }
}

exports.syncMongoData = async (req, res) => {
  const {
    mongodb_uri,
    db_name,
    collection_name,
    field_name,
    field_type,
    json_properties,
    xml_paths,
    name,
    type,
  } = req.body;

  // Ensure that the required parameters are sent in the request
  if (!mongodb_uri || !db_name || !collection_name) {
    return res.status(400).json({
      message: 'MongoDB URI, database name, and collection name must be provided.'
    });
  }

  if (!name || !type) {
    return res.status(400).json({
      message: "Data source name and type must be set."
    });
  }

  const checkExistofMongoDBConfigResponse = await checkExistOfMongoDBConfig(mongodb_uri, db_name, collection_name, req.coid);

  if (checkExistofMongoDBConfigResponse === "MongoDB configuration does not exist") {
    const esNewCategoryResponse = await axios.post(
      "https://es-services.onrender.com/api/v1/category",
      {
        name: name,
        type: type
      },
      {
        headers: {
          Authorization: req.headers["authorization"],
          "Content-Type": "application/json"
        }
      }
    );

    const newCategoryId = esNewCategoryResponse.data.elasticsearchResponse._id;

    const result = await fetchDataFromMongoDB({
      mongoUri: mongodb_uri,
      database: db_name,
      collection_name: collection_name,
      field_name: field_name,
      field_type: field_type,
      json_properties: json_properties,
      xml_paths: xml_paths,
      category: newCategoryId
    });

    const fileData = result.data;

    const registerMongoDBConnectionRes = await registerMongoDBConnection({
      mongoUri: mongodb_uri,
      database: db_name,
      collection_name: collection_name,
      field_name: field_name,
      field_type: field_type,
      category: newCategoryId,
      coid: req.coid
    });

    if (fileData.length > 0) {
      const syncResponse = await pushToAzureSearch(fileData, req.coid);
      return res.status(200).json({
        message: "Sync Successful",
        data: syncResponse,
        mongodb: registerMongoDBConnectionRes
      });
    } else {
      return res.status(200).json({
        message: "No valid files to sync."
      })
    }
  } else {
    return res.status(200).json({
      data: "This MongoDB server had been already configured."
    });
  }
}

exports.syncMSSQLDatabase = async (req, res) => {
  const {
    db_host,
    db_user,
    db_password,
    db_database,
    table_name,
    field_name,
    field_type,
    json_properties, // For JSON fields
    xml_paths, // For XML fields
    name,
    type,
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: "Data source name and type must be set.",
    });
  }

  const checkExistOfMSSQLConfigResponse = await checkExistOfMSSQLConfig(db_host, db_database, table_name, field_name, req.coid);

  if (checkExistOfMSSQLConfigResponse === "MSSQL configuration does not exist") {
    try {
      // Step 1: Create a new category in Elastic Search
      const esNewCategoryResponse = await axios.post(
        "https://es-services.onrender.com/api/v1/category",
        {
          name: name,
          type: type,
        },
        {
          headers: {
            Authorization: req.headers["authorization"],
            "Content-Type": "application/json",
          }
        }
      );

      const newCategoryId = esNewCategoryResponse.data.elasticsearchResponse._id;

      // Step 2: Fetch and process data from MSSQL
      const result = await fetchAndProcessFieldContent({
        db_host,
        db_user,
        db_password,
        db_database,
        table_name,
        field_name,
        field_type,
        json_properties,
        xml_paths,
        category: newCategoryId,
      });

      const fileData = result;

      // Step 3: Save MSSQL connection details to Elastic Search
      await saveMSSQLConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
        table_name: table_name,
        field_name: field_name,
        field_type: field_type,
        category: newCategoryId,
        coid: req.coid
      });

      // Step 4: Push processed data to Azure Search
      if (fileData.length > 0) {
        const syncResponse = await pushToAzureSearch(fileData, req.coid);
        return res.status(200).json({
          message: "Sync Successful",
          count: fileData.length,
          data: syncResponse,
        });
      } else {
        return res.status(200).json({
          message: "No valid data to sync.",
        });
      }
    } catch (error) {
      console.error("Error during MSSQL Sync:", error.message);
      return res.status(500).json({
        message: "MSSQL Sync failed",
        error: error.message,
      });
    }
  } else {
    return res.status(200).json({
      data: "This MSSQL server had been already configured."
    });
  }
}

exports.syncDataFromDatasources = async (req, res) => {
  if (!req.query.type) {
    return res.status(400).json({
      message: "Data source type must be set."
    });
  }

  const dataSource_type = req.query.type;
  let dataSourceSyncResponse;

  try {
    switch (dataSource_type) {
      case "googledrive":
        dataSourceSyncResponse = await axios.post(
          "https://es-services.onrender.com/api/v1/sync-google-drive",
          {
            ...req.body,
            type: "Google Drive"
          },
          {
            headers: {
              Authorization: req.headers["authorization"],
              "Content-Type": "application/json"
            }
          }
        );
        break;

      case "onedrive":
        dataSourceSyncResponse = await axios.post(
          "https://es-services.onrender.com/api/v1/sync-one-drive",
          {
            ...req.body,
            datasourceType: "OneDrive"
          },
          {
            headers: {
              Authorization: req.headers["authorization"],
              "Content-Type": "application/json"
            }
          }
        );
        break;

      case "sql":
        dataSourceSyncResponse = await axios.post(
          "https://es-services.onrender.com/api/v1/mysql",
          {
            ...req.body,
            type: "SQL Database"
          },
          {
            headers: {
              Authorization: req.headers["authorization"],
              "Content-Type": "application/json"
            }
          }
        );
        break;

      case "nosql":
        dataSourceSyncResponse = await axios.post(
          "https://es-services.onrender.com/api/v1/mongodb",
          {
            ...req.body,
            type: "NoSQL Database"
          },
          {
            headers: {
              Authorization: req.headers["authorization"],
              "Content-Type": "application/json"
            }
          }
        );
        break;

      case "mssql":
        dataSourceSyncResponse = await axios.post(
          "https://es-services.onrender.com/api/v1/mssql",
          {
            ...req.body,
            type: "MSSQL"
          },
          {
            headers: {
              Authorization: req.headers["authorization"],
              "Content-Type": "application/json"
            }
          }
        );
        break;

      default:
        return res.status(400).json({
          message: "Unsupported data source type."
        });
    }

    return res.status(200).json({
      message: "Sync Successful",
      data: dataSourceSyncResponse.data
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Sync failed",
      error: error.message || error
    });
  }
};

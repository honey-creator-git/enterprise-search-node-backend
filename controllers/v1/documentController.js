const {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
} = require("@azure/search-documents");
const generateEmbedding = require("../../embedding").generateEmbedding;
const client = require("../../config/elasticsearch");
const axios = require("axios");
require("dotenv").config();

const searchIndexClient = new SearchIndexClient(
  process.env.AZURE_SEARCH_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

// Controller to add a new document to an index
exports.addDocument = async (req, res) => {
  const indexName = req.params.indexName?.toLowerCase(); // Get the index name from the URL parameter
  const document = req.body; // Get the document data from the request body

  const searchClientForNewDocument = new SearchClient(
    process.env.AZURE_SEARCH_ENDPOINT,
    indexName,
    new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
  );

  try {
    // Check if the nidex exists before attempting to add a document
    const esExists = await client.indices.exists({
      index: indexName,
    });

    if (!esExists) {
      await client.indices.create({
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
    }

    // Check if the Azure Cognitive Search index exists
    const azExists = await searchIndexClient
      .getIndex(indexName)
      .catch(() => null);

    if (!azExists) {
      // Define Azure Cognitive Search index schema
      const indexSchema = {
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
          {
            name: "image",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            sortable: false,
          },
        ],
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
      };

      await searchIndexClient.createIndex(indexSchema);
    }

    // Add the document to the specified index
    const esResponse = await client.index({
      index: indexName,
      body: document,
    });

    // Add the document to Azure Cognitive Search
    const azDocument = {
      ...document,
      id: esResponse._id.slice(1), // Assign Elasticsearch document ID as the Azure document ID
    };
    const azResponse = await searchClientForNewDocument.uploadDocuments([
      azDocument,
    ]);

    res.status(201).json({
      message: `Document added to both Elasticsearch and Azure Cognitive Search indexes successfully.`,
      elasticsearchResponse: esResponse,
      azureResponse: azResponse,
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
    if (userCategories.length === 0) {
      return res.status(200).json({
        message: "No categories found for the user",
        results: [],
      });
    } else {
      filter_of_category = userCategories
        .map((category) => `category eq '${category}'`)
        .join(" or ");

      if (filter.length === 0) {
        filter = filter_of_category;
      } else if (filter.length > 0) {
        filter = filter + " and " + filter_of_category;
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
  const tenantId = ("tenant_" + req.coid).toLowerCase();

  try {
    // Search for categories with the specified tenantId
    const response = await client.search({
      index: `categories_${req.coid.toLowerCase()}`, // Name of your index
      body: {
        query: {
          term: {
            tenantId: tenantId, // Filter by tenantId
          },
        },
      },
    });

    // Extract the categories from the response
    const categories = response.hits.hits.map((hit) => ({
      id: hit._id,
      name: hit._source.name,
    }));

    res.status(200).json({
      message: `Categories retrieved successfully for tenantId: ${tenantId}`,
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

exports.decodeUserTokenAndSave = async (req, res) => {
  const indexName = `users_${req.coid.toLowerCase()}`;
  const categoryIndexName = `category_user_${req.coid.toLowerCase()}`;

  const name = req.name;
  const email = req.email;
  const coid = req.coid;
  const uoid = req.userId;
  const groups = req.groups;
  const permissions = req.permissions;
  let esResponse;

  // const searchClientForNewDocument = new SearchClient(
  //   process.env.AZURE_SEARCH_ENDPOINT,
  //   indexName,
  //   new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
  // );

  try {
    // Search for categories with the specified tenantId
    const response = await client.search({
      index: `categories_${req.coid.toLowerCase()}`, // Name of your index
      body: {
        query: {
          term: {
            tenantId: `tenant_${req.coid.toLowerCase()}`, // Filter by tenantId
          },
        },
      },
    });

    // Extract the categories from the response
    const categories = await Promise.all(
      response.hits.hits.map((hit) => ({
        id: hit._id,
        name: hit._source.name,
      }))
    );

    const defaultCategory = categories[0].id;

    // Check if the user already exists in the index
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          match: { uoid: uoid },
        },
      },
    });

    if (searchResponse.hits.total.value > 0) {
      // Use exists, so update their values
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
      // Add the document to the Elastic Search index
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

    // Check if the user category exists in the category_user index
    const categorySearchResponse = await client.search({
      index: categoryIndexName,
      body: {
        query: {
          match: { user: uoid },
        },
      },
    });

    if (categorySearchResponse.hits.total.value === 0) {
      // No category found for the user, so create a new document with a default category
      categoryResponse = await client.index({
        index: categoryIndexName,
        body: {
          user: uoid,
          categories: defaultCategory,
        },
      });
    }

    // const azDocument = {
    //   id: esResponse._id.slice(1),
    //   name: name,
    //   email: email,
    //   coid: coid,
    //   uoid: uoid,
    //   groups: groups,
    //   permissions: permissions,
    // };

    // Add the document to the Azure Cognitive Search
    // const azResponse = await searchClientForNewDocument.uploadDocuments([
    //   azDocument,
    // ]);

    res.status(201).json({
      message: `user information saved to both Elasticsearch and Azure Cognitive Search indexes successfully.`,
      elasticsearchResponse: esResponse,
      // azureResponse: azResponse,
    });
  } catch (error) {
    console.error("Error saving user: ", error);
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
      index: `categories_${req.coid.toLowerCase()}`, // Name of your index
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
              isAllowed: true,
            };
          } else {
            return {
              id: category.id,
              name: category.name,
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
          categories: mappedCategories,
        };
      })
    );

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

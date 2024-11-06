const client = require("../../config/elasticsearch");
const axios = require("axios");
const searchClient = require("../../config/cognitivesearch");
const generateEmbedding = require("../../embedding").generateEmbedding;
require("dotenv").config();

// Controller to add a new document to an index
exports.addDocument = async (req, res) => {
  const indexName = req.params.indexName.toLowerCase(); // Get the index name from the URL parameter
  const document = req.body; // Get the document data from the request body

  try {
    // Check if the nidex exists before attempting to add a document
    const exists = await client.indices.exists({
      index: indexName,
    });

    if (!exists) {
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
      // return res.status(404).json({
      //   message: `Index "index_${indexName}_documents" does not exists.`,
      // });
    }

    // Add the document to the specified index
    const response = await client.index({
      index: indexName,
      body: document,
    });

    console.log("Response => ", response);

    res.status(201).json({
      message: `Document added to index ${indexName} successfully.`,
      documentId: response._id,
      response: response,
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
  const indexName = req.params.indexName.toLowerCase();
  const documentId = req.params.documentId;

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
  const indexName = req.params.indexName.toLowerCase();
  const documentId = req.params.documentId;
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

// Controller to delete a document by ID from an index
exports.deleteDocument = async (req, res) => {
  const indexName = req.params.indexName.toLowerCase();
  const documentId = req.params.documentId;

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

// Controller to search documents with various filters and query options
exports.searchDocuments = async (req, res) => {
  const indexName = req.params.indexName.toLowerCase();
  const { keyword, query, fuzziness = "AUTO" } = req.body;

  try {
    // Construct the search query
    const searchQuery = {
      index: indexName,
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

    // Add query filters if provided
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

    // Execute the search query
    const response = await client.search(searchQuery);

    res.status(200).json({
      message: "Search completed successfully",
      total: response.hits.total.value,
      results: response.hits.hits.map((hit) => hit._source), // Return only document sources
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
  const { keyword, query, fuzziness = "AUTO" } = req.body; // Get keyword, query, and fuzziness from request body

  try {
    // Construct the search query
    const searchQuery = {
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

    // Execute the search query
    const response = await client.search(searchQuery);

    res.status(200).json({
      message: "Search across all indices completed successfully",
      total: response.hits.total.value,
      results: response.hits.hits.map((hit) => hit._source), // Return only document sources
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
  const indexName = req.params.indexName.toLowerCase();
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
      documents: response.hits.hits.map((hit) => hit._source), // Return only document sources
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

    res.status(200).json({
      message: "Retrieved documents from all indices.",
      total: response.hits.total.value,
      documents: response.hits.hits.map((hit) => ({
        index: hit._index, // Include the index name for each document
        id: hit._id, // Include the document ID
        source: hit._source, // Document source data
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

exports.semanticSearch = async (req, res) => {
  const query = req.body.query;
  const indexName = req.params.indexName.toLowerCase();

  console.log("Query => ", query);
  console.log("Index Name => ", indexName);
  try {
    // Generate embedding for the query text
    generateEmbedding(query).then((res) => {
      console.log("Query Embedding => ", res);
    });

    // Perform semantic search in Elasticsearch
    // const results = await semanticSearchService(
    //   "index_" + indexName + "_documents",
    //   queryEmbedding
    // );
    // res.send(results);
  } catch (error) {
    console.error("Semantic search failed:", error);
    res.status(500).send({ error: "Semantic search failed" });
  }
};

exports.syncElasticSearchAzureAiSearch = async (req, res) => {
  const indexName = req.params.indexName.toLowerCase();
  const from = 0;
  const size = 10000;

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
      console.log(
        `Fetched ${response.hits.hits.length} documents from Elasticsearch`
      );

      const docs = response.hits.hits.map((hit) => ({
        "@search.action": "upload", // Required action for Azure Search API
        id: hit._id, // Primary key in your Azure index
        title: hit._source.title, // Example field - adjust as per your schema
        description: hit._source.description,
        content: hit._source.content,
        image: hit._source.image,
      }));

      if (docs.length > 0) {
        const batch = docs.map((doc) => ({
          ...doc,
          "@search.action": "upload", // Ensures Azure Search treats this as an upload operation
        }));

        const resultOf = await searchClient.uploadDocuments(batch);
        console.log(
          `Uploaded ${batch.length} documents to Azure Search`,
          resultOf
        );

        res.status(200).json({
          message: `Fetched documents from index ${indexName} and stored to azure AI index ${process.env.AZURE_SEARCH_INDEX_NAME}.`,
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
  let filter = "";
  let filter_of_title = "";
  let filter_of_description = "";
  let filter_of_content = "";
  const query = req.body.query;
  const title = req.body.title ? req.body.title : "";
  const description = req.body.description ? req.body.description : "";
  const content = req.body.content ? req.body.content : "";

  console.log("Title => ", req.body.title);
  console.log("Content => ", req.body.content);
  console.log("Description => ", req.body.description);

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
    const response = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${process.env.AZURE_SEARCH_INDEX_NAME}/docs/search?api-version=2021-04-30-Preview`,
      {
        search: query, // The search query
        filter: filter, // Add filter query here
        searchMode: "any", // Allows matching on any term within the query
        queryType: "simple", // Enables full query parsing for complex queries
        top: 10, // Number of results to return
        count: true, // Return count of results
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    console.log("Documents retrieved:", response.data);
    res.status(200).json({
      message: `Fetched documents from Azure AI Service ${process.env.AZURE_SEARCH_INDEX_NAME}.`,
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

const client = require("../../config/elasticsearch");

// Controller to add a new document to an index
exports.addDocument = async (req, res) => {
  const indexName = req.params.indexName; // Get the index name from the URL parameter
  const document = req.body; // Get the document data from the request body

  try {
    // Check if the nidex exists before attempting to add a document
    const exists = await client.indices.exists({
      index: "index_" + indexName + "_documents",
    });

    if (!exists) {
      await client.indices.create({
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
      // return res.status(404).json({
      //   message: `Index "index_${indexName}_documents" does not exists.`,
      // });
    }

    // Add the document to the specified index
    const response = await client.index({
      index: "index_" + indexName + "_documents",
      body: document,
    });

    console.log("Response => ", response);

    res.status(201).json({
      message: `Document added to index "index_${indexName}_documents" successfully.`,
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
  const indexName = req.params.indexName;
  const documentId = req.params.documentId;

  try {
    const response = await client.get({
      index: "index_" + indexName + "_documents",
      id: documentId,
    });

    res.status(200).json({
      message: `Document retrieved successfully from index "index_${indexName}_documents".`,
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
  const indexName = req.params.indexName;
  const documentId = req.params.documentId;
  const updatedFields = req.body;

  try {
    const exists = await client.exists({
      index: "index_" + indexName + "_documents",
      id: documentId,
    });

    if (!exists) {
      return res.status(404).json({
        message: `Document with ID "${documentId}" does not exist in index "index_${indexName}_documents".`,
      });
    }

    const response = await client.update({
      index: "index_" + indexName + "_documents",
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
  const indexName = req.params.indexName;
  const documentId = req.params.documentId;

  try {
    const response = await client.delete({
      index: "index_" + indexName + "_documents",
      id: documentId,
    });

    res.status(200).json({
      message: `Document with ID "${documentId}" deleted successfully from index "index_${indexName}_documents".`,
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
  const indexName = req.params.indexName;
  const { keyword, query, fuzziness = "AUTO" } = req.body;

  try {
    // Construct the search query
    const searchQuery = {
      index: "index_" + indexName + "_documents",
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
  const indexName = req.params.indexName;
  const from = parseInt(req.query.from, 10) || 0; // Default to 0 if not provided
  const size = parseInt(req.query.size, 10) || 10; // Default to 10 if not provided

  try {
    // Construct the search query to match all documents
    const searchQuery = {
      index: "index_" + indexName + "_documents",
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
  const size = parseInt(req.query.size, 10) || 10; // Default to 10 if not provided

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

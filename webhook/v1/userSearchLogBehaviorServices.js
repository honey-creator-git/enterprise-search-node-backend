const axios = require("axios");
const client = require("./../../config/elasticsearch");

async function logSearchActivity(coid, userId, query, clickedDocumentId) {
  try {
    // Add the new log to the Elasticsearch index
    const response = await client.index({
      index: `search_logs_${coid.toLowerCase()}`, // Elasticsearch index name
      body: {
        userId: userId,
        query: query,
        clickedDocumentId: clickedDocumentId,
        timestamp: new Date().toISOString(), // Current timestamp
      },
    });

    console.log("Search activity logged successfully:", response);
  } catch (error) {
    console.error("Error logging search activity:", error.message);
  }
}

async function updateAzureSearchDocument(documentId, indexName) {
  try {
    // Step 1: Retrieve the document
    const response = await axios.get(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs('${documentId}')?api-version=2023-07-01-Preview`,
      {
        headers: {
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    const document = response.data;

    // Step 2: Prepare only the fields to update
    const updatedFields = {
      id: documentId, // ID is required for the update
      searchCount: (document.searchCount || 0) + 1,
      clickCount: (document.clickCount || 0) + 1,
      lastViewedAt: new Date().toISOString(),
    };

    // Step 3: Send update request with only the updated fields
    await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=2023-07-01-Preview`,
      {
        value: [
          {
            ...updatedFields,
            "@search.action": "mergeOrUpload", // Merge or create the document
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

    console.log("Document updated successfully in Azure AI Search index!");
  } catch (error) {
    console.error(
      "Failed to update document in Azure AI Search:",
      error.message
    );
  }
}

module.exports = {
  logSearchActivity,
  updateAzureSearchDocument,
};

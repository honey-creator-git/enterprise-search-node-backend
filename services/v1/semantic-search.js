// services/elasticsearch.js
const esClient = require("../../config/elasticsearch");

// Semantic search function
async function semanticSearch(index, queryEmbedding) {
  const { body } = await esClient.search({
    index,
    body: {
      query: {
        script_score: {
          query: { match_all: {} }, // Match all documents and score based on similarity
          script: {
            source:
              "cosineSimilarity(params.query_vector, 'content_vector') + 1.0", // Adjust 'content_vector' to match your field
            params: {
              query_vector: queryEmbedding,
            },
          },
        },
      },
    },
  });

  return body.hits.hits; // Return search results
}

module.exports = {
  semanticSearch,
};

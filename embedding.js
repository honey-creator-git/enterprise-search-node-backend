// update_embeddings.js
const client = require("./config/elasticsearch");
const axios = require("axios");
require("dotenv").config();

// Function to generate embeddings
async function generateEmbedding(text) {
  const response = await axios.post(
    process.env.EMBEDDING_API_URL,
    {
      inputs: {
        sentences: [text],
        source_sentence: text,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("Full response from API:", response.data);

  const embedding = response.data;

  // Check if embedding has the expected 768 dimensions
  if (Array.isArray(embedding) && embedding.length === 768) {
    return embedding;
  } else {
    console.error(
      "Error: Embedding dimension mismatch or unexpected response structure."
    );
    throw new Error(
      "Embedding dimension mismatch or unexpected response structure"
    );
  }
}

// Function to update document with embeddings
async function updateDocumentWithEmbeddings(document) {
  const { _id, _source } = document;
  const { title, content, description } = _source;

  console.log("Title => ", title);
  console.log("Content => ", content);
  console.log("Description => ", description);

  const titleEmbedding = await generateEmbedding(title);
  const contentEmbedding = await generateEmbedding(content);
  const descriptionEmbedding = await generateEmbedding(description);

  await client.update({
    index: "index_cjr0l3l2hmuwl4yv7_documents",
    id: _id,
    body: {
      doc: {
        title_vector: titleEmbedding,
        content_vector: contentEmbedding,
        description_vector: descriptionEmbedding,
      },
    },
  });
}

// Fetch documents and update embeddings
async function updateAllDocuments() {
  const body = await client.search({
    index: "index_cjr0l3l2hmuwl4yv7_documents",
    size: 1000, // Adjust size based on your requirements
    _source: ["title", "content", "description"],
  });

  const documents = body.hits.hits;
  for (const doc of documents) {
    await updateDocumentWithEmbeddings(doc);
    console.log(`Updated document with ID: ${doc._id}`);
  }
  console.log("All documents updated with embeddings");
}

// updateAllDocuments().catch(console.error);

module.exports = { generateEmbedding };

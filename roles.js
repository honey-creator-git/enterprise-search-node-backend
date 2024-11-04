// roles.js

const roles = {
  admin: {
    can: [
      "createIndex",
      "deleteIndex",
      "getAllDocuments",
      "listIndices",
      "updateIndex",
      "addDocument",
      "updateDocument",
      "deleteDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
      "getAllDocumentAcrossAllIndices",
      "searchDocumentsAcrossAllIndices",
    ],
  },
  manager: {
    can: [
      "createIndex",
      "getAllDocuments",
      "listIndices",
      "updateIndex",
      "addDocument",
      "updateDocument",
      "deleteDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
    ],
  },
  editor: {
    can: [
      "addDocument",
      "updateDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
  viewer: {
    can: [
      "searchDocuments",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
};

module.exports = roles;

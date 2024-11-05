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
      "getDocument",
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
      "getDocument",
      "getAllDocumentFromIndex",
    ],
  },
  editor: {
    can: [
      "addDocument",
      "updateDocument",
      "searchDocuments",
      "getDocument",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
  viewer: {
    can: [
      "searchDocuments",
      "getDocument",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
};

module.exports = roles;

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
      "getDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
      "getAllDocumentsAcrossIndices",
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
      "getDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
    ],
  },
  editor: {
    can: [
      "addDocument",
      "updateDocument",
      "getDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
  viewer: {
    can: [
      "getDocument",
      "searchDocuments",
      "getAllDocumentFromIndex",
      "listIndices",
    ],
  },
};

module.exports = roles;

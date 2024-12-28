const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();

// Initialize Azure Blob Storage Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_BLOB_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_BLOB_CONTAINER_NAME
);

// Function to upload file to Azure Blob Storage
async function uploadFileToBlob(fileBuffer, fileName) {
  const blobClient = containerClient.getBlockBlobClient(fileName);
  await blobClient.upload(fileBuffer, fileBuffer.length);
  return blobClient.url; // Return the URL to access the file
}

module.exports = {
  uploadFileToBlob,
};

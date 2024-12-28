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

// Function to upload file to Azure Blob Storage for Google Drive
async function uploadFileToBlobForGoogleDrive(
  fileBuffer,
  fileName,
  contentLength,
  mimeType
) {
  try {
    // Validate contentLength
    if (typeof contentLength !== "number" || contentLength <= 0) {
      throw new Error(
        `Invalid content length: ${contentLength} for file ${fileName}`
      );
    }

    const blobClient = containerClient.getBlockBlobClient(fileName);

    // Set HTTP headers with the correct Content-Type
    const options = {
      blobHTTPHeaders: {
        blobContentType: mimeType, // Set MIME type to allow preview in the browser
      },
    };

    // Upload the file with metadata
    await blobClient.upload(fileBuffer, contentLength, options); // Specify content length
    return blobClient.url; // Return the URL to access the file
  } catch (error) {
    console.error("Failed to upload file to Azure Blob Storage:", error);
    throw new Error("Failed to upload file");
  }
}

module.exports = {
  uploadFileToBlob,
  uploadFileToBlobForGoogleDrive,
};

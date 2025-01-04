const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();

// Initialize Azure Blob Storage Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_BLOB_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_BLOB_CONTAINER_NAME
);

function generatePreviewUrl(fileUrl, mimeType) {
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // DOCX
    mimeType === "application/msword" || // DOC
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // XLSX
    mimeType === "application/vnd.ms-excel" || // XLS
    mimeType === "application/x-cfb" || // Old XLS
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" // PPTX
  ) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
      fileUrl
    )}`;
  } else if (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/xml" ||
    mimeType === "text/xml" ||
    mimeType === "text/html"
  ) {
    return fileUrl; // Directly accessible in the browser
  } else {
    return fileUrl; // Default to download for unsupported types
  }
}

// Function to upload file to Azure Blob Storage
async function uploadFileToBlob(fileBuffer, fileName, mimeType) {
  const blobClient = containerClient.getBlockBlobClient(fileName);
  const options = {
    blobHTTPHeaders: {
      blobContentType: mimeType || "application/octet-stream",
    },
  };

  await blobClient.upload(fileBuffer, fileBuffer.length, options);
  const fileUrl = blobClient.url;
  const previewUrl = generatePreviewUrl(fileUrl, mimeType);
  return previewUrl;
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

    const fileUrl = blobClient.url;

    // Generate preview URL if the file type is supported by Office or Google Docs
    const previewUrl = generatePreviewUrl(fileUrl, mimeType);

    console.log(
      `File ${fileName} uploaded successfully. Preview URL: ${previewUrl}`
    );

    return previewUrl;
  } catch (error) {
    console.error("Failed to upload file to Azure Blob Storage:", error);
    throw new Error("Failed to upload file");
  }
}

module.exports = {
  uploadFileToBlob,
  uploadFileToBlobForGoogleDrive,
};

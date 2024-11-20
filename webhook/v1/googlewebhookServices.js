const { google } = require("googleapis");
const client = require("./../../config/elasticsearch");
const cheerio = require("cheerio");
const xlsx = require("xlsx");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");
const axios = require("axios");

// Save webhook details in Elasticsearch
async function saveWebhookDetails(
  resourceId,
  categoryId,
  coid,
  gc_accessToken,
  refreshToken,
  startPageToken
) {
  try {
    const indexName = `resource_category_${coid.toLowerCase()}`;
    const document = {
      resourceId,
      categoryId,
      coid,
      gc_accessToken,
      refreshToken,
      tokenExpiry: Date.now() + 3600 * 1000, // Set token expiry time (1 hour from now)
      startPageToken,
    };

    const response = await client.index({
      index: indexName,
      id: resourceId, // Use resourceId as the document ID to avoid duplicates
      body: document,
    });

    console.log(`Webhook details saved successfully in index: ${indexName}`);
    return response;
  } catch (error) {
    console.error("Error saving webhook details to Elasticsearch:", error);
    throw new Error("Failed to save webhook details to Elasticsearch");
  }
}

async function fetchGoogleDriveChanges(auth, startPageToken) {
  const drive = google.drive({ version: "v3", auth });

  try {
    const response = await drive.changes.list({
      pageToken: startPageToken,
      fields:
        "changes(fileId, file(name, mimeType, modifiedTime)), newStartPageToken",
    });

    const changes = response.data.changes || [];
    const newPageToken = response.data.newStartPageToken;

    console.log(`Fetched ${changes.length} changes from Google Drive.`);
    return { changes, newPageToken };
  } catch (error) {
    console.error("Error fetching changes from Google Drive:", error.message);
    throw new Error("Failed to fetch changes from Google Drive");
  }
}

// Retrieve webhook details by resourceId
async function getWebhookDetailsByResourceId(resourceId) {
  try {
    const response = await client.search({
      index: "_all", // Search across all resource_category_* indices
      body: {
        query: {
          term: {
            resourceId: {
              value: resourceId,
              case_insensitive: true,
            },
          }, // Match the exact resourceId
        },
      },
    });

    const hits = response.hits.hits;

    if (hits.length > 0) {
      const {
        categoryId,
        coid,
        gc_accessToken,
        refreshToken,
        tokenExpiry,
        startPageToken,
      } = hits[0]._source;
      console.log(`Webhook details found for resourceId: ${resourceId}`);
      return {
        categoryId,
        coid,
        gc_accessToken,
        refreshToken,
        tokenExpiry,
        startPageToken,
      };
    } else {
      console.log(`No details found for resourceId: ${resourceId}`);
      return null;
    }
  } catch (error) {
    console.error(
      "Error retrieving webhook details from Elasticsearch:",
      error.message
    );
    throw new Error("Failed to retrieve webhook details from Elasticsearch");
  }
}

// Refresh access token using refreshToken
async function refreshAccessToken(refreshToken) {
  try {
    const auth = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URI
    );

    const { tokens } = await auth.refreshToken(refreshToken);

    console.log("Access token refreshed successfully:", tokens);

    return {
      gc_accessToken: tokens.access_token,
      tokenExpiry: Date.now() + tokens.expiry_date, // Update expiry time
    };
  } catch (error) {
    console.error("Error refreshing access token:", error.message);
    throw new Error("Failed to refresh access token");
  }
}

// Fetch file data from Google Drive
async function fetchFileData(fileId, categoryId, gc_accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: gc_accessToken });

  const drive = google.drive({ version: "v3", auth });

  try {
    const file = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, modifiedTime",
    });

    const content = await fetchFileContentByType(file.data, drive);

    if (content !== "Unsupported file type") {
      return {
        id: file.data.id,
        title: file.data.name,
        content: content,
        description: "No description available",
        category: categoryId, // Assign category ID
      };
    } else {
      console.log(`Skipping unsupported file type for file: ${file.data.name}`);
      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch data for file ID ${fileId}:`, error);
    throw new Error(error.message);
  }
}

// Helper function to fetch file content by type
async function fetchFileContentByType(file, drive) {
  if (file.mimeType === "text/plain") {
    return await fetchFileContent(file.id, drive);
  } else if (file.mimeType === "application/pdf") {
    return await fetchPdfContent(file.id, drive);
  } else if (
    file.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return await fetchWordContent(file.id, drive);
  } else if (
    file.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return await fetchExcelContent(file.id, drive);
  } else if (file.mimeType === "text/html") {
    return await fetchHtmlContent(file.id, drive);
  } else if (file.mimeType === "application/vnd.google-apps.document") {
    return await fetchGoogleDocContent(file.id, drive);
  } else {
    return "Unsupported file type";
  }
}

// Fetch specific file types
async function fetchPdfContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const pdfData = await pdf(response.data);
  return pdfData.text;
}

async function fetchWordContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const wordData = await mammoth.extractRawText({ buffer: response.data });
  return wordData.value;
}

async function fetchExcelContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const workbook = xlsx.read(response.data, { type: "buffer" });
  const sheets = workbook.SheetNames;
  return sheets.map((sheetName) => ({
    sheetName,
    data: xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]),
  }));
}

async function fetchHtmlContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  const $ = cheerio.load(response.data);
  return $("body").text().trim();
}

// Push data to Azure Cognitive Search
async function pushToAzureSearch(documents, coid) {
  const indexName = `tenant_${coid.toLowerCase()}`;

  try {
    const payload = {
      value: documents.map((doc) => ({
        "@search.action": "mergeOrUpload",
        id: doc.id,
        title: doc.title,
        content: doc.content,
        description: doc.description,
        category: doc.category,
      })),
    };

    const esResponse = await axios.post(
      `${process.env.AZURE_SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=2021-04-30-Preview`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_SEARCH_API_KEY,
        },
      }
    );

    console.log(
      `Documents pushed successfully to Azure Search in index: ${indexName}`
    );
    return esResponse;
  } catch (error) {
    console.error(
      "Error pushing documents to Azure Cognitive Search:",
      error.message
    );
    throw new Error("Failed to push documents to Azure Cognitive Search");
  }
}

module.exports = {
  saveWebhookDetails,
  fetchGoogleDriveChanges,
  getWebhookDetailsByResourceId,
  refreshAccessToken,
  fetchFileData,
  pushToAzureSearch,
};

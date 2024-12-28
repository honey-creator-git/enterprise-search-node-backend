const { google } = require("googleapis");
const client = require("./../../config/elasticsearch");
const cheerio = require("cheerio");
const xlsx = require("xlsx");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");
const pptParser = require('ppt-parser');
const axios = require("axios");

async function checkExistOfGoogleDriveConfig(client_id, coid) {
  try {
    const indexName = `resource_category_${coid.toLowerCase()}`;

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    if (!indexExists) {
      return "configuration is not existed";
    }

    const searchClientIdResponse = await client.search({
      index: indexName,
      body: {
        query: {
          match: {
            client_id: client_id,
          },
        },
      },
    });

    if (searchClientIdResponse.hits.total.value > 0) {
      return "configuration is already existed";
    } else {
      return "configuration is not existed";
    }
  } catch (error) {
    console.error("Error checking existance of google drive config in ElasticSearch:", error);
    throw new Error("Failed to check existance of google drive config in Elasticsearch");
  }
}

// Save webhook details in Elasticsearch
async function saveWebhookDetails(
  resourceId,
  categoryId,
  coid,
  gc_accessToken,
  refreshToken,
  webhookExpiry,
  webhookUrl,
  startPageToken,
  client_id,
  client_secret
) {
  try {
    const indexName = `resource_category_${coid.toLowerCase()}`;
    const document = {
      resourceId,
      categoryId,
      coid,
      gc_accessToken,
      refreshToken,
      webhookExpiry,
      webhookUrl,
      startPageToken,
      client_id,
      client_secret,
    };

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    // If index doesn't exist, create it with a proper mapping
    if (!indexExists) {
      console.log(`Index ${indexName} does not exist. Creating index with mapping.`);
      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              resourceId: { type: "keyword" },
              categoryId: { type: "keyword" },
              coid: { type: "keyword" },
              gc_accessToken: { type: "text" },
              refreshToken: { type: "text" },
              webhookExpiry: { type: "date" },
              webhookUrl: { type: "text" },
              startPageToken: { type: "keyword" },
              client_id: { type: "text" },
              client_secret: { type: "text" },
            },
          },
        },
      });
      console.log(`Index ${indexName} created successfully.`);
    }

    // Update or insert the document
    const response = await client.update({
      index: indexName,
      id: resourceId, // Use resourceId as the document ID to avoid duplicates
      body: {
        doc: document, // Update the document with the new values
        doc_as_upsert: true, // Create the document if it does not exist
      },
      retry_on_conflict: 3, // Retry in case of concurrent updates
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
        webhookExpiry,
        webhookUrl,
        startPageToken,
        client_id,
        client_secret
      } = hits[0]._source;
      console.log(`Webhook details found for resourceId: ${resourceId}`);
      return {
        categoryId,
        coid,
        gc_accessToken,
        refreshToken,
        webhookExpiry,
        webhookUrl,
        startPageToken,
        client_id,
        client_secret
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

async function refreshAccessToken(client_id, client_secret, refreshToken) {
  try {
    const auth = new google.auth.OAuth2(client_id, client_secret);

    auth.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await auth.refreshAccessToken();

    return {
      access_token: credentials.access_token,
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

async function fetchGoogleSheetContent(fileId, drive) {
  try {
    const response = await drive.files.export(
      {
        fileId: fileId,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    );

    const workbook = xlsx.read(response.data, { type: "buffer" });
    const sheets = workbook.SheetNames;
    const content = sheets.map((sheetName) => ({
      sheetName, // Include the sheet name for reference
      data: xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]), // Parse the sheet into JSON
    }));
    return JSON.stringify(content);
  } catch (error) {
    console.error("Error fetching Google Sheet content:", error.message);
    return "Error fetching Google Sheet content";
  }
}

// Helper function to fetch file content by type
async function fetchFileContentByType(file, drive) {
  if (file.mimeType === "text/plain") {
    return await fetchFileContent(file.id, drive);
  } else if (file.mimeType === "application/json") {
    return await fetchJSONContent(file.id, drive);
  } else if (file.mimeType === "application/pdf") {
    return await fetchPdfContent(file.id, drive);
  } else if (file.mimeType === "text/csv") {
    return await fetchCsvContent(file.id, drive);
  } else if (file.mimeType === "application/xml" || file.mimeType === "text/xml") {
    return await fetchXmlContent(file.id, drive);
  } else if (
    file.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimeType === "application/msword"
  ) {
    return await fetchWordContent(file.id, drive);
  } else if (
    file.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return await fetchExcelContent(file.id, drive);
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    return await fetchGoogleSheetContent(file.id, drive); // Google Sheets
  } else if (file.mimeType === "application/rtf") {
    return await fetchRtfContent(file.id, drive);
  } else if (file.mimeType === "application/vnd.ms-powerpoint" || file.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return await fetchPptContent(file.id, drive);
  } else if (file.mimeType === "text/html") {
    return await fetchHtmlContent(file.id, drive);
  } else if (file.mimeType === "application/vnd.google-apps.document") {
    return await fetchGoogleDocContent(file.id, drive);
  } else {
    return "Unsupported file type";
  }
}

async function fetchFileContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return response.data;
}

async function fetchJSONContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "json" }
  );
  return JSON.stringify(response.data, null, 2); // Pretty print JSON
}

async function fetchCsvContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return response.data; // Raw CSV content as text
}

async function fetchRtfContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return response.data; // Raw RTF content
}

async function fetchXmlContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return response.data; // Raw XML content as text
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

async function fetchPptContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" } // Fetch the file as an ArrayBuffer
  );

  // Parse the PPT content using ppt-parser
  const buffer = Buffer.from(response.data); // Convert ArrayBuffer to Buffer
  const pptContent = await pptParser.parse(buffer); // Parse PPT/PPTX content

  // You can process or return the extracted content
  return pptContent; // Returns extracted text and slides data
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
  const content = sheets.map((sheetName) => ({
    sheetName,
    data: JSON.stringify(xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])),
  }));
  return JSON.stringify(content);
}

async function fetchHtmlContent(fileId, drive) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  const $ = cheerio.load(response.data);
  return $("body").text().trim();
}

async function fetchGoogleDocContent(fileId, drive) {
  const response = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return response.data;
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
        image: doc.image,
        category: doc.category,
        fileUrl: doc.fileUrl, // Add the file URL here
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
    return esResponse.data;
  } catch (error) {
    console.error(
      "Error pushing documents to Azure Cognitive Search:",
      error.message
    );
    throw new Error("Failed to push documents to Azure Cognitive Search");
  }
}

async function registerWebhook(gc_accessToken, gc_refreshToken, webhookUrl, datasourceId, client_id, client_secret, coid) {

  // Validate required inputs
  if (!gc_accessToken || !gc_refreshToken || !webhookUrl || !datasourceId) {
    return res.status(400).json({
      error:
        "Missing required fields: gc_accessToken, gc_refreshToken, webhookUrl, datasourceId",
    });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: gc_accessToken });

    const drive = google.drive({ version: "v3", auth });

    // Retrieve the startPageToken to track future changes
    const startTokenResponse = await drive.changes.getStartPageToken();
    const startPageToken = startTokenResponse.data.startPageToken;

    // Register the webhook with Google Drive
    const watchResponse = await drive.files.watch({
      fileId: "root", // Watch the entire Drive
      requestBody: {
        id: `webhook-${Date.now()}`, // Unique channel ID
        type: "web_hook",
        address: webhookUrl, // Your webhook URL
      },
    });

    console.log("Webhook registered successfully:", watchResponse.data);

    // Save webhook details to Elasticsearch or your database
    const resourceId = watchResponse.data.resourceId;
    const expiration = parseInt(watchResponse.data.expiration, 10);

    console.log("Expiration => ", expiration);

    try {
      await saveWebhookDetails(
        resourceId,
        datasourceId,
        coid,
        gc_accessToken,
        gc_refreshToken,
        expiration,
        webhookUrl,
        startPageToken,
        client_id,
        client_secret
      );
    } catch (saveError) {
      console.error("Failed to save webhook details:", saveError.message);
      throw new Error("Failed to save webhook details after registering the webhook");
    }

    return {
      message: "Webhook registered successfully",
      data: watchResponse.data,
    };
  } catch (error) {
    console.error("Failed to register webhook:", error.message);
    return {
      error: "Failed to register webhook",
      details: error.message,
    };
  }
};

async function fetchAllFileContents(files, categoryId, drive) {
  const fileData = [];
  for (const file of files) {
    try {
      const content = await fetchFileContentByType(file, drive);
      if (content !== "Unsupported file type") {
        console.log("File Name => ", file.name);
        console.log("File Content => ", content);
        fileData.push({
          id: file.id,
          title: file.name,
          content: content,
          description: "No description available",
          category: `${categoryId}`,
        });
      } else {
        console.log(`Skipping unsupported file type for file: ${file.name}`);
      }
    } catch (error) {
      console.error(`Failed to fetch content for file ${file.name}:`, error);
    }
  }
  return fileData;
}

module.exports = {
  saveWebhookDetails,
  fetchGoogleDriveChanges,
  getWebhookDetailsByResourceId,
  refreshAccessToken,
  fetchFileData,
  pushToAzureSearch,
  registerWebhook,
  fetchAllFileContents,
  checkExistOfGoogleDriveConfig
};

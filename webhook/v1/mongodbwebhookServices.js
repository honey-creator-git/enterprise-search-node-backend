const { MongoClient } = require("mongodb");
const client = require("./../../config/elasticsearch");
const { uploadFileToBlob } = require("../../services/v1/blobStorage");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const textract = require("textract");

async function extractTextFromCsv(content) {
  return content; // Process CSV content if needed
}

async function extractTextFromDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

// XML Path Helper
function getValueFromXmlPath(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    current = current[part];
    if (!current) return null;
  }
  return current.toString();
}

async function extractTextFromXml(content, paths) {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser();

  return new Promise((resolve, reject) => {
    parser.parseString(content, (err, result) => {
      if (err) {
        console.error("Error parsing XML:", err);
        return reject(err);
      }

      if (!paths || paths.length === 0) {
        resolve(JSON.stringify(result));
      } else {
        const extracted = paths
          .map((path) => getValueFromXmlPath(result, path))
          .filter(Boolean)
          .join(" ");
        resolve(extracted);
      }
    });
  });
}

async function extractTextFromJson(content, properties) {
  try {
    const jsonData = JSON.parse(content);
    if (!properties || properties.length === 0) {
      return JSON.stringify(jsonData);
    }

    const extracted = properties.map((prop) => jsonData[prop] || "").join(" ");
    return extracted;
  } catch (err) {
    console.error("Error extracting JSON content:", err);
    return null;
  }
}

// Text Extraction Functions
async function extractTextFromTxt(content) {
  return content;
}

// Extract Text from RTF (Placeholder)
async function extractTextFromRtf(buffer) {
  return buffer.toString("utf-8");
}

async function extractTextFromXlsx(buffer) {
  const xlsx = require("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_csv(sheet);
}

async function extractTextFromPptxBuffer(buffer) {
  return new Promise((resolve, reject) => {
    textract.fromBufferWithMime(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer,
      (err, text) => {
        if (err) {
          console.error("Error extracting PPTX:", err);
          return reject(err);
        }
        resolve(text || "");
      }
    );
  });
}

async function extractTextFromXmlBuffer(buffer) {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(buffer.toString("utf-8"));
  return JSON.stringify(result);
}

async function extractTextFromCsvBuffer(buffer) {
  return buffer.toString("utf-8");
}

async function extractTextFromHtml(htmlContent) {
  try {
    const $ = cheerio.load(htmlContent); // Load the HTML content
    return $("body").text().trim(); // Extract and return the text inside the <body> tag
  } catch (error) {
    console.error("Error extracting text from HTML:", error);
    throw new Error("Failed to extract text from HTML");
  }
}

async function extractTextFromHtmlBuffer(buffer) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(buffer.toString("utf-8"));
  return $("body").text().trim();
}

// Helper: Convert Stream to Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

function splitLargeText(content, maxChunkSize = 30000) {
  const chunks = [];
  for (let i = 0; i < content.length; i += maxChunkSize) {
    chunks.push(content.substring(i, i + maxChunkSize));
  }
  return chunks;
}

async function processFieldContent(
  content,
  fieldType,
  jsonProperties,
  xmlPaths
) {
  switch (fieldType.toUpperCase()) {
    case "TXT":
      return extractTextFromTxt(content);

    case "JSON":
      return extractTextFromJson(content, jsonProperties);

    case "XML":
      return extractTextFromXml(content, xmlPaths);

    case "HTML":
      return extractTextFromHtml(content);

    case "XLSX":
      return extractTextFromXlsx(Buffer.from(content, "binary"));

    case "PDF":
      return extractTextFromPdf(Buffer.from(content, "binary"));

    case "DOC":
    case "DOCX":
      return extractTextFromDocx(Buffer.from(content, "binary"));

    case "CSV":
      return extractTextFromCsv(content);

    default:
      console.log(`Unsupported field type: ${fieldType}`);
      return null;
  }
}

// Detect MIME Type from Buffer
async function detectMimeType(buffer) {
  const { fileTypeFromBuffer } = await import("file-type"); // Dynamic import
  const fileTypeResult = await fileTypeFromBuffer(buffer); // Correct function

  // Fallback: Inspect buffer for HTML tags
  const content = buffer.toString("utf-8").trim();
  if (content.startsWith("<!DOCTYPE html") || content.startsWith("<html")) {
    return "text/html";
  }

  // Check if fileTypeFromBuffer fails or returns application/octet-stream
  if (!fileTypeResult || fileTypeResult.mime === "application/octet-stream") {
    // Try reading the buffer as UTF-8 plain text
    const textContent = buffer.toString("utf-8");

    // Simple heuristic: If the buffer decodes without issues, it's likely plain text
    if (/^[\x00-\x7F]*$/.test(textContent)) {
      return "text/plain";
    }
  }

  return fileTypeResult ? fileTypeResult.mime : "application/octet-stream";
}

// Process BLOB field for text extraction
async function processBlobField(fileBuffer) {
  let extractedText = "";
  const mimeType = await detectMimeType(fileBuffer); // Detect MIME dynamically

  console.log(`Mime Type MongoDB => ${mimeType}`);

  try {
    switch (mimeType) {
      case "application/pdf":
        extractedText = await extractTextFromPdf(fileBuffer);
        break;

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": // DOCX
      case "application/msword": // DOC
        extractedText = await extractTextFromDocx(fileBuffer);
        break;

      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": // XLSX
      case "application/vnd.ms-excel": // XLS
      case "application/x-cfb":
        extractedText = await extractTextFromXlsx(fileBuffer);
        break;

      case "application/vnd.ms-powerpoint": // PPT
      case "application/vnd.openxmlformats-officedocument.presentationml.presentation": // PPTX
        extractedText = await extractTextFromPptxBuffer(fileBuffer);
        break;

      case "text/csv":
        extractedText = await extractTextFromCsvBuffer(fileBuffer);
        break;

      case "application/xml":
      case "text/xml":
        extractedText = await extractTextFromXmlBuffer(fileBuffer);
        break;

      case "application/rtf": // RTF
        extractedText = await extractTextFromRtf(fileBuffer);
        break;

      case "text/plain":
        extractedText = fileBuffer.toString("utf-8"); // Direct text extraction for .txt
        break;

      case "application/json":
        extractedText = JSON.stringify(
          JSON.parse(fileBuffer.toString("utf-8")),
          null,
          2
        );
        break;

      case "text/html":
        extractedText = await extractTextFromHtmlBuffer(fileBuffer);
        break;

      default:
        console.log("Unsupported BLOB type, uploading without extraction.");
    }
  } catch (error) {
    console.error("Error extracting text from BLOB:", error.message);
  }

  return { extractedText, mimeType };
}

async function saveMongoDBConnection(
  mongoUri,
  database,
  collection_name,
  field_name,
  field_type,
  category,
  coid
) {
  try {
    const indexName = `datasource_mongodb_connection_${coid.toLowerCase()}`;

    const document = {
      mongoUri,
      database,
      collection_name,
      field_name,
      field_type,
      category,
      coid,
      updatedAt: new Date().toISOString(),
    };

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    // If the index doesn't exist, create it with the appropriate mapping
    if (!indexExists) {
      console.log(
        `Index ${indexName} does not exist. Creating index with mapping.`
      );
      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              mongoUri: { type: "text" },
              database: { type: "text" },
              collection_name: { type: "text" },
              field_name: { type: "text" },
              field_type: { type: "text" },
              category: { type: "text" },
              coid: { type: "keyword" },
              updatedAt: { type: "date" },
            },
          },
        },
      });

      console.log(`Index ${indexName} created successfully.`);
    }

    // Update or insert the document in ElasticSearch
    const response = await client.update({
      index: indexName,
      id: category, // Use coid as the document ID to avoid duplicates
      body: {
        doc: document, // Update the document with the new values
        doc_as_upsert: true, // Create the document if it does not exist
      },
      retry_on_conflict: 3, // Retry in case of concurrent updates
    });

    console.log(
      `MongoDB Connection details saved successfully in index : ${indexName}`
    );
    return response;
  } catch (error) {
    console.error(
      "Error saving MongoDB connection to Elasticsearch: ",
      error.message
    );
    throw new Error("Failed to save MongoDB connection to Elasticsearch");
  }
}

async function fetchDataFromMongoDB(config) {
  // MongoDB URI and client setup
  const uri = config.mongoUri; // MongoDB connection URI
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    // Select the database and collection
    const database = client.db(config.database);
    const collection = database.collection(config.collection_name);
    const bucket = new GridFSBucket(database, {
      bucketName: config.collection_name,
    });

    console.log(`Fetching data from collection: ${config.collection_name}...`);

    // Fetch all documents from the collection (optionally apply filters)
    const query = {}; // Empty empty to fetch all documents. Add filters here if needed.
    const cursor = collection.find(query);
    const documents = await cursor.toArray();
    const files = await bucket.find().toArray();

    const data = [];

    if (config.field_type.toLowerCase() === "blob") {
      for (const file of files) {
        let processedContent;
        let fileUrl;

        try {
          const downloadStream = bucket.openDownloadStream(file._id);
          const buffer = await streamToBuffer(downloadStream);
          const fileName = `mongodb_${config.database}_${config.collection_name}_file_${file._id}`;

          // Detect and process MIME Types
          const { extractedText, mimeType } = await processBlobField(buffer);

          // Upload to Azure Blob Storage
          fileUrl = await uploadFileToBlob(buffer, fileName, mimeType);
          console.log("File URL => ", fileUrl);

          processedContent = extractedText;
          console.log("Extracted text from buffer => ", processedContent);
        } catch (error) {
          console.error(
            `Failed to process content for row ID ${file._id}:`,
            error.message
          );
          continue;
        }

        if (processedContent) {
          const chunks = splitLargeText(processedContent);
          chunks.forEach((chunk, index) => {
            data.push({
              id: `mongodb_${config.database}_${config.collection_name}_${file._id}_${index}`,
              content: chunk,
              title: config.title || `MongoDB Row ID ${file._id}`,
              description: config.description || "No description",
              image: config.image || null,
              category: config.category,
              fileUrl: fileUrl,
            });
          });
        }
      }
    } else {
      for (const document of documents) {
        let processedContent;

        try {
          // Process the content based on field type
          processedContent = await processFieldContent(
            document[config.field_name],
            config.field_type,
            config.json_properties,
            config.xml_paths
          );
        } catch (error) {
          console.error(
            `Failed to process content for row ID ${document._id}:`,
            error.message
          );
          continue;
        }

        if (processedContent) {
          data.push({
            id: document._id.toString(),
            content: processedContent,
            title: config.title || `Row ID ${document._id}`, // Use provided title or fallback
            description: config.description || "No description provided",
            image: config.image || null,
            category: config.category,
            fileUrl: "",
          });
        }
      }
    }

    console.log(`Fetched ${data.length} documents from the collection.`);

    // Return the data
    return { data };
  } catch (error) {
    console.error("Error syncing MongoDB to Azure:", error.message);
    return { data: [] }; // <-- Return an empty array if error occurs
  } finally {
    await client.close();
  }
}

async function registerMongoDBConnection(config) {
  try {
    return await saveMongoDBConnection(
      config.mongoUri,
      config.database,
      config.collection_name,
      config.field_name,
      config.field_type,
      config.category,
      config.coid
    );
  } catch (error) {
    console.error("Failed to save MongoDB connection: ", error.message);
    throw new Error("Failed to save MongoDB connection");
  }
}

async function checkExistOfMongoDBConfig(
  mongoUri,
  database,
  collection_name,
  coid
) {
  try {
    const indexName = `datasource_mongodb_connection_${coid.toLowerCase()}`;

    // Check if the index exists
    const indexExists = await client.indices.exists({ index: indexName });

    if (!indexExists) {
      return "MongoDB configuration does not exist";
    }

    // Search for the MSSQL configuration with all conditions (AND operator)
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { match: { mongoUri: mongoUri } },
              { match: { database: database } },
              { match: { collection_name: collection_name } },
            ],
          },
        },
      },
    });

    if (searchResponse.hits.total.value > 0) {
      return "MongoDB configuration already exists";
    } else {
      return "MongoDB configuration does not exist";
    }
  } catch (error) {
    console.error(
      "Error checking existence of MongoDB config in Elasticsearch:",
      error.message
    );
    throw new Error(
      "Failed to check existence of MongoDB config in Elasticsearch"
    );
  }
}

module.exports = {
  checkExistOfMongoDBConfig,
  registerMongoDBConnection,
  fetchDataFromMongoDB,
};

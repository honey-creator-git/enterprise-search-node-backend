const client = require("./../../config/elasticsearch");
const { uploadFileToBlob } = require("../../services/v1/blobStorage");
const mysql = require("mysql2/promise");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const fs = require("fs"); // To read the SSL certificate file
const textract = require("textract");
const libre = require("libreoffice-convert"); // For conversion

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

async function extractTextFromXlsx(buffer) {
  const xlsx = require("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_csv(sheet);
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

// Extract Text from RTF (Placeholder)
async function extractTextFromRtf(buffer) {
  return buffer.toString("utf-8");
}

async function extractTextFromXmlBuffer(buffer) {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(buffer.toString("utf-8"));
  return JSON.stringify(result);
}

async function extractTextFromHtmlBuffer(buffer) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(buffer.toString("utf-8"));
  return $("body").text().trim();
}

async function extractTextFromCsvBuffer(buffer) {
  return buffer.toString("utf-8");
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

// Convert XLS to XLSX
async function convertXlsToXlsx(buffer) {
  return new Promise((resolve, reject) => {
    libre.convert(buffer, ".xlsx", undefined, (err, result) => {
      if (err) {
        console.error("Conversion Error:", err.message);
        return reject(err);
      }
      resolve(result);
    });
  });
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

  console.log(`Mime Type => ${mimeType}`);

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

async function saveMySQLConnection(
  host,
  user,
  password,
  database,
  table_name,
  field_name,
  field_type,
  category,
  coid,
  lastProcessedId
) {
  try {
    const indexName = `datasource_mysql_connection_${coid.toLowerCase()}`;

    const document = {
      host,
      user,
      password,
      database,
      table_name,
      field_name,
      field_type,
      category,
      coid,
      lastProcessedId: lastProcessedId || 0, // Default to 0 if not provided
      updatedAt: new Date().toISOString(),
    };

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    // If index doesn't exist, create it with a proper mapping
    if (!indexExists) {
      console.log(
        `Index ${indexName} does not exist. Creating index with mapping.`
      );
      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              host: { type: "text" },
              user: { type: "text" },
              password: { type: "text" },
              database: { type: "text" },
              table_name: { type: "text" },
              field_name: { type: "text" },
              field_type: { type: "text" },
              category: { type: "text" },
              coid: { type: "keyword" },
              lastProcessedId: { type: "long" },
              updatedAt: { type: "date" },
            },
          },
        },
      });
      console.log(`Index ${indexName} created successfully.`);
    }

    // Update or insert the document
    const response = await client.update({
      index: indexName,
      id: category, // Use categoryId as the document ID to avoid duplicates
      body: {
        doc: document, // Update the document with the new values
        doc_as_upsert: true, // Create the document if it doesn't exist
      },
      retry_on_conflict: 3, // Retry in case of concurrent updates
    });

    console.log(
      `MySQL Connection details saved successfully in index: ${indexName}`
    );
    return response;
  } catch (error) {
    console.error(
      "Error saving mysql connection to Elastic Search : ",
      error.message
    );
    throw new Error("Failed to save mysql connection to ElasticSearch");
  }
}
async function fetchAndProcessFieldContentOfMySQL(config) {
  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: {
      ca: fs.readFileSync("./DigiCertGlobalRootCA.crt.pem"), // Replace with the actual path to the certificate
    },
  });

  try {
    console.log(`Fetching data from table: ${config.table_name}...`);

    // Fetch rows where `id` is greater than the last processed ID
    const [rows] = await connection.query(
      `SELECT id, ${config.field_name} AS field_value FROM ${config.table_name} WHERE id > ? ORDER BY id ASC`,
      [config.lastProcessedId || 0]
    );

    if (rows.length === 0) {
      console.log("No new rows found in the table.");
      return {
        data: [],
        lastProcessedId: config.lastProcessedId || 0, // Return the same lastProcessedId
      };
    }

    console.log(`Fetched ${rows.length} new rows from the table.`);

    const documents = [];

    for (const row of rows) {
      let processedContent;
      let fileUrl = "";

      try {
        const fileBuffer = row.field_value;
        const fileName = `file_${row.id}`;

        if (config.field_type === "BLOB" || config.field_type === "blob") {
          // Detect MIME type
          const { extractedText, mimeType } = await processBlobField(
            fileBuffer
          );

          if (mimeType === "application/x-cfb") {
            console.log("CFB detected, converting to XLSX...");

            const convertedBuffer = await convertXlsToXlsx(fileBuffer);
            const convertedFileName = fileName.replace(".xls", ".xlsx");

            // Upload converted XLSX
            fileUrl = await uploadFileToBlob(
              convertedBuffer,
              convertedFileName,
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
          } else {
            // Upload file to Azure Blob Storage
            fileUrl = await uploadFileToBlob(fileBuffer, fileName, mimeType);
          }

          console.log("File URL => ", fileUrl);

          // Extract Text from BLOB (PDF/DOCX)
          processedContent = extractedText;

          console.log("Extracted text from buffer => ", processedContent);
        } else {
          // Handle text, JSON, or XML fields
          processedContent = await processFieldContent(
            row.field_value,
            config.field_type,
            config.json_properties,
            config.xml_paths
          );
        }
      } catch (error) {
        console.error(
          `Failed to process content for row ID ${row.id}:`,
          error.message
        );
        continue;
      }

      if (processedContent) {
        documents.push({
          id: row.id.toString(),
          content: processedContent,
          title: config.title || `Row ID ${row.id}`, // Use provided title or fallback
          description: config.description || "No description provided",
          image: config.image || null,
          category: config.category,
          fileUrl: fileUrl,
        });
      }
    }

    const lastProcessedId = rows[rows.length - 1].id;
    console.log(`Last Processed ID: ${lastProcessedId}`);

    return {
      data: documents,
      lastProcessedId,
    };
  } finally {
    await connection.end();
  }
}

async function registerMySQLConnection(config) {
  try {
    return await saveMySQLConnection(
      config.host,
      config.user,
      config.password,
      config.database,
      config.table_name,
      config.field_name,
      config.field_type,
      config.category,
      config.coid,
      config.lastProcessedId
    );
  } catch (saveError) {
    console.error("Failed to save mysql connection: ", saveError.message);
    throw new Error("Failed to save mysql connection");
  }
}

async function checkExistOfMySQLConfig(host, database, table_name, coid) {
  try {
    const indexName = `datasource_mysql_connection_${coid.toLowerCase()}`;

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    if (!indexExists) {
      return "MySQL configuration is not existed";
    }

    // Search for the MySQL configuration with all conditions (AND operator)
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { match: { host: host } },
              { match: { database: database } },
              { match: { table_name: table_name } },
            ],
          },
        },
      },
    });

    if (searchResponse.hits.total.value > 0) {
      return "MySQL configuration is already existed";
    } else {
      return "MySQL configuration is not existed";
    }
  } catch (error) {
    console.error(
      "Error checking existance of MySQL config in ElasticSearch:",
      error
    );
    throw new Error(
      "Failed to check existance of MySQL config in Elasticsearch"
    );
  }
}

module.exports = {
  checkExistOfMySQLConfig,
  fetchAndProcessFieldContentOfMySQL,
  registerMySQLConnection,
};

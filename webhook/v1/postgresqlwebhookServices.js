const client = require("./../../config/elasticsearch");
const { uploadFileToBlob } = require("../../services/v1/blobStorage");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const textract = require("textract");
const iconv = require("iconv-lite");

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

async function savePostgreSQLConnection(
  host,
  user,
  password,
  database,
  table_name,
  field_name,
  title_field,
  category,
  coid,
  lastProcessedId
) {
  try {
    const indexName = `datasource_postgresql_connection_${coid.toLowerCase()}`;

    const document = {
      host,
      user,
      password,
      database,
      table_name,
      field_name,
      title_field,
      category,
      coid,
      lastProcessedId: lastProcessedId || 0, // Default to 0 if not provided
      updatedAt: new Date().toISOString(),
    };

    // Check if the index exists
    const indexExists = await client.indices.exists({ index: indexName });

    // If index doesn't exist, crete it with a proper mapping
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
              title_field: { type: "text" },
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
      id: category,
      body: {
        doc: document, // Update the document with the new values
        doc_as_upsert: true, // Create the document if it doesn't exist
      },
      retry_on_conflict: 3, // Retry in case of concurrent updates
    });

    console.log(
      `PostgreSQL Connection details saved successfully in index: ${indexName}`
    );
    return response;
  } catch (error) {
    console.error(
      "Error saving postgresql connection to ElasticSearch : ",
      error.message
    );
    throw new Error("Failed to save postgresql connection to ElasticSearch");
  }
}

async function checkExistOfPostgreSQLConfig(host, database, table_name, coid) {
  try {
    const indexName = `datasource_postgresql_connection_${coid.toLowerCase()}`;

    // Check if index exists
    const indexExists = await client.indices.exists({
      index: indexName,
    });

    if (!indexExists) {
      return "PostgreSQL configuration is not existed";
    }

    // Search for the PostgreSQL configuration with all conditions (AND operator)
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
      return "PostgreSQL configuration is already existed";
    } else {
      return "PostgreSQL configuration is not existed";
    }
  } catch (error) {
    console.error(
      "Error checking existance of PostgreSQL config in ElasticSearch:",
      error
    );
    throw new Error(
      "Failed to check existance of PostgreSQL config in Elasticsearch"
    );
  }
}

async function extractTextFromHtmlBuffer(buffer) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(buffer.toString("utf-8"));
  return $("body").text().trim();
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

function splitLargeText(content, maxChunkSize = 30000) {
  const chunks = [];
  for (let i = 0; i < content.length; i += maxChunkSize) {
    chunks.push(content.substring(i, i + maxChunkSize));
  }
  return chunks;
}

function normalizeEncoding(buffer) {
  try {
    // Decode the buffer using UTF-8
    const decodedContent = iconv.decode(buffer, "utf-8");
    console.log(
      "Decoded content (first 50 chars):",
      decodedContent.slice(0, 50)
    );
    return decodedContent;
  } catch (error) {
    console.error("Encoding normalization failed:", error.message);
    return buffer.toString("utf-8"); // Fallback to UTF-8 string conversion
  }
}

// Detect MIME Type from Buffer
async function detectMimeType(input) {
  const { fileTypeFromBuffer } = await import("file-type");

  try {
    let buffer;

    // Check if the input is a string
    if (typeof input === "string") {
      console.log("Input is a string, converting to buffer...");
      buffer = Buffer.from(input, "utf-8");
    } else if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
      buffer = Buffer.from(input);
    } else {
      throw new Error(
        "Expected the 'input' argument to be of type 'Uint8Array', 'ArrayBuffer', or 'string'."
      );
    }

    console.log(
      "Buffer first 20 bytes (hex):",
      buffer.slice(0, 20).toString("hex")
    );

    // Use file-type to detect MIME type
    const fileTypeResult = await fileTypeFromBuffer(buffer);

    if (fileTypeResult) {
      console.log(`Detected MIME type using file-type: ${fileTypeResult.mime}`);
      return fileTypeResult.mime;
    }

    const content = buffer.toString("utf-8").trim();

    if (content.startsWith("<!DOCTYPE html") || content.startsWith("<html")) {
      return "text/html";
    }

    // Normalize the encoding and analyze the content
    const normalizedContent = await normalizeEncoding(buffer);

    // Check for UTF-8 compliance using heuristic
    if (isUtf8(buffer)) {
      console.log("Content is UTF-8 encoded text.");
      return "text/plain";
    }

    // Fallback plain text detection
    const isPlainText = /^[\x20-\x7E\r\n\t]*$/.test(normalizedContent);
    if (isPlainText) {
      console.log("Content matches plain text heuristics.");
      return "text/plain";
    }

    console.log("Content does not match plain text heuristics.");
  } catch (error) {
    console.error("Error in MIME type detection:", error.message);
  }

  // Default fallback for undetectable or unsupported content
  return "application/octet-stream";
}

// Helper function to validate UTF-8 encoding
function isUtf8(buffer) {
  try {
    buffer.toString("utf-8"); // If it doesn't throw, it's valid UTF-8
    return true;
  } catch (error) {
    console.error("UTF-8 validation failed:", error.message);
    return false;
  }
}

// Process BLOB field for text extraction
async function processBlobField(fileBuffer, mimeType) {
  let extractedText = "";
  // const mimeType = await detectMimeType(fileBuffer); // Detect MIME dynamically

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

async function fetchAndProcessFieldContentOfPostgreSQL(config) {
  const { Client } = require("pg");
  const client = new Client({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log(
      `Connected to PostgreSQL. Processing table: ${config.table_name}...`
    );

    // Step 1: Check and Create Change Log Table
    const changeLogTable = `${config.table_name}_changelog`;
    const createChangeLogTableQuery = `
            CREATE TABLE IF NOT EXISTS ${changeLogTable} (
                log_id SERIAL PRIMARY KEY,
                action_type VARCHAR(50),
                row_id INT,
                changed_field VARCHAR(255),
                title TEXT,
                old_value TEXT,
                new_value TEXT,
                change_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
    await client.query(createChangeLogTableQuery);
    console.log(`Change Log Table ensured: ${changeLogTable}`);

    // Step 2: Create Trigger Function
    const triggerFunctionName = `${config.table_name}_trigger_function`;
    const createTriggerFunctionQuery = `
            CREATE OR REPLACE FUNCTION ${triggerFunctionName}()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO ${changeLogTable} (action_type, row_id, changed_field, title, old_value, new_value)
                    VALUES ('INSERT', NEW.id, '${config.field_name}', '${config.title_field}', NULL, NEW.${config.field_name});
                ELSIF TG_OP = 'UPDATE' THEN
                    INSERT INTO ${changeLogTable} (action_type, row_id, changed_field, title, old_value, new_value)
                    VALUES ('UPDATE', NEW.id, '${config.field_name}', '${config.title_field}', OLD.${config.field_name}, NEW.${config.field_name});
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;
    await client.query(createTriggerFunctionQuery);
    console.log(`Trigger Function ensured: ${triggerFunctionName}`);

    // Step 3: Create Trigger
    const triggerName = `${config.table_name}_trigger`;
    const createTriggerQuery = `
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = '${triggerName}'
                ) THEN
                    CREATE TRIGGER ${triggerName}
                    AFTER INSERT OR UPDATE ON ${config.table_name}
                    FOR EACH ROW
                    EXECUTE FUNCTION ${triggerFunctionName}();
                END IF;
            END $$;
        `;
    await client.query(createTriggerQuery);
    console.log(`Trigger ensured: ${triggerName}`);

    // Step 4: Fetch Data from the Table
    const query = `
            SELECT id, ${config.title_field} AS title, ${config.field_name} AS field_value,
            octet_length(${config.field_name}) AS file_size,
            CURRENT_TIMESTAMP AS uploaded_at
            FROM ${config.table_name}
            WHERE id > $1
            ORDER BY id ASC
        `;
    const res = await client.query(query, [config.lastProcessedId || 0]);

    if (res.rows.length === 0) {
      console.log("No new rows found in the table.");
      return {
        data: [],
        lastProcessedId: config.lastProcessedId || 0,
      };
    }

    console.log(`Fetched ${res.rows.length} new rows from the table.`);
    const documents = [];

    for (const row of res.rows) {
      let processedContent;
      let fileUrl = "";
      const fileBuffer = row.field_value;
      const fileName = row.title;

      try {
        const mimeType = await detectMimeType(fileBuffer);

        if (
          mimeType.startsWith("application/") ||
          mimeType === "text/html" ||
          mimeType === "text/csv" ||
          mimeType === "text/xml" ||
          mimeType === "text/plain"
        ) {
          console.log(`Detected MIME type: ${mimeType}`);
          // Process BLOB Field
          const { extractedText } = await processBlobField(
            fileBuffer,
            mimeType
          );

          // Upload to Azure Blob Storage
          fileUrl = await uploadFileToBlob(fileBuffer, fileName, mimeType);

          console.log("File URL => ", fileUrl);

          processedContent = extractedText;

          console.log("Extracted text from buffer => ", processedContent);
        } else {
          console.log("Unsupported MIME type:", mimeType);
          continue;
        }
      } catch (error) {
        console.error(
          `Failed to process content for row ID ${row.id}`,
          error.message
        );
        continue;
      }

      if (processedContent) {
        console.log("File Size => ", row.file_size);
        console.log("Uploaded At => ", row.uploaded_at);

        const chunks = splitLargeText(processedContent);
        chunks.forEach((chunk, index) => {
          documents.push({
            id: `pg_${config.database}_${config.table_name}_${row.id}_${index}`,
            content: chunk,
            title: fileName || `PG Row ID ${row.id}`,
            description: config.description || "No description",
            image: config.image || null,
            category: config.category,
            fileUrl: fileUrl,
            fileSize: (row.file_size / (1024 * 1024)).toFixed(2), // Convert to MB,
            uploadedAt: row.uploaded_at,
          });
        });
      }
    }

    const lastProcessedId = res.rows[res.rows.length - 1].id;
    console.log(`Last Processed ID: ${lastProcessedId}`);

    return { data: documents, lastProcessedId };
  } catch (error) {
    console.error("Error during PostgreSQL Sync:", error.message);
    throw new Error(
      "Failed to fetch content from mysql connection. Check the name of fields specified correctly."
    );
  } finally {
    await client.end();
  }
}

async function registerPostgreSQLConnection(config) {
  try {
    return await savePostgreSQLConnection(
      config.host,
      config.user,
      config.password,
      config.database,
      config.table_name,
      config.field_name,
      config.title_field,
      config.category,
      config.coid,
      config.lastProcessedId
    );
  } catch (error) {
    console.error("Failed to save postgresql connection: ", error.message);
    throw new Error("Failed to save postgresql connection");
  }
}

module.exports = {
  registerPostgreSQLConnection,
  fetchAndProcessFieldContentOfPostgreSQL,
  checkExistOfPostgreSQLConfig,
};

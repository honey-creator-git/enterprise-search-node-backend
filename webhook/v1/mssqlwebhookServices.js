const client = require("./../../config/elasticsearch");
const { uploadFileToBlob } = require("../../services/v1/blobStorage");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const textract = require("textract");
const sql = require("mssql");

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

async function extractTextFromXmlBuffer(buffer) {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(buffer.toString("utf-8"));
  return JSON.stringify(result);
}

// Extract Text from RTF (Placeholder)
async function extractTextFromRtf(buffer) {
  return buffer.toString("utf-8");
}

async function extractTextFromHtmlBuffer(buffer) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(buffer.toString("utf-8"));
  return $("body").text().trim();
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

  console.log(`Mime Type MSSQL => ${mimeType}`);

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

async function fetchAndProcessFieldContent(config) {
  const dbConfig = {
    user: config.db_user,
    password: config.db_password,
    server: config.db_host,
    database: config.db_database,
    options: {
      encrypt: true, // For Azure MSSQL
      trustServerCertificate: false,
    },
  };

  const connection = await sql.connect(dbConfig);

  try {
    // Step 1: Check and Create Change Log Table
    const changeLogTable = `${config.table_name}_ChangeLog`;

    // Dynamically detect the primary key field
    const primaryKeyQuery = `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
        AND TABLE_NAME = '${config.table_name}';
    `;

    const primaryKeyResult = await connection.query(primaryKeyQuery);
    let primaryKeyField = primaryKeyResult.recordset[0]?.COLUMN_NAME;

    if (!primaryKeyField) {
      console.log(
        `No primary key detected. Using ROW_NUMBER as a fallback for table: ${config.table_name}`
      );
      primaryKeyField =
        "ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS RowNumber";
    }

    const checkChangeLogTableQuery = `
        IF NOT EXISTS (
            SELECT * FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = '${changeLogTable}'
        )
        BEGIN
            CREATE TABLE dbo.[${changeLogTable}] (
                LogID INT IDENTITY PRIMARY KEY,
                ActionType NVARCHAR(50),
                RowID NVARCHAR(MAX), -- Store dynamic row identifier
                ChangedField NVARCHAR(255),
                OldValue NVARCHAR(MAX),
                NewValue NVARCHAR(MAX),
                ChangeTime DATETIME DEFAULT GETDATE()
            );
        END
    `;
    await connection.query(checkChangeLogTableQuery);

    // Step 2: Check and Create Trigger
    const checkTriggerQuery = `
            IF NOT EXISTS (
                SELECT * FROM sys.triggers 
                WHERE name = 'trg_${config.table_name}_ChangeLog'
            )
            BEGIN
                EXEC('
                    CREATE TRIGGER trg_${config.table_name}_ChangeLog
                    ON dbo.[${config.table_name}]
                    AFTER INSERT, UPDATE
                    AS
                    BEGIN
                        SET NOCOUNT ON;
                        IF EXISTS (SELECT * FROM inserted)
                        BEGIN
                            INSERT INTO dbo.[${changeLogTable}] (ActionType, RowID, ChangedField, OldValue, NewValue, ChangeTime)
                            SELECT
                                CASE
                                    WHEN EXISTS (SELECT * FROM deleted) THEN ''UPDATE''
                                    ELSE ''INSERT''
                                END,
                                CAST(i.${primaryKeyField} AS NVARCHAR(MAX)), -- Use dynamic primary key field
                                ''${config.field_name}'',
                                CAST(d.${config.field_name} AS NVARCHAR(MAX)),
                                CAST(i.${config.field_name} AS NVARCHAR(MAX)),
                                GETDATE()
                            FROM inserted i
                            LEFT JOIN deleted d ON i.${primaryKeyField} = d.${primaryKeyField};
                        END
                    END
                ');
            END
        `;
    await connection.query(checkTriggerQuery);

    // Step 3: Fetch Data from the Table
    const query = `
        SELECT ${primaryKeyField} AS RowID, [${config.field_name}] AS field_value
        FROM [dbo].[${config.table_name}]
        ORDER BY ${primaryKeyField} ASC
    `;
    console.log("Database Configuration:", dbConfig);
    console.log("Executing Query:", query);

    const result = await connection.query(query);
    const rows = result.recordset;

    if (!rows.length) {
      console.log("No rows found.");
      return [];
    }

    console.log(`Fetched ${rows.length} new rows from the table.`);

    // Step 4: Process Data
    const documents = [];

    for (const row of rows) {
      let processedContent;
      let fileUrl = "";

      try {
        const fileBuffer = row.field_value;
        const fileName = `mssql_${config.db_database}_${config.table_name}_file_${row.RowID}`;
        console.log("Config Field Type => ", config.field_type);

        if (config.field_type.toLowerCase() === "blob") {
          // Process BLOB Field
          const { extractedText, mimeType } = await processBlobField(
            fileBuffer
          );

          // Upload to Azure Blob Storage
          fileUrl = await uploadFileToBlob(fileBuffer, fileName, mimeType);
          console.log("File URL => ", fileUrl);

          // Assign extracted text
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
          `Failed to process content for row ID ${row.RowID}:`,
          error.message
        );
        continue;
      }

      // Split content into smaller chunks if necessary
      if (processedContent) {
        const chunks = splitLargeText(processedContent);
        chunks.forEach((chunk, index) => {
          documents.push({
            id: `mssql_${config.database}_${config.table_name}_${row.RowID}_${index}`,
            content: chunk,
            title: config.title || `MSSQL Row ID ${row.RowID}`,
            description: config.description || "No description provided",
            image: config.image || null,
            category: config.category,
            fileUrl: fileUrl,
          });
        });
      }
    }

    console.log(
      `Processed ${documents.length} rows. Saving to Azure Search index...`
    );

    return documents;
  } catch (error) {
    console.error("Error during MSSQL Sync:", error.message);
    throw new Error("Failed to fetch and process field content");
  } finally {
    await connection.close();
  }
}

async function saveMSSQLConnection({
  host,
  user,
  password,
  database,
  table_name,
  field_name,
  field_type,
  category,
  coid,
}) {
  try {
    if (!coid) {
      throw new Error("coid is undefined or invalid.");
    }

    const indexName = `datasource_mssql_connection_${coid.toLowerCase()}`;

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
      updatedAt: new Date().toISOString(),
    };

    console.log("Saving MSSQL Connection:", document);

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
      id: category, // Use category as the document ID to avoid duplicates
      body: {
        doc: document, // Update the document with the new values
        doc_as_upsert: true, // Create the document if it doesn't exist
      },
      retry_on_conflict: 3, // Retry in case of concurrent updates
    });

    console.log(
      `MSSQL Connection details saved successfully in index: ${indexName}`
    );
    return response;
  } catch (error) {
    console.error(
      "Error saving MSSQL connection to Elasticsearch:",
      error.message
    );
    throw new Error("Failed to save MSSQL connection to Elasticsearch");
  }
}

async function checkExistOfMSSQLConfig(
  host,
  database,
  table_name,
  field_name,
  coid
) {
  try {
    const indexName = `datasource_mssql_connection_${coid.toLowerCase()}`;

    // Check if the index exists
    const indexExists = await client.indices.exists({ index: indexName });

    if (!indexExists) {
      return "MSSQL configuration does not exist";
    }

    // Search for the MSSQL configuration with all conditions (AND operator)
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { match: { host: host } },
              { match: { database: database } },
              { match: { table_name: table_name } },
              { match: { field_name: field_name } },
            ],
          },
        },
      },
    });

    if (searchResponse.hits.total.value > 0) {
      return "MSSQL configuration already exists";
    } else {
      return "MSSQL configuration does not exist";
    }
  } catch (error) {
    console.error(
      "Error checking existence of MSSQL config in Elasticsearch:",
      error.message
    );
    throw new Error(
      "Failed to check existence of MSSQL config in Elasticsearch"
    );
  }
}

module.exports = {
  checkExistOfMSSQLConfig,
  saveMSSQLConnection,
  fetchAndProcessFieldContent,
};

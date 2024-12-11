const client = require("./../../config/elasticsearch");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
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
    try {
        const workbook = XLSX.read(buffer, { type: "buffer" }); // Read the XLSX file buffer
        let textContent = '';

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName]; // Access each sheet
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Convert sheet to array of rows

            rows.forEach(row => {
                textContent += row.join(' ') + '\n'; // Combine columns into a single line and add a newline
            });
        });

        return textContent.trim(); // Return combined text content
    } catch (error) {
        console.error("Error extracting text from XLSX:", error);
        throw new Error("Failed to extract text from XLSX");
    }
}

async function extractTextFromHtml(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent); // Load the HTML content
        return $('body').text().trim(); // Extract and return the text inside the <body> tag
    } catch (error) {
        console.error("Error extracting text from HTML:", error);
        throw new Error("Failed to extract text from HTML");
    }
}

async function processFieldContent(content, fieldType, jsonProperties, xmlPaths) {
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
        const checkChangeLogTableQuery = `
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = '${changeLogTable}'
            )
            BEGIN
                CREATE TABLE dbo.[${changeLogTable}] (
                    LogID INT IDENTITY PRIMARY KEY,
                    ActionType NVARCHAR(50),
                    RowID INT,
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
                CREATE TRIGGER trg_${config.table_name}_ChangeLog
                ON dbo.[${config.table_name}]
                AFTER INSERT, UPDATE
                AS
                BEGIN
                    INSERT INTO dbo.[${changeLogTable}] (ActionType, RowID, ChangedField, OldValue, NewValue, ChangeTime)
                    SELECT
                        CASE
                            WHEN EXISTS (SELECT * FROM inserted) AND EXISTS (SELECT * FROM deleted) THEN 'UPDATE'
                            WHEN EXISTS (SELECT * FROM inserted) THEN 'INSERT'
                        END,
                        i.Id,
                        '${config.field_name}',
                        d.${config.field_name},
                        i.${config.field_name},
                        GETDATE()
                    FROM inserted i
                    LEFT JOIN deleted d ON i.Id = d.Id;
                END;
            END
        `;
        await connection.query(checkTriggerQuery);

        // Step 3: Fetch Data from the Table
        const query = `SELECT [${config.field_name}], [Id] FROM [dbo].[${config.table_name}]`;
        console.log("Database Configuration:", dbConfig);
        console.log("Executing Query:", query);

        const result = await connection.query(query);
        const rows = result.recordset;

        if (!rows.length) {
            console.log("No rows found.");
            return [];
        }

        const documents = [];

        for (const row of rows) {
            const fieldValue = row[config.field_name];
            const processedContent = await processFieldContent(
                fieldValue,
                config.field_type,
                config.json_properties,
                config.xml_paths
            );

            if (processedContent) {
                documents.push({
                    id: row.Id.toString(),
                    content: processedContent,
                    title: config.title || "No Title Provided",
                    description: config.description || "No Description Provided",
                    image: config.image || null,
                    category: config.category || "default",
                });
            }
        }

        console.log(`Processed ${documents.length} rows. Saving to Azure Search index...`);

        return documents;
    } catch (error) {
        console.error("Error during MSSQL Sync:", error.message);
        throw new Error("Failed to fetch and process field content");
    } finally {
        await connection.close();
    }
}

async function saveMSSQLConnection({ host, user, password, database, table_name, field_name, field_type, category, coid }) {
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
            console.log(`Index ${indexName} does not exist. Creating index with mapping.`);
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

        console.log(`MSSQL Connection details saved successfully in index: ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving MSSQL connection to Elasticsearch:", error.message);
        throw new Error("Failed to save MSSQL connection to Elasticsearch");
    }
}

async function checkExistOfMSSQLConfig(host, database, table_name, field_name, coid) {
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
        console.error("Error checking existence of MSSQL config in Elasticsearch:", error.message);
        throw new Error("Failed to check existence of MSSQL config in Elasticsearch");
    }
}

module.exports = {
    checkExistOfMSSQLConfig,
    saveMSSQLConnection,
    fetchAndProcessFieldContent
}
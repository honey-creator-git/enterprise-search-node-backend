const client = require("./../../config/elasticsearch");
const { Client } = require("pg");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const XLSX = require("xlsx");

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

async function savePostgreSQLConnection(host, user, password, database, table_name, field_name, field_type, category, coid, lastProcessedId) {
    try {
        const indexName = `datasource_postgresql_connection_${coid.toLowerCase()}`;

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
        }

        // Check if the index exists
        const indexExists = await client.indices.exists({ index: indexName });

        // If index doesn't exist, crete it with a proper mapping
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

        console.log(`MySQL Connection details saved successfully in index: ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving postgresql connection to ElasticSearch : ", error.message);
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
                            { match: { table_name: table_name } }
                        ]
                    }
                }
            }
        });

        if (searchResponse.hits.total.value > 0) {
            return "PostgreSQL configuration is already existed";
        } else {
            return "PostgreSQL configuration is not existed";
        }
    } catch (error) {
        console.error("Error checking existance of PostgreSQL config in ElasticSearch:", error);
        throw new Error("Failed to check existance of PostgreSQL config in Elasticsearch");
    }
}

async function fetchAndProcessFieldContentOfPostgreSQL(config) {
    const client = new Client({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: {
            rejectUnauthorized: true,
        },
    });

    try {
        await client.connect();
        console.log(`Fetching data from table: ${config.table_name}...`);

        // Step 1: Check and Create Change Log Table
        const changeLogTable = `${config.table_name}_changelog`;
        const checkChangeLogTableQuery = `
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = '${changeLogTable}'
                ) THEN
                    CREATE TABLE ${changeLogTable} (
                        log_id SERIAL PRIMARY KEY,
                        operation_type TEXT NOT NULL, -- INSERT or UPDATE
                        row_id INT NOT NULL,
                        changed_field TEXT NOT NULL,
                        old_value TEXT,
                        new_value TEXT NOT NULL,
                        change_time TIMESTAMP DEFAULT NOW()
                    );
                END IF;
            END $$;
        `;
        await client.query(checkChangeLogTableQuery);

        // Step 2: Check and Create Trigger
        const triggerName = `${config.table_name}_changelog_trigger`;
        const checkTriggerQuery = `
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT FROM pg_trigger 
                    WHERE tgname = '${triggerName}'
                ) THEN
                    CREATE OR REPLACE FUNCTION log_changes_to_${changeLogTable}()
                    RETURNS TRIGGER AS $$
                    BEGIN
                        IF (TG_OP = 'INSERT') THEN
                            INSERT INTO ${changeLogTable} (operation_type, row_id, changed_field, new_value)
                            VALUES ('INSERT', NEW.id, '${config.field_name}', NEW.${config.field_name});
                        ELSIF (TG_OP = 'UPDATE') THEN
                            INSERT INTO ${changeLogTable} (operation_type, row_id, changed_field, old_value, new_value)
                            VALUES ('UPDATE', NEW.id, '${config.field_name}', OLD.${config.field_name}, NEW.${config.field_name});
                        END IF;
                        RETURN NEW;
                    END;
                    $$ LANGUAGE plpgsql;

                    CREATE TRIGGER ${triggerName}
                    AFTER INSERT OR UPDATE ON ${config.table_name}
                    FOR EACH ROW
                    EXECUTE FUNCTION log_changes_to_${changeLogTable}();
                END IF;
            END $$;
        `;
        await client.query(checkTriggerQuery);

        // Step 3: Fetch Data from the Table
        const fetchQuery = `
            SELECT id, ${config.field_name} AS field_value
            FROM ${config.table_name}
            WHERE id > $1
            ORDER BY id ASC
        `;
        const res = await client.query(fetchQuery, [config.lastProcessedId || 0]);

        if (res.rows.length === 0) {
            console.log("No new rows found in the table.");
            return {
                data: [],
                lastProcessedId: config.lastProcessedId || 0,
            };
        }

        console.log(`Fetched ${res.rows.length} new rows from the table.`);
        const documents = [];

        // Step 4: Process Data
        for (const row of res.rows) {
            let processedContent;

            try {
                processedContent = await processFieldContent(
                    row.field_value,
                    config.field_type,
                    config.json_properties,
                    config.xml_paths
                );
            } catch (error) {
                console.error(`Failed to process content for row ID ${row.id}:`, error.message);
                continue;
            }

            if (processedContent) {
                documents.push({
                    id: row.id.toString(),
                    content: processedContent,
                    title: config.title || `Row ID ${row.id}`,
                    description: config.description || "No description provided",
                    image: config.image || null,
                    category: config.category,
                });
            }
        }

        const lastProcessedId = res.rows[res.rows.length - 1].id;
        console.log(`Last Processed ID: ${lastProcessedId}`);

        return { data: documents, lastProcessedId };
    } catch (error) {
        console.error("Error during PostgreSQL Sync:", error.message);
        throw new Error("Failed to fetch and process field content");
    } finally {
        await client.end();
    }
}

async function registerPostgreSQLConnection(config) {
    try {
        return await savePostgreSQLConnection(config.host, config.user, config.password, config.database, config.table_name, config.field_name, config.field_type, config.category, config.coid, config.lastProcessedId);
    } catch (error) {
        console.error("Failed to save postgresql connection: ", error.message);
        throw new Error("Failed to save postgresql connection");
    }
}

module.exports = {
    registerPostgreSQLConnection,
    fetchAndProcessFieldContentOfPostgreSQL,
    checkExistOfPostgreSQLConfig
}
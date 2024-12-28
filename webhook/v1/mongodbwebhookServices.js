const { MongoClient } = require('mongodb');
const client = require("./../../config/elasticsearch");
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

async function saveMongoDBConnection(mongoUri, database, collection_name, field_name, field_type, category, coid) {
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
            updatedAt: new Date().toISOString()
        }

        // Check if index exists
        const indexExists = await client.indices.exists({ index: indexName });

        // If the index doesn't exist, create it with the appropriate mapping
        if (!indexExists) {
            console.log(`Index ${indexName} does not exist. Creating index with mapping.`);
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
                            updatedAt: { type: "date" }
                        }
                    }
                }
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

        console.log(`MongoDB Connection details saved successfully in index : ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving MongoDB connection to Elasticsearch: ", error.message);
        throw new Error("Failed to save MongoDB connection to Elasticsearch");
    }
}

async function fetchDataFromMongoDB(config) {

    // MongoDB URI and client setup
    const uri = config.mongoUri; // MongoDB connection URI
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {

        // Connect to MongoDB
        await client.connect();
        console.log("Connected to MongoDB");

        // Select the database and collection
        const database = client.db(config.database);
        const collection = database.collection(config.collection_name);

        console.log(`Fetching data from collection: ${config.collection_name}...`);

        // Fetch all documents from the collection (optionally apply filters)
        const query = {}; // Empty empty to fetch all documents. Add filters here if needed.
        const cursor = collection.find(query);

        const documents = await cursor.toArray();

        const data = [];


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
                console.error(`Failed to process content for row ID ${document._id}:`, error.message);
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


        // Iterate through the cursor to collect all documents
        // await documents.forEach((doc) => {
        //     data.push({
        //         id: doc._id.toString(), // Convert MongoDB objectId to string
        //         title: doc.title,
        //         content: doc.content,
        //         description: doc.description,
        //         image: doc.image,
        //         category: config.category // Add additional fields if needed
        //     });
        // });

        console.log(`Fetched ${data.length} documents from the collection.`);

        // Return the data
        return {
            data,
        }

    } catch (error) {
        console.error('Error syncing MongoDB to Azure ')
    }
}

async function registerMongoDBConnection(config) {
    try {
        return await saveMongoDBConnection(config.mongoUri, config.database, config.collection_name, config.field_name, config.field_type, config.category, config.coid);
    } catch (error) {
        console.error("Failed to save MongoDB connection: ", error.message);
        throw new Error("Failed to save MongoDB connection");
    }
}

async function checkExistOfMongoDBConfig(mongoUri, database, collection_name, coid) {
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
                            { match: { collection_name: collection_name } }
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
        console.error("Error checking existence of MongoDB config in Elasticsearch:", error.message);
        throw new Error("Failed to check existence of MongoDB config in Elasticsearch");
    }
}

module.exports = {
    checkExistOfMongoDBConfig,
    registerMongoDBConnection,
    fetchDataFromMongoDB
}
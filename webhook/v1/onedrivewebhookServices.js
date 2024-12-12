
const client = require("./../../config/elasticsearch");
const axios = require("axios");
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const cheerio = require('cheerio');
const XLSX = require('xlsx');
const pptParser = require('ppt-parser');
const RTFParser = require('rtf-parser');
const { parseStringPromise } = require('xml2js');
const parseCsv = require('csv-parser');

async function extractTextFromPdf(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text; // Extracted text from the PDF file
    } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw new Error("Failed to extract text from PDF");
    }
}
async function extractTextFromDoc(buffer) {
    try {
        const { value } = await mammoth.extractRawText({ buffer });
        return value; // Extracted text from the DOC file
    } catch (error) {
        console.error("Error extracting text from DOC:", error);
        throw new Error("Failed to extract text from DOC");
    }
}

async function extractTextFromDocx(buffer) {
    try {
        const { value } = await mammoth.extractRawText({ buffer });
        return value; // Extracted text from the DOCX file
    } catch (error) {
        console.error("Error extracting text from DOCX:", error);
        throw new Error("Failed to extract text from DOCX");
    }
}

async function extractTextFromHtml(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent);
        return $('body').text(); // Extract the text inside the body tag
    } catch (error) {
        console.error("Error extracting text from HTML:", error);
        throw new Error("Failed to extract text from HTML");
    }
}

async function extractTextFromXlsx(buffer) {
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        let textContent = '';

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const jsonSheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Convert sheet to array of rows
            jsonSheetData.forEach(row => {
                textContent += row.join(' ') + '\n'; // Join columns and add line breaks between rows
            });
        });

        return textContent; // Return combined text content from the spreadsheet
    } catch (error) {
        console.error("Error extracting text from XLSX:", error);
        throw new Error("Failed to extract text from XLSX");
    }
}

async function extractTextFromTxt(textContent) {
    try {
        return textContent; // Return the raw text content of the TXT file
    } catch (error) {
        console.error("Error extracting text from TXT:", error);
        throw new Error("Failed to extract text from TXT");
    }
}

async function extractTextFromCsv(data) {
    const results = [];
    return new Promise((resolve, reject) => {
        const stream = require('stream');
        const readable = new stream.Readable();
        readable.push(data);
        readable.push(null);

        readable
            .pipe(parseCsv())
            .on('data', (row) => results.push(row))
            .on('end', () => resolve(JSON.stringify(results, null, 2)))
            .on('error', (err) => reject(err));
    });
}

async function extractTextFromXml(data) {
    try {
        const result = await parseStringPromise(data);
        return JSON.stringify(result, null, 2);
    } catch (error) {
        console.error("Failed to parse XML:", error.message);
        throw error;
    }
}

async function extractTextFromRtx(data) {
    return new Promise((resolve, reject) => {
        RTFParser.parseString(data, (err, doc) => {
            if (err) return reject(err);
            let text = '';
            doc.content.forEach((block) => {
                if (block.type === 'text') {
                    text += block.value;
                }
            });
            resolve(text);
        });
    });
}

async function extractTextFromPpt(buffer) {
    const result = await pptParser.parse(buffer);
    return result.text || 'No text found';
}

async function extractTextFromPptx(buffer) {
    const result = await pptParser.parse(buffer);
    return result.text || 'No text found';
}

async function extractTextFromJson(data) {
    try {
        // Parse the JSON data if it is in string format
        const jsonData = typeof data === "string" ? JSON.parse(data) : data;

        // Convert JSON into a readable format (e.g., stringified)
        const formattedText = JSON.stringify(jsonData, null, 2); // Pretty-print with 2 spaces

        // Optionally: Extract specific fields if needed
        // Example: Collect all keys and values into a single string
        // const extractedFields = Object.entries(jsonData)
        //     .map(([key, value]) => `${key}: ${value}`)
        //     .join("\n");

        return formattedText; // Or return extractedFields if needed
    } catch (error) {
        console.error("Error processing JSON content:", error.message);
        throw new Error("Failed to process JSON content");
    }
}

async function checkExistOfOneDriveConfig(client_id, coid) {
    try {
        const indexName = `datasource_onedrive_connection_${coid.toLowerCase()}`;

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
                        clientId: client_id,
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
        console.error("Error checking existance of one drive config in ElasticSearch:", error);
        throw new Error("Failed to check existance of one drive config in Elasticsearch");
    }
}

async function saveOneDriveConnection(tenantId, clientId, clientSecret, userName, category, coid, expirationDateTime) {
    try {
        const indexName = `datasource_onedrive_connection_${coid.toLowerCase()}`;

        const document = {
            tenantId,
            clientId,
            clientSecret,
            userName,
            category,
            coid,
            expirationDateTime,
            updatedAt: new Date().toISOString(),
        }

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
                            tenantId: { type: "text" },
                            clientId: { type: "text" },
                            clientSecret: { type: "text" },
                            userName: { type: "text" },
                            category: { type: "keyword" },
                            coid: { type: "keyword" },
                            expirationDateTime: { type: "date" }, // New field
                            updatedAt: { type: "date" },
                        }
                    }
                }
            });
            console.log(`Index ${indexName} created successfully.`);
        }

        // Update or insert the document
        const response = await client.update({
            index: indexName,
            id: category,
            body: {
                doc: document, // Update the document with the new values
                doc_as_upsert: true, // Create the document if it does not exist
            },
            retry_on_conflict: 3, // Retry in case of concurrent updates
        });

        console.log(`OneDrive Connection details saved successfully in index: ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving onedrive connection to Elastic Search : ", error.message);
        throw new Error("Failed to save onedrive connection to ElasticSearch");
    }
}

async function registerOneDriveConnection(config) {
    try {
        return await saveOneDriveConnection(config.tenant_id, config.client_id, config.client_secret, config.userName, config.category, config.coid, config.expirationDateTime);
    } catch (saveError) {
        console.error("Failed to save onedrive connection: ", saveError.message);
        throw new Error("Failed to save onedrive connection");
    }
}

// Function to create OneDrive subscription
async function createOneDriveSubscription(accessToken, userName) {
    console.log("Creating OneDrive subscription for user:", userName);
    const subscriptionData = {
        changeType: "updated", // Listen for all updates (add, update, delete)
        notificationUrl: "https://es-services.onrender.com/api/v1/sync-one-drive/webhook",  // URL to receive notifications
        resource: `users/${userName}/drive/root`,  // Listen for changes in the user's OneDrive
        expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),  // 1 hour from now
        clientState: "clientStateValue"  // Optional: any state to track the subscription
    };

    const graphBaseUrl = "https://graph.microsoft.com/v1.0";

    try {
        const response = await axios.post(
            `${graphBaseUrl}/subscriptions`,
            subscriptionData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );
        console.log("Subscription created:", response.data);  // Log the response for debugging
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error("Error response:", error.response.data);  // Log full error response
            console.error("Error status:", error.response.status);  // Log status code
        } else {
            console.error("Error message:", error.message);  // Log message if response is unavailable
        }
        throw new Error("Failed to create subscription");
    }
}

// Function to get an access token
async function getAccessToken(tenant_id, client_id, client_secret) {
    const tokenEndpoint = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append("client_id", client_id);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");
    params.append("client_secret", client_secret);

    try {
        const response = await axios.post(tokenEndpoint, params, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error("Failed to get access token:", error.message);
        throw new Error("Failed to get access token");
    }
}

// Helper function to fetch files within a specific folder
async function getFolderFiles(folderId, accessToken, graphBaseUrl, userName) {
    const folderFiles = [];
    try {
        const response = await axios.get(`${graphBaseUrl}/users/${userName}/drive/items/${folderId}/children`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        for (const file of response.data.value) {
            folderFiles.push(file); // Push file to the list
        }
    } catch (error) {
        console.error(`Failed to fetch files from folder ${folderId}:`, error.message);
    }
    return folderFiles;
}

// Function to fetch files from OneDrive
async function getFilesFromOneDrive(accessToken, graphBaseUrl, userName) {

    let files = [];

    try {
        const response = await axios.get(`${graphBaseUrl}/users/${userName}/drive/root/children`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        for (const folder of response.data.value) {
            if (folder.folder && folder.folder.childCount > 0) {
                const folderFiles = await getFolderFiles(folder.id, accessToken, graphBaseUrl, userName); // Fetch files from the folder
                files = files.concat(folderFiles);
            }
        }

        return files; // List of files and folders
    } catch (error) {
        console.error("Failed to fetch files from OneDrive:", error.message);
        throw new Error("Failed to fetch files from OneDrive");
    }
}

// Function to fetch file content from OneDrive
async function fetchFileContentFromOneDrive(file, accessToken) {
    try {
        if (!file["@microsoft.graph.downloadUrl"]) {
            console.log(`Skipping folder: ${file.name}`);
            return null;
        }

        const fileType = file.name.split('.').pop().toLowerCase(); // Extract file extension and make it lowercase

        const response = await axios.get(file["@microsoft.graph.downloadUrl"], {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: ['txt', 'json', 'html', 'csv', 'xml', 'rtx'].includes(fileType) ? 'text' : 'arraybuffer',
        });

        if (fileType === 'txt') {
            return extractTextFromTxt(response.data);
        } else if (fileType === 'json') {
            return extractTextFromJson(response.data);
        } else if (fileType === 'html') {
            return extractTextFromHtml(response.data);
        } else if (fileType === 'csv') {
            return extractTextFromCsv(response.data);
        } else if (fileType === 'xml') {
            return extractTextFromXml(response.data);
        } else if (fileType === 'pdf') {
            return extractTextFromPdf(Buffer.from(response.data, 'binary'));
        } else if (fileType === 'doc') {
            return extractTextFromDoc(Buffer.from(response.data, 'binary'));
        } else if (fileType === 'docx') {
            return extractTextFromDocx(Buffer.from(response.data, 'binary'));
        } else if (fileType === 'xlsx') {
            return extractTextFromXlsx(Buffer.from(response.data, 'binary'));
        } else if (fileType === 'rtx') {
            return extractTextFromRtx(response.data);
        } else if (fileType === 'ppt') {
            return extractTextFromPpt(Buffer.from(response.data, 'binary'));
        } else if (fileType === 'pptx') {
            return extractTextFromPptx(Buffer.from(response.data, 'binary'));
        } else {
            console.log(`Unsupported file type: ${fileType}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching content for file: ${file.name}`, error.message);
        throw new Error(`Failed to fetch content for file: ${file.name}`);
    }
}

async function getStoredCredentials(userName) {
    try {
        // Step 1: Get all indices with the prefix "datasource_onedrive_connection_"
        const indicesResponse = await client.cat.indices({ format: "json" });
        const indices = indicesResponse
            .map((index) => index.index)
            .filter((name) => name.startsWith("datasource_onedrive_connection_"));

        if (indices.length === 0) {
            console.error("No indices found with the prefix datasource_onedrive_connection_");
            return null;
        }

        // Step 2: Search for the userName across all matching indices
        for (const indexName of indices) {
            const response = await client.search({
                index: indexName,
                body: {
                    query: {
                        match: {
                            userName: userName, // Search by userName
                        }
                    },
                    size: 1 // We only expect one result
                }
            });

            // If a document is found, return the credentials
            if (response.hits.total.value > 0) {
                const storedCredentials = response.hits.hits[0]._source; // Extract document source
                console.log(`Credentials found in index: ${indexName}`);
                return {
                    tenant_id: storedCredentials.tenantId,
                    client_id: storedCredentials.clientId,
                    client_secret: storedCredentials.clientSecret,
                    category: storedCredentials.category,
                    coid: storedCredentials.coid,
                    expirationDateTime: storedCredentials.expirationDateTime, // Include this if needed
                };
            }
        }

        console.error(`No credentials found for user: ${userName}`);
        return null; // Return null if no credentials found in any index
    } catch (error) {
        console.error("Error retrieving stored credentials from ElasticSearch:", error.message);
        throw new Error("Failed to retrieve stored credentials");
    }
}

async function getFileDetails(fileId, accessToken, userName) {
    try {
        const graphBaseUrl = "https://graph.microsoft.com/v1.0";

        // Build the URL to fetch file details
        const fileDetailsUrl = `${graphBaseUrl}/users/${userName}/drive/items/${fileId}`;

        // Make the API call to retrieve the file details
        const response = await axios.get(fileDetailsUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        // Return the file details from the response
        return response.data; // This contains file metadata such as name, size, etc.
    } catch (error) {
        console.error("Error fetching file details from OneDrive:", error.message);
        throw new Error("Failed to fetch file details from OneDrive");
    }
}

module.exports = {
    getAccessToken,
    getFilesFromOneDrive,
    getStoredCredentials,
    getFileDetails,
    checkExistOfOneDriveConfig,
    registerOneDriveConnection,
    createOneDriveSubscription,
    fetchFileContentFromOneDrive,
}
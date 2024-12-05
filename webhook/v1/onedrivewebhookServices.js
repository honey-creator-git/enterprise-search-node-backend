
const client = require("./../../config/elasticsearch");
const axios = require("axios");

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
    const subscriptionData = {
        changeType: "updated,created,deleted",  // Listen for created, updated, or deleted events
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
        return response.data;
    } catch (error) {
        console.error("Error creating subscription:", error.message);
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
async function getFolderFiles(folderId, accessToken) {
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
                const folderFiles = await getFolderFiles(folder.id, accessToken); // Fetch files from the folder
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

        const response = await axios.get(file["@microsoft.graph.downloadUrl"], {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: "text"
        });

        return response.data; // Return the raw file content
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
const client = require("./../../config/elasticsearch");
const axios = require("axios");

async function checkExistOfSharePointConfig(client_id, coid) {
    try {
        const indexName = `datasource_sharepoint_connection_${coid.toLowerCase()}`;

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
        console.error("Error checking existance of SharePoint config in ElasticSearch:", error);
        throw new Error("Failed to check existance of SharePoint config in Elasticsearch");
    }
}

async function getAccessTokenOfSharePoint(clientId) {
    const tokenDoc = await client.get({
        index: "sharepoint_user_token",
        id: clientId
    });

    return tokenDoc._source;
}

async function fetchAllAccessibleSites(accessToken) {
    const graphBaseUrl = "https://graph.microsoft.com/v1.0/sites";

    try {
        const response = await axios.get(graphBaseUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        console.log("response => ", response.data);

        return response.data.value; // Array of sites
    } catch (error) {
        console.error("Error fetching SharePoint sites:", error.message);
        throw new Error("Failed to fetch SharePoint sites");
    }
}

async function saveSharePointTokensToElasticSearch(clientId, clientSecret, tenantId, accessToken, refreshToken, userId) {
    try {
        const indexName = "sharepoint_user_token";

        const document = {
            clientId,
            clientSecret,
            tenantId,
            accessToken,
            refreshToken,
            userId,
            createdAt: new Date().toISOString(),
        }

        // Check if index exists
        const indexExists = await client.indices.exists({ index: indexName });

        // If index doesn't exist, create it with a proper mapping
        if (!indexExists) {
            await client.indices.create({
                index: indexName,
                body: {
                    mappings: {
                        properties: {
                            clientId: { type: "text" },
                            clientSecret: { type: "text" },
                            tenantId: { type: "text" },
                            accessToken: { type: "text" },
                            refreshToken: { type: "text" },
                            userId: { type: "text" },
                            createdAt: { type: "date" }
                        }
                    }
                }
            });
            console.log(`Index ${indexName} created successfully.`);
        }

        // Update or insert the document
        const response = await client.update({
            index: indexName,
            id: clientId,
            body: {
                doc: document, // Update the document with the new values
                doc_as_upsert: true, // Create the document if it does not exist
            },
            retry_on_conflict: 3, // Retry in case of concurrent updates
        });

        console.log(`SharePoint tokens saved successfully in index: ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving SharePoint tokens to Elastic Search : ", error.message);
        throw new Error("Failed to save SharePoint tokens to ElasticSearch");
    }
}

module.exports = {
    saveSharePointTokensToElasticSearch,
    fetchAllAccessibleSites,
    getAccessTokenOfSharePoint,
    checkExistOfSharePointConfig
}
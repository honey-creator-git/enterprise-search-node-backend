
const client = require("./../../config/elasticsearch");
const mysql = require("mysql2/promise");
const fs = require('fs'); // To read the SSL certificate file

async function saveMySQLConnection(host, user, password, database, table_name, category, coid, lastProcessedId) {
    try {
        const indexName = `datasource_mysql_connection_${coid.toLowerCase()}`;

        const document = {
            host,
            user,
            password,
            database,
            table_name,
            category,
            coid,
            lastProcessedId: lastProcessedId || 0, // Default to 0 if not provided
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
                            host: { type: "text" },
                            user: { type: "text" },
                            password: { type: "text" },
                            database: { type: "text" },
                            table_name: { type: "text" },
                            category: { type: "text" },
                            coid: { type: "keyword" },
                            lastProcessedId: { type: "long" },
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
            id: category, // Use categoryId as the document ID to avoid duplicates
            body: {
                doc: document, // Update the document with the new values
                doc_as_upsert: true, // Create the document if it doesn't exist
            },
            retry_on_conflict: 3, // Retry in case of concurrent updates
        });

        console.log(`MySQL Connection details saved successfully in index: ${indexName}`);
        return response;
    } catch (error) {
        console.error("Error saving mysql connection to Elastic Search : ", error.message);
        throw new Error("Failed to save mysql connection to ElasticSearch");
    }
}
async function fetchDataFromMySQL(config) {
    const connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: {
            ca: fs.readFileSync('./DigiCertGlobalRootCA.crt.pem') // Replace with the actual path to the certificate
        }
    });

    try {
        console.log(`Fetching data from table: ${config.table_name}...`);

        // Fetch rows where `id` is greater than the last processed ID
        const [rows] = await connection.query(
            `SELECT * FROM ${config.table_name} WHERE id > ? ORDER BY id ASC`,
            [config.lastProcessedId || 0] // Use lastProcessedId if available, otherwise start from 0
        );

        if (rows.length === 0) {
            console.log("No new rows found in the table.");
            return {
                data: [],
                lastProcessedId: config.lastProcessedId || 0, // Return the same lastProcessedId
            };
        }

        console.log(`Fetched ${rows.length} new rows from the table.`);

        // Map rows to the required format
        const data = rows.map((row) => ({
            id: row.id.toString(),
            title: row.title,
            content: row.content,
            description: row.description,
            image: row.image,
            category: config.category,
        }));

        // Find the last processed ID from the fetched rows
        const lastProcessedId = rows[rows.length - 1].id;

        console.log(`Last Processed ID: ${lastProcessedId}`);

        // Return the data and the last processed ID
        return {
            data,
            lastProcessedId,
        };
    } finally {
        await connection.end();
    }

}

async function registerMySQLConnection(config) {
    try {
        return await saveMySQLConnection(config.host, config.user, config.password, config.database, config.table_name, config.category, config.coid, config.lastProcessedId);
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
                            { match: { table_name: table_name } }
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
        console.error("Error checking existance of MySQL config in ElasticSearch:", error);
        throw new Error("Failed to check existance of MySQL config in Elasticsearch");
    }
}

module.exports = {
    checkExistOfMySQLConfig,
    fetchDataFromMySQL,
    registerMySQLConnection
}
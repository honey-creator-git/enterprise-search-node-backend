
const client = require("./../../config/elasticsearch");
const mysql = require("mysql2/promise");
const fs = require('fs'); // To read the SSL certificate file

async function saveMySQLConnection(host, user, password, database, table_name, category, coid, binlogFile, binlogPosition) {
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
            binlogFile,
            binlogPosition,
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
                            binlogFile: { type: "keyword" },
                            binlogPosition: { type: "long" },
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
        const [rows] = await connection.query(`SELECT * FROM ${config.table_name}`);
        if (rows.length === 0) {
            console.log("No rows found in the table.");
            return {
                data: [],
            }
        }

        // Map rows to the required format
        const data = rows.map(row => ({
            id: row.id.toString(),
            title: row.title,
            content: row.content,
            description: row.description,
            image: row.image,
            category: config.category
        }));

        // Fetch the current binary log position
        const [binlogStatus] = await connection.query('SHOW MASTER STATUS');
        const { File: binlogFile, Position: binlogPosition } = binlogStatus[0];

        console.log(`Current Binlog File: ${binlogFile}, Position: ${binlogPosition}`);

        // Return the data and the last processed ID
        return {
            data,
            binlogFile,
            binlogPosition,
        }
    } finally {
        await connection.end();
    }

}

async function registerMySQLConnection(config) {
    try {
        return await saveMySQLConnection(config.host, config.user, config.password, config.database, config.table_name, config.category, config.coid, config.binlogFile, config.binlogPosition);
    } catch (saveError) {
        console.error("Failed to save mysql connection: ", saveError.message);
        throw new Error("Failed to save mysql connection");
    }
}

module.exports = {
    fetchDataFromMySQL,
    registerMySQLConnection
}
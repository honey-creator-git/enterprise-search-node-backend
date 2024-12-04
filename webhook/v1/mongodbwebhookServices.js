const { MongoClient } = require('mongodb');
const client = require("./../../config/elasticsearch");

async function saveMongoDBConnection(mongoUri, database, collection_name, category, coid) {
    try {

        const indexName = `datasource_mongodb_connection_${coid.toLowerCase()}`;

        const document = {
            mongoUri,
            database,
            collection_name,
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

        // Iterate through the cursor to collect all documents
        await documents.forEach((doc) => {
            data.push({
                id: doc._id.toString(), // Convert MongoDB objectId to string
                title: doc.title,
                content: doc.content,
                description: doc.description,
                image: doc.image,
                category: config.category // Add additional fields if needed
            });
        });

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
        return await saveMongoDBConnection(config.mongoUri, config.database, config.collection_name, config.category, config.coid);
    } catch (error) {
        console.error("Failed to save MongoDB connection: ", error.message);
        throw new Error("Failed to save MongoDB connection");
    }
}

module.exports = {
    registerMongoDBConnection,
    fetchDataFromMongoDB
}
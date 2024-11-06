const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
require("dotenv").config();

const searchClient = new SearchClient(
  process.env.AZURE_SEARCH_ENDPOINT,
  process.env.AZURE_SEARCH_INDEX_NAME,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

module.exports = searchClient;

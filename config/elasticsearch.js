const { Client } = require("@elastic/elasticsearch");
require("dotenv").config();

const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
});

module.exports = client;

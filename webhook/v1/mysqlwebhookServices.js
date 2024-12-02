
const mysql = require("mysql2/promise");

async function fetchDataFromMySQL(config) {
    const connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database
    });

    try {
        const [rows] = await connection.query(`SELECT * FROM ${config.table_name}`)
        return rows.map(row => ({
            title: row.title,
            content: row.content,
            description: row.description,
            image: row.image,
            category: config.category
        }));
    } finally {
        await connection.end();
    }

}

module.exports = {
    fetchDataFromMySQL
}
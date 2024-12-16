const axios = require("axios");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");
const parseCsv = require('csv-parser');
const { parseStringPromise } = require("xml2js");
const RTFParser = require("rtf-parser");
const pptParser = require("ppt-parser");
const cheerio = require("cheerio");

// Helper function to check if bucket exists
const checkBucketExists = async (s3Client, bucketCommand) => {
    try {
        await s3Client.send(bucketCommand);
        return true; // Bucket exists
    } catch (err) {
        if (err.name === "NotFound" || err.name === "NoSuchBucket") {
            return false; // Bucket does not exist
        }
        throw new Error(`Error checking bucket existence: ${err.message}`);
    }
};

// Helper function to list files in bucket
const listFilesInBucket = async (s3Client, command) => {
    try {
        const data = await s3Client.send(command);
        if (!data.Contents || data.Contents.length === 0) {
            throw new Error("No specified bucket/folder path");
        }
        return data.Contents.map((file) => ({
            Key: file.Key,
            LastModified: file.LastModified,
            Size: file.Size,
        }));
    } catch (err) {
        console.error("Error listing files in bucket:", err.message);
        throw new Error(err.message);
    }
};

// Fetch the file content from the Wasabi bucket
const getFileFromBucket = async (s3Client, getCommand) => {
    try {
        const response = await s3Client.send(getCommand);
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks); // Return file content as a buffer
    } catch (err) {
        console.error(`Error fetching file: ${fileKey}`, err.message);
        throw new Error(`Failed to fetch file: ${fileKey}`);
    }
};

async function extractTextFromPpt(buffer) {
    const result = await pptParser.parse(buffer);
    return result.text || 'No text found';
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

async function extractTextFromDocx(buffer) {
    try {
        const { value } = await mammoth.extractRawText({ buffer });
        return value; // Extracted text from the DOCX file
    } catch (error) {
        console.error("Error extracting text from DOCX:", error);
        throw new Error("Failed to extract text from DOCX");
    }
}

async function extractTextFromPdf(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text; // Extracted text from the PDF file
    } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw new Error("Failed to extract text from PDF");
    }
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

async function extractTextFromHtml(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent);
        return $('body').text(); // Extract the text inside the body tag
    } catch (error) {
        console.error("Error extracting text from HTML:", error);
        throw new Error("Failed to extract text from HTML");
    }
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

async function extractTextFromTxt(textContent) {
    try {
        return textContent; // Return the raw text content of the TXT file
    } catch (error) {
        console.error("Error extracting text from TXT:", error);
        throw new Error("Failed to extract text from TXT");
    }
}

const processFileContent = async (fileKey, fileBuffer) => {
    const fileType = fileKey.split(".").pop().toLowerCase(); // Extract file extension

    if (fileType === "txt") {
        return extractTextFromTxt(fileBuffer.toString("utf-8"));
    } else if (fileType === "json") {
        return extractTextFromJson(fileBuffer.toString("utf-8"));
    } else if (fileType === "html") {
        return extractTextFromHtml(fileBuffer.toString("utf-8"));
    } else if (fileType === "csv") {
        return extractTextFromCsv(fileBuffer.toString("utf-8"));
    } else if (fileType === "xml") {
        return extractTextFromXml(fileBuffer.toString("utf-8"));
    } else if (fileType === "pdf") {
        return extractTextFromPdf(fileBuffer);
    } else if (fileType === "doc" || fileType === "docx") {
        return extractTextFromDocx(fileBuffer);
    } else if (fileType === "xlsx") {
        return extractTextFromXlsx(fileBuffer);
    } else if (fileType === "rtx") {
        return extractTextFromRtx(fileBuffer.toString("utf-8"));
    } else if (fileType === "ppt" || fileType === "pptx") {
        return extractTextFromPpt(fileBuffer);
    } else {
        console.log(`Unsupported file type: ${fileType}`);
        return null;
    }
};


module.exports = {
    checkBucketExists,
    processFileContent,
    getFileFromBucket,
    listFilesInBucket
}
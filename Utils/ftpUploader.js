// // utils/ftpUploader.js
// const ftp = require("basic-ftp");
// const path = require("path");

// const ftpConfig = {
//   host: process.env.FTP_HOST, // your-domain.com
//   user: process.env.FTP_USER, // your cPanel username
//   password: process.env.FTP_PASSWORD, // your FTP password
//   secure: false, // use FTPS
// };

// async function uploadToFTP(buffer, filename) {
//   const client = new ftp.Client();

//   try {
//     await client.access(ftpConfig);

//     // Change to your public_html directory or subfolder
//     await client.ensureDir("/uploads");

//     // Upload the file buffer
//     await client.uploadFrom(buffer, filename);

//     // Return the public URL
//     return process.env.FTP_HOST + "/" + filename;
//   } catch (error) {
//     throw new Error(`FTP upload failed: ${error.message}`);
//   } finally {
//     client.close();
//   }
// }

// module.exports = { uploadToFTP };
const ftp = require("basic-ftp");
const path = require("path");
const { Readable } = require("stream"); // Add this import

const ftpConfig = {
  host: process.env.FTP_HOST, //"ftp.masetawosha.com",
  user: process.env.FTP_USER, // "vercelFiles@transport.masetawosha.com",
  password: process.env.FTP_PASSWORD, // process.env.FTP_PASSWORD,
  port: 21,
  secure: true,
  secureOptions: {
    rejectUnauthorized: false,
  },
};

async function uploadToFTP(buffer, filename) {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    console.log("Connecting to FTP...");
    await client.access(ftpConfig);
    console.log("FTP connection successful");

    console.log("Ensuring directory exists...");
    // await client.ensureDir("public_html/uploads");
    console.log("Directory ready");

    console.log("Uploading file:", filename);

    // Convert buffer to readable stream
    const readableStream = Readable.from(buffer);

    // Upload the file
    await client.uploadFrom(readableStream, filename);
    console.log("File uploaded successfully");

    const fileUrl = `${process.env.FTP_UPLOADS_PATH + filename}`;
    console.log("File accessible at:", fileUrl);

    return fileUrl;
  } catch (error) {
    console.error("FTP Upload Error:", error);
    throw new Error(`FTP upload failed: ${error.message}`);
  } finally {
    client.close();
  }
}

async function deleteFromFTP(filename) {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    console.log("Connecting to FTP for deletion...");
    await client.access(ftpConfig);
    console.log("FTP connection successful for deletion");

    // Check if file exists before trying to delete
    try {
      await client.size(filename);
      console.log("File exists, proceeding with deletion:", filename);
    } catch (error) {
      console.log("File does not exist on FTP, skipping deletion:", filename);
      return { success: true, message: "File already不存在" };
    }

    // Delete the file
    await client.remove(filename);
    console.log("File deleted successfully from FTP:", filename);

    return { success: true, message: "File deleted successfully" };
  } catch (error) {
    console.error("FTP Deletion Error:", error);
    throw new Error(`FTP deletion failed: ${error.message}`);
  } finally {
    client.close();
  }
}

module.exports = { deleteFromFTP, uploadToFTP };

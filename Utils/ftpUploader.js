// utils/ftpUploader.js
const ftp = require("basic-ftp");
const path = require("path");

const ftpConfig = {
  host: process.env.FTP_HOST, // your-domain.com
  user: process.env.FTP_USER, // your cPanel username
  password: process.env.FTP_PASSWORD, // your FTP password
  secure: true, // use FTPS
};

async function uploadToFTP(buffer, filename) {
  const client = new ftp.Client();

  try {
    await client.access(ftpConfig);

    // Change to your public_html directory or subfolder
    await client.ensureDir("/uploads");

    // Upload the file buffer
    await client.uploadFrom(buffer, filename);

    // Return the public URL
    return process.env.FTP_HOST + "/" + filename;
  } catch (error) {
    throw new Error(`FTP upload failed: ${error.message}`);
  } finally {
    client.close();
  }
}

module.exports = { uploadToFTP };

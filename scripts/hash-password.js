/**
 * Run: node scripts/hash-password.js
 * Outputs a bcrypt hash for the first argument (default: admin123).
 * Copy the hash into your NocoDB Users table Password field.
 */
const bcrypt = require("bcryptjs");
const password = process.argv[2] || "admin123";
const hash = bcrypt.hashSync(password, 10);
console.log("Password:", password);
console.log("Encoded (bcrypt hash):", hash);
console.log("\nPaste the hash above into the Password column in NocoDB Users table.");

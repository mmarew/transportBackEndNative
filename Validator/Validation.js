const removeWhiteSpace = (str) => str.replace(/\s+/g, "");

const input = "  Remove   all   white spaces   ";
const result = removeWhiteSpace(input);

console.log(result); // "Removeallwhitespaces"
module.exports = { removeWhiteSpace };

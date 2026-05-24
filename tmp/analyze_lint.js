const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./tmp/lint-results.json', 'utf8'));

const undefinedVars = new Set();
const missingRequires = new Set();

data.forEach(file => {
  file.messages.forEach(msg => {
    if (msg.ruleId === 'no-undef') {
      // Message format: 'foo' is not defined.
      const match = msg.message.match(/'([^']+)' is not defined/);
      if (match) undefinedVars.add(match[1]);
    } else if (msg.ruleId === 'n/no-missing-require') {
      missingRequires.add(`${file.filePath}: ${msg.message}`);
    }
  });
});

console.log('Undefined Variables:');
console.log(Array.from(undefinedVars).join(', '));
console.log('\nMissing Requires:');
missingRequires.forEach(m => console.log(m));

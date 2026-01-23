const fs = require('fs');
const code = fs.readFileSync('app/tools/api-signal-explorer/NeuromapWorkspace.tsx', 'utf8');
const lines = code.split('\n');

// Track parenthesis balance and find where it goes wrong
let parens = 0;
let parenHistory = [];

for (let i = 2224; i <= 3228; i++) {
  const line = lines[i];
  const before = parens;
  for (const char of line) {
    if (char === '(') parens++;
    if (char === ')') parens--;
  }
  if (parens < 0 && before >= 0) {
    console.log(JSON.stringify({
      hypothesis: 'C',
      location: `line-${i+1}`,
      message: 'Parenthesis went negative',
      data: { line: i+1, text: line.trim().substring(0, 80), balance: parens },
      timestamp: Date.now()
    }));
    break;
  }
  if (Math.abs(parens) <= 2) {
    parenHistory.push({ line: i+1, balance: parens, text: line.trim().substring(0, 50) });
  }
}

console.log(JSON.stringify({
  hypothesis: 'C',
  location: 'return-statement',
  message: 'Parenthesis history near boundaries',
  data: { 
    finalBalance: parens,
    history: parenHistory.slice(-10)
  },
  timestamp: Date.now()
}));

// Track brace balance and find where it goes wrong
let braces = 0;
let braceHistory = [];

for (let i = 192; i < 3230; i++) {
  const line = lines[i];
  if (line.includes('{/*') || line.includes('*/}')) continue;
  const before = braces;
  for (const char of line) {
    if (char === '{') braces++;
    if (char === '}') braces--;
  }
  if (braces < 0 && before >= 0 && i > 192) {
    console.log(JSON.stringify({
      hypothesis: 'D',
      location: `line-${i+1}`,
      message: 'Brace went negative',
      data: { line: i+1, text: line.trim().substring(0, 80), balance: braces },
      timestamp: Date.now()
    }));
  }
  if (Math.abs(braces) <= 2 && i > 2200) {
    braceHistory.push({ line: i+1, balance: braces, text: line.trim().substring(0, 50) });
  }
}

console.log(JSON.stringify({
  hypothesis: 'D',
  location: 'function-body',
  message: 'Brace history near end',
  data: { 
    finalBalance: braces,
    history: braceHistory.slice(-10)
  },
  timestamp: Date.now()
}));

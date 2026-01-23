const fs = require('fs');
const code = fs.readFileSync('app/tools/api-signal-explorer/NeuromapWorkspace.tsx', 'utf8');
const lines = code.split('\n');

// Hypothesis A: Unclosed JSX expressions in return statement
let jsxExprs = 0;
let jsxOpenLines = [];
let jsxCloseLines = [];

for (let i = 2224; i < 3229; i++) {
  const line = lines[i];
  // Count JSX expression opens: {condition && (
  const opens = (line.match(/\{[^}]*&&\s*\(/g) || []).length;
  // Count JSX expression closes: )}
  const closes = (line.match(/\}\)/g) || []).length;
  
  if (opens > 0) jsxOpenLines.push({ line: i+1, count: opens, text: line.trim().substring(0, 60) });
  if (closes > 0) jsxCloseLines.push({ line: i+1, count: closes, text: line.trim().substring(0, 60) });
  
  jsxExprs += opens - closes;
}

console.log(JSON.stringify({
  hypothesis: 'A',
  location: 'return-statement',
  message: 'JSX expression balance check',
  data: {
    finalBalance: jsxExprs,
    openCount: jsxOpenLines.length,
    closeCount: jsxCloseLines.length,
    unclosedExpressions: jsxExprs,
    firstOpenLines: jsxOpenLines.slice(0, 5),
    lastCloseLines: jsxCloseLines.slice(-5)
  },
  timestamp: Date.now()
}));

// Hypothesis B: Div tag balance
let divCount = 0;
let divOpenLines = [];
let divCloseLines = [];

for (let i = 2225; i <= 3227; i++) {
  const line = lines[i];
  const openDivs = (line.match(/<div/g) || []).length;
  const closeDivs = (line.match(/<\/div>/g) || []).length;
  
  if (openDivs > 0) divOpenLines.push({ line: i+1, count: openDivs });
  if (closeDivs > 0) divCloseLines.push({ line: i+1, count: closeDivs });
  
  divCount += openDivs - closeDivs;
}

console.log(JSON.stringify({
  hypothesis: 'B',
  location: 'return-statement',
  message: 'Div tag balance check',
  data: {
    finalBalance: divCount,
    openCount: divOpenLines.length,
    closeCount: divCloseLines.length
  },
  timestamp: Date.now()
}));

// Hypothesis C: Parenthesis balance in return statement
let parens = 0;
for (let i = 2224; i <= 3228; i++) {
  const line = lines[i];
  for (const char of line) {
    if (char === '(') parens++;
    if (char === ')') parens--;
  }
}

console.log(JSON.stringify({
  hypothesis: 'C',
  location: 'return-statement',
  message: 'Parenthesis balance check',
  data: { finalBalance: parens },
  timestamp: Date.now()
}));

// Hypothesis D: Brace balance in function
let braces = 0;
for (let i = 192; i < 3230; i++) {
  const line = lines[i];
  if (line.includes('{/*') || line.includes('*/}')) continue;
  for (const char of line) {
    if (char === '{') braces++;
    if (char === '}') braces--;
  }
}

console.log(JSON.stringify({
  hypothesis: 'D',
  location: 'function-body',
  message: 'Brace balance check',
  data: { finalBalance: braces },
  timestamp: Date.now()
}));

// Hypothesis E: Check for malformed conditional at line 2493
const line2493 = lines[2492];
const line2792 = lines[2791];
console.log(JSON.stringify({
  hypothesis: 'E',
  location: 'conditional-2493',
  message: 'Conditional structure check',
  data: {
    opening: line2493.trim(),
    closing: line2792.trim(),
    opensWithBrace: line2493.includes('{'),
    closesWithBrace: line2792.includes('}'),
    opensWithParen: line2493.includes('('),
    closesWithParen: line2792.includes(')')
  },
  timestamp: Date.now()
}));

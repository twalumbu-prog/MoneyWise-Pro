const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function main() {
  const logPath = '/Users/kim_life/.gemini/antigravity/brain/80b10205-28d2-4563-b260-5dbae585b001/.system_generated/logs/transcript.jsonl';
  if (!fs.existsSync(logPath)) {
    console.error('File does not exist at:', logPath);
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const lines = [];
  for await (const line of rl) {
    lines.push(line);
    if (lines.length > 200) {
      lines.shift();
    }
  }

  console.log(`Read ${lines.length} lines. Showing them now:`);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      // Simplify printout
      if (obj.type === 'PLANNER_RESPONSE') {
        console.log(`[MODEL STEP ${obj.step_index}] thinking: ${obj.thinking?.slice(0, 150)}...`);
        if (obj.tool_calls) {
          console.log('  Tool Calls:', JSON.stringify(obj.tool_calls));
        }
      } else if (obj.source === 'SYSTEM' && obj.content) {
        console.log(`[SYSTEM] ${obj.content.slice(0, 300)}...`);
      } else if (obj.type === 'USER_INPUT') {
        console.log(`[USER] ${obj.content}`);
      } else {
        console.log(`[STEP ${obj.step_index}] Source: ${obj.source}, Type: ${obj.type}`);
      }
    } catch (e) {
      console.log('Non-JSON line:', line.slice(0, 100));
    }
  }
}

main();

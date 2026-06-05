const fs = require('fs');
const readline = require('readline');

async function main() {
  const logPath = '/Users/kim_life/.gemini/antigravity/brain/80b10205-28d2-4563-b260-5dbae585b001/.system_generated/logs/transcript.jsonl';
  if (!fs.existsSync(logPath)) {
    console.error('File does not exist');
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 120 && obj.step_index <= 142) {
        console.log(`\nStep ${obj.step_index} | Source: ${obj.source} | Type: ${obj.type}`);
        if (obj.content) console.log(`  Content: ${obj.content.slice(0, 1000)}`);
        if (obj.tool_calls) console.log(`  Tool calls: ${JSON.stringify(obj.tool_calls)}`);
        if (obj.output) console.log(`  Output: ${JSON.stringify(obj.output).slice(0, 1000)}`);
      }
    } catch (e) {
      // Ignore
    }
  }
}

main().catch(console.error);
